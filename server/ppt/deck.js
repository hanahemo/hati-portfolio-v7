// PPT 내보내기 v2 — 홈페이지 데이터의 스냅샷을 디자이너/필름 디렉터 문법의 포트폴리오 덱으로.
// 리서치 반영(2026-07-11): 크리에이티브로 리드(풀블리드 커버) · 스테이트먼트 슬라이드 ·
// 베스트는 깊게(히어로+디테일 2장), 카탈로그는 컴팩트 · 벤토 스틸 그리드 · 기여도/성과 명시 ·
// 클라이언트 로고 슬라이드. 스펙: docs/superpowers/specs/2026-07-11-ppt-export-design.md
const PptxGenJS = require('pptxgenjs');
const fs = require('fs');
const path = require('path');
const { UPLOADS_DIR } = require('../persist');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

// ── 팔레트/타이포 — 시네마 잉크 북엔드 + 화이트 본문 (fill 말고 stroke) ──
const INK = '141416';
const PAPER = 'FFFFFF';
const MUTE = '8A8886';          // 화이트 위 뮤트
const MUTE_INK = '9C9A94';      // 잉크 위 뮤트
const SOFT_INK = 'C9C7C2';      // 잉크 위 서브텍스트
const HAIR = 'D9D7D2';
const FONT = 'Malgun Gothic';

const PW = 13.333, PH = 7.5, M = 0.55;

// ── 데이터 정제 — 웹과 동일 원칙: 글자/숫자 없는 값("." 등)은 자리표시자 ──
function filled(v) {
  const s = String(v ?? '').trim();
  return /[\p{L}\p{N}]/u.test(s) ? s : '';
}
function bulletLines(s) {
  return String(s).split('\n')
    .map(l => l.replace(/^[-•·]\s*\t?\s*/, '').trim())
    .filter(Boolean);
}
// 히어로 로어서드용 한 줄 요약 — 설명의 첫 문장/줄만
function oneLiner(s, max = 110) {
  const first = String(s || '').split('\n').map(l => l.trim()).filter(Boolean)[0] || '';
  return first.length > max ? first.slice(0, max - 1) + '…' : first;
}

// ── 미디어 해석 — 후보 체인 (죽은 업로드 우회 / Drive 권한 실패 시 다음 후보) ──
function getDriveId(url) {
  if (!url || typeof url !== 'string' || !url.includes('drive.google.com')) return '';
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : '';
}
function getYouTubeId(url) {
  const m = String(url || '').match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  return m ? m[1] : '';
}
const DIRECT_VIDEO_RE = /\.(mp4|mov|webm|m4v)(\?|#|$)/i;

function mediaCandidates(raw, w) {
  if (!raw) return [];
  const id = getDriveId(raw);
  if (id) return [
    { kind: 'url', url: `https://lh3.googleusercontent.com/d/${id}=w${w}` },
    { kind: 'url', url: `https://drive.google.com/thumbnail?id=${id}&sz=w${w}` },
  ];
  if (raw.startsWith('/uploads/')) {
    const p = path.join(UPLOADS_DIR, path.basename(raw));
    return fs.existsSync(p) && !DIRECT_VIDEO_RE.test(raw) ? [{ kind: 'file', path: p }] : [];
  }
  if (raw.startsWith('/assets/')) {
    const p = path.join(PUBLIC_DIR, raw.replace(/^\//, ''));
    return fs.existsSync(p) ? [{ kind: 'file', path: p }] : [];
  }
  if (DIRECT_VIDEO_RE.test(raw)) return [];
  const yt = getYouTubeId(raw);
  if (yt) return [{ kind: 'url', url: `https://img.youtube.com/vi/${yt}/hqdefault.jpg` }];
  if (/vimeo\.com/.test(raw)) return [];
  if (/^https?:\/\//.test(raw)) return [{ kind: 'url', url: raw }];
  return [];
}

const imgCache = new Map();
async function fetchImageDataUri(url, timeoutMs = 8000) {
  if (imgCache.has(url)) return imgCache.get(url);
  let result = null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const r = await fetch(url, { signal: ctl.signal, redirect: 'follow' });
    clearTimeout(t);
    const ct = (r.headers.get('content-type') || '').split(';')[0].trim();
    if (r.ok && ct.startsWith('image/')) {
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 100) result = `data:${ct};base64,${buf.toString('base64')}`;
    }
  } catch (_) { /* 타임아웃/네트워크 → 다음 후보 */ }
  imgCache.set(url, result);
  return result;
}

// 원시 URL 하나 해석 → pptxgenjs image props ({path}|{data}) 또는 null
async function resolveMedia(raw, w) {
  for (const c of mediaCandidates(raw, w)) {
    if (c.kind === 'file') return { path: c.path };
    const data = await fetchImageDataUri(c.url);
    if (data) return { data };
  }
  return null;
}

// 동시 5개 제한 실행기
async function withPool(jobs, size = 5) {
  const out = new Array(jobs.length).fill(null);
  let i = 0;
  const worker = async () => {
    while (i < jobs.length) { const idx = i++; out[idx] = await jobs[idx](); }
  };
  await Promise.all(Array.from({ length: Math.min(size, jobs.length) || 1 }, worker));
  return out;
}

// 프로젝트의 이미지 목록(이미지 우선 → 영상 포스터). widths 배열이 장수와 해상도를 함께 정한다 —
// 첫 성공은 widths[0](히어로), 다음은 widths[1..](벤토 스틸, 저해상도로 용량 절약).
async function projectImages(project, widths) {
  const media = Array.isArray(project.media) ? project.media : [];
  const isImg = m => (m.type || '').startsWith('image');
  const ordered = [...media.filter(isImg), ...media.filter(m => !isImg(m))];
  const out = [];
  for (const m of ordered) {
    if (out.length >= widths.length) break;
    const r = await resolveMedia(m.url, widths[out.length]);
    if (r) out.push(r);
  }
  return out;
}

// ── 슬라이드 조립 헬퍼 ──
function kickerText(s, slide, opts) {
  slide.addText(s, { fontFace: FONT, fontSize: 10, charSpacing: 3, ...opts });
}
// 시네마 로어서드 — 풀블리드 이미지 위가 아니라 잉크 밴드(불투명)라 가독성이 보장된다
function heroLowerThird(slide, { kicker, title, sub }) {
  const bandY = 5.15;
  kickerText(kicker, slide, { x: M, y: bandY + 0.28, w: PW - M * 2, h: 0.3, color: MUTE_INK });
  slide.addText(title, { x: M - 0.03, y: bandY + 0.62, w: PW - M * 2, h: 0.95, fontFace: FONT, fontSize: 27, bold: true, color: PAPER, valign: 'top', fit: 'shrink' });
  if (sub) slide.addText(sub, { x: M, y: bandY + 1.62, w: PW - M * 2, h: 0.5, fontFace: FONT, fontSize: 11.5, color: SOFT_INK, valign: 'top', fit: 'shrink' });
}

// ── 덱 빌드 ──
async function buildDeckBuffer({ portfolio, settings, scope = 'featured' }) {
  const all = Array.isArray(portfolio.projects) ? portfolio.projects : [];
  const byId = new Map(all.map(p => [p.id, p]));
  const featured = (settings.featuredProjectIds || []).map(id => byId.get(id)).filter(Boolean);
  const CAT_PRIORITY = { video: 0, photo: 1, graphic: 2 };

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'W169', width: PW, height: PH });
  pptx.layout = 'W169';
  pptx.author = 'Hati';
  pptx.company = 'Hati — Visual Creative Studio';
  pptx.title = 'Hati Portfolio';

  pptx.defineSlideMaster({
    title: 'PAPER',
    background: { color: PAPER },
    objects: [
      { text: { text: 'Hati® — Visual Creative Portfolio', options: { x: M, y: PH - 0.42, w: 5, h: 0.3, fontFace: FONT, fontSize: 8, color: MUTE, charSpacing: 2 } } },
    ],
    slideNumber: { x: PW - 0.9, y: PH - 0.42, w: 0.5, h: 0.3, fontFace: FONT, fontSize: 8, color: MUTE, align: 'right' },
  });

  // 공용 텍스트 값
  const email = filled(settings.contactEmail);
  const phone = filled(settings.contactPhone);
  const insta = filled(settings.contactInstagram);
  const instaHandle = insta ? '@' + insta.replace(/\/+$/, '').split('/').pop() : '';
  const est = filled(settings.est);
  const contactLine = [email, phone, instaHandle, 'hatist.studio'].filter(Boolean).join('   ·   ');
  const today = new Date();
  const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;

  // ── 이미지 선해석 (동시 5) ──
  const heroProjects = scope === 'all'
    ? all.slice().sort((a, b) => ((CAT_PRIORITY[a.category] ?? 9) - (CAT_PRIORITY[b.category] ?? 9)) || ((a.order ?? 0) - (b.order ?? 0)))
    : (featured.length ? featured : all.slice(0, 9));

  const widths = scope === 'all' ? [1280] : [1600, 800, 800, 800, 800];
  const jobs = heroProjects.map(p => () => projectImages(p, widths));
  jobs.push(() => resolveMedia(filled(settings.heroBackground) || '/uploads/hero-poster.jpg', 1600));   // 커버
  jobs.push(() => resolveMedia(filled(settings.aboutImage), 1000));                                      // 프로필
  const resolved = await withPool(jobs, 5);
  const projectImgs = resolved.slice(0, heroProjects.length);
  let coverImg = resolved[heroProjects.length];
  const aboutImg = resolved[heroProjects.length + 1];
  if (!coverImg) coverImg = (projectImgs.find(list => list && list.length) || [])[0] || null;

  // 로고 (로컬 파일 — 다크 사이트용 화이트 로고라 잉크 슬라이드에 얹는다)
  const logos = (Array.isArray(settings.clientLogos) ? settings.clientLogos : [])
    .map(l => mediaCandidates(l.url, 400)[0])
    .filter(c => c && c.kind === 'file')
    .map(c => ({ path: c.path }));

  // ═══ 1. 커버 — 풀블리드 이미지 + 잉크 로어서드 (크리에이티브로 리드) ═══
  {
    const s = pptx.addSlide();
    s.background = { color: INK };
    if (coverImg) s.addImage({ ...coverImg, x: 0, y: 0, w: PW, h: 5.15, sizing: { type: 'cover', w: PW, h: 5.15 } });
    kickerText(`PORTFOLIO — ${today.getFullYear()}`, s, { x: M, y: 5.45, w: 6, h: 0.3, color: MUTE_INK });
    s.addText([
      { text: filled(settings.heroTitle) || 'Hati', options: { fontSize: 44, bold: true, color: PAPER } },
      { text: '®', options: { fontSize: 18, color: MUTE_INK, superscript: true } },
    ], { x: M - 0.03, y: 5.78, w: 8, h: 0.85, fontFace: FONT });
    const sub = filled(settings.heroSubtitle);
    if (sub) s.addText(sub, { x: M, y: 6.72, w: 9.4, h: 0.4, fontFace: FONT, fontSize: 11.5, color: SOFT_INK });
    s.addText(`SEOUL${est ? ' — EST. ' + est : ''}`, { x: PW - 4.4, y: 5.5, w: 3.85, h: 0.3, fontFace: FONT, fontSize: 9.5, color: MUTE_INK, align: 'right', charSpacing: 2 });
  }

  // ═══ 2. 스테이트먼트 — philosophy 한 줄을 크게 (네거티브 스페이스) ═══
  const philosophy = filled(settings.philosophy);
  if (philosophy) {
    const s = pptx.addSlide();
    s.background = { color: INK };
    s.addText(philosophy, { x: 1.2, y: 2.5, w: PW - 2.4, h: 1.8, fontFace: FONT, fontSize: 34, bold: true, color: PAPER, align: 'center', valign: 'middle', fit: 'shrink' });
    const sub = filled(settings.heroSubtitle);
    if (sub) s.addText(sub, { x: 1.2, y: 4.5, w: PW - 2.4, h: 0.4, fontFace: FONT, fontSize: 11, color: MUTE_INK, align: 'center' });
  }

  // ═══ 3. About — 바이오 + 프로필 이미지 + 스탯 로우 ═══
  const about = filled(settings.aboutText);
  if (about) {
    const s = pptx.addSlide({ masterName: 'PAPER' });
    kickerText('ABOUT', s, { x: M, y: 0.65, w: 4, h: 0.35, color: MUTE });
    s.addShape('line', { x: M, y: 1.15, w: 1.2, h: 0, line: { color: INK, width: 1 } });
    const textW = aboutImg ? 7.2 : 10.8;
    s.addText(about, { x: M, y: 1.6, w: textW, h: 3.9, fontFace: FONT, fontSize: 14.5, color: INK, lineSpacingMultiple: 1.55, valign: 'top', fit: 'shrink' });
    if (aboutImg) s.addImage({ ...aboutImg, x: 8.3, y: 0.65, w: 4.45, h: 5.1, sizing: { type: 'cover', w: 4.45, h: 5.1 } });
    // 스탯 로우 — EST · 작품수 · 카테고리 분포
    const cats = {};
    all.forEach(p => { cats[p.category] = (cats[p.category] || 0) + 1; });
    const stats = [
      est && ['EST.', est],
      ['PROJECTS', String(all.length)],
      ['VIDEO', String(cats.video || 0)],
      ['PHOTO', String(cats.photo || 0)],
      ['GRAPHIC', String(cats.graphic || 0)],
    ].filter(Boolean);
    s.addShape('line', { x: M, y: 5.85, w: textW, h: 0, line: { color: HAIR, width: 0.75 } });
    stats.forEach(([label, value], i) => {
      const x = M + i * 1.55;
      s.addText(value, { x, y: 6.0, w: 1.45, h: 0.5, fontFace: FONT, fontSize: 22, bold: true, color: INK });
      s.addText(label, { x, y: 6.52, w: 1.45, h: 0.3, fontFace: FONT, fontSize: 8, color: MUTE, charSpacing: 2 });
    });
  }

  // ═══ 4. 클라이언트 — 화이트 로고라 잉크 배경 ═══
  if (logos.length) {
    const s = pptx.addSlide();
    s.background = { color: INK };
    kickerText('SELECTED CLIENTS', s, { x: M, y: 0.65, w: 5, h: 0.35, color: MUTE_INK });
    s.addShape('line', { x: M, y: 1.15, w: 1.2, h: 0, line: { color: PAPER, width: 1 } });
    const cols = 4, cw = 2.5, ch = 1.15, gx = 0.65, gy = 1.25;
    const rows = Math.ceil(logos.length / cols);
    const gridW = cols * cw + (cols - 1) * gx;
    const x0 = (PW - gridW) / 2;
    const y0 = (PH - (rows * ch + (rows - 1) * gy)) / 2 + 0.4;
    logos.forEach((logo, i) => {
      const cx = x0 + (i % cols) * (cw + gx);
      const cy = y0 + Math.floor(i / cols) * (ch + gy);
      s.addImage({ ...logo, x: cx, y: cy, w: cw, h: ch, sizing: { type: 'contain', w: cw, h: ch } });
    });
  }

  // ═══ 5. 인덱스 ═══
  {
    const s = pptx.addSlide({ masterName: 'PAPER' });
    kickerText(scope === 'all' ? 'INDEX — ALL WORKS' : 'INDEX — SELECTED WORKS', s, { x: M, y: 0.65, w: 6, h: 0.35, color: MUTE });
    s.addShape('line', { x: M, y: 1.15, w: 1.2, h: 0, line: { color: INK, width: 1 } });
    const rows = heroProjects.map((p, i) => ({
      text: `${String(i + 1).padStart(2, '0')}   ${p.title || '(untitled)'}`,
      options: { fontSize: heroProjects.length > 24 ? 10 : 12, color: INK, breakLine: true, paraSpaceAfter: heroProjects.length > 24 ? 4 : 7 },
    }));
    if (rows.length <= 14) {
      s.addText(rows, { x: M, y: 1.55, w: 11.5, h: 5.3, fontFace: FONT, valign: 'top', fit: 'shrink' });
    } else {
      const half = Math.ceil(rows.length / 2);
      s.addText(rows.slice(0, half), { x: M, y: 1.55, w: 6.0, h: 5.3, fontFace: FONT, valign: 'top', fit: 'shrink' });
      s.addText(rows.slice(half), { x: 6.9, y: 1.55, w: 6.0, h: 5.3, fontFace: FONT, valign: 'top', fit: 'shrink' });
    }
  }

  // ── 팩트 리치텍스트 (ROLE/CONTRIBUTION/RESULT/CREDITS — 빈 값은 줄째로 제외) ──
  function factParts(p, { compact = false } = {}) {
    const parts = [];
    const fact = (label, value, opts = {}) => {
      parts.push({ text: label, options: { fontSize: 8.5, color: MUTE, charSpacing: 3, breakLine: true, paraSpaceBefore: 10, paraSpaceAfter: 3 } });
      const items = Array.isArray(value) ? value : [value];
      items.forEach(l => parts.push({ text: l, options: { fontSize: compact ? 10 : 11, color: INK, breakLine: true, paraSpaceAfter: 2, ...opts } }));
    };
    const role = filled(p.role); if (role) fact('ROLE', role);
    const contribution = filled(p.contribution); if (contribution) fact('CONTRIBUTION', contribution);
    const result = filled(p.result); if (result) fact('RESULT', bulletLines(result).map(l => '·  ' + l));
    const credits = Array.isArray(p.credits) ? p.credits.filter(c => c && (filled(c.role) || filled(c.name))) : [];
    if (credits.length) {
      const cap = compact ? 5 : 8;
      const lines = credits.slice(0, cap).map(c => [filled(c.role), filled(c.name)].filter(Boolean).join(' — '));
      if (credits.length > cap) lines.push(`외 ${credits.length - cap}`);
      fact('CREDITS', lines, { fontSize: 9, color: MUTE });
    }
    return parts;
  }

  // ═══ 6. 프로젝트 장표 ═══
  if (scope === 'all') {
    // 카탈로그 — 카테고리 디바이더 + 작품당 컴팩트 1장 (베스트는 featured 덱에서 깊게)
    const CAT_LABEL = { video: 'VIDEO', photo: 'PHOTO', graphic: 'GRAPHIC' };
    let lastCat = null;
    heroProjects.forEach((p, i) => {
      if (p.category !== lastCat) {
        lastCat = p.category;
        const d = pptx.addSlide();
        d.background = { color: INK };
        const count = heroProjects.filter(x => x.category === p.category).length;
        d.addText(CAT_LABEL[p.category] || String(p.category || '').toUpperCase(), { x: M, y: 2.75, w: 12.2, h: 1.5, fontFace: FONT, fontSize: 76, bold: true, color: PAPER });
        kickerText(`${count} PROJECTS`, d, { x: M + 0.05, y: 4.35, w: 6, h: 0.35, color: MUTE_INK });
      }
      const s = pptx.addSlide({ masterName: 'PAPER' });
      const img = (projectImgs[i] || [])[0];
      if (img) s.addImage({ ...img, x: 0, y: 0, w: 6.66, h: PH, sizing: { type: 'cover', w: 6.66, h: PH } });
      const tx = img ? 7.15 : 0.9;
      const tw = img ? 5.6 : 11.5;
      const parts = [
        { text: `${String(i + 1).padStart(2, '0')} — ${String(p.category || '').toUpperCase()}`, options: { fontSize: 10, color: MUTE, charSpacing: 3, breakLine: true, paraSpaceAfter: 10 } },
        { text: p.title || '(untitled)', options: { fontSize: 23, bold: true, color: INK, breakLine: true, paraSpaceAfter: 6 } },
      ];
      const tags = Array.isArray(p.tags) ? p.tags.filter(filled) : [];
      if (tags.length) parts.push({ text: tags.join(' · '), options: { fontSize: 10, color: MUTE, breakLine: true, paraSpaceAfter: 6 } });
      parts.push(...factParts(p, { compact: true }));
      s.addText(parts, { x: tx, y: 0.8, w: tw, h: PH - 1.5, fontFace: FONT, valign: 'top', fit: 'shrink' });
    });
  } else {
    // 케이스스터디 — 작품당 히어로(풀블리드+로어서드) + 디테일(팩트 칼럼 + 벤토 스틸)
    heroProjects.forEach((p, i) => {
      const imgs = projectImgs[i] || [];
      const [heroImg, ...stills] = imgs;
      const tags = Array.isArray(p.tags) ? p.tags.filter(filled) : [];
      const kicker = [`${String(i + 1).padStart(2, '0')} — ${String(p.category || '').toUpperCase()}`, tags.join(' · ')].filter(Boolean).join('     ');
      const desc = oneLiner(p.description);

      // 히어로
      const s = pptx.addSlide();
      s.background = { color: INK };
      if (heroImg) {
        s.addImage({ ...heroImg, x: 0, y: 0, w: PW, h: 5.15, sizing: { type: 'cover', w: PW, h: 5.15 } });
        heroLowerThird(s, { kicker, title: p.title || '(untitled)', sub: desc });
      } else {
        // 이미지가 하나도 없으면 타이포 히어로
        s.addText(String(i + 1).padStart(2, '0'), { x: M, y: 0.9, w: 5, h: 2.0, fontFace: FONT, fontSize: 110, bold: true, color: '2A2A2E' });
        heroLowerThird(s, { kicker, title: p.title || '(untitled)', sub: desc });
      }

      // 디테일 — 팩트나 스틸이 있을 때만
      const parts = factParts(p);
      if (!parts.length && !stills.length) return;
      const d = pptx.addSlide({ masterName: 'PAPER' });
      kickerText(`${String(i + 1).padStart(2, '0')} — ${p.title || ''}`, d, { x: M, y: 0.6, w: 8, h: 0.3, color: MUTE });
      d.addShape('line', { x: M, y: 1.0, w: 1.2, h: 0, line: { color: INK, width: 1 } });
      if (stills.length) {
        if (parts.length) d.addText(parts, { x: M, y: 1.3, w: 4.35, h: 5.6, fontFace: FONT, valign: 'top', fit: 'shrink' });
        // 벤토 그리드 — 1:단독 / 2:세로 2단 / 3:큰 1 + 작은 2 / 4:2×2
        const bx = parts.length ? 5.35 : M, bw = PW - bx - M, by = 1.3, bh = 5.6, g = 0.18;
        const cell = (img, x, y, w, h) => d.addImage({ ...img, x, y, w, h, sizing: { type: 'cover', w, h } });
        const n = Math.min(stills.length, 4);
        if (n === 1) cell(stills[0], bx, by, bw, bh);
        else if (n === 2) { const w = (bw - g) / 2; cell(stills[0], bx, by, w, bh); cell(stills[1], bx + w + g, by, w, bh); }
        else if (n === 3) { const w = (bw - g) / 2, h = (bh - g) / 2; cell(stills[0], bx, by, w, bh); cell(stills[1], bx + w + g, by, w, h); cell(stills[2], bx + w + g, by + h + g, w, h); }
        else { const w = (bw - g) / 2, h = (bh - g) / 2; cell(stills[0], bx, by, w, h); cell(stills[1], bx + w + g, by, w, h); cell(stills[2], bx, by + h + g, w, h); cell(stills[3], bx + w + g, by + h + g, w, h); }
      } else {
        // 스틸 없음 — 팩트를 2단으로 넓게
        const half = Math.ceil(parts.length / 2);
        // 라벨 경계에서 쪼갠다 (라벨=paraSpaceBefore 있는 파트)
        let split = half;
        for (let k = half; k < parts.length; k++) { if (parts[k].options.paraSpaceBefore) { split = k; break; } }
        d.addText(parts.slice(0, split), { x: M, y: 1.3, w: 5.8, h: 5.6, fontFace: FONT, valign: 'top', fit: 'shrink' });
        if (parts.length > split) d.addText(parts.slice(split), { x: 6.8, y: 1.3, w: 5.8, h: 5.6, fontFace: FONT, valign: 'top', fit: 'shrink' });
      }
    });
  }

  // ═══ 7. 클로징 ═══
  {
    const s = pptx.addSlide();
    s.background = { color: INK };
    s.addText("Let's create together.", { x: M, y: 2.6, w: 12.2, h: 1.0, fontFace: FONT, fontSize: 40, bold: true, color: PAPER });
    const lines = [email, phone, instaHandle && `Instagram ${instaHandle}`, 'hatist.studio'].filter(Boolean)
      .map(t => ({ text: t, options: { fontSize: 13, color: SOFT_INK, breakLine: true, paraSpaceAfter: 6 } }));
    if (lines.length) s.addText(lines, { x: M + 0.03, y: 4.0, w: 10, h: 1.8, fontFace: FONT, valign: 'top' });
    s.addText(`Generated from hatist.studio — ${dateStr}`, { x: M + 0.03, y: PH - 0.5, w: 8, h: 0.3, fontFace: FONT, fontSize: 8, color: MUTE_INK, charSpacing: 2 });
  }

  return pptx.write({ outputType: 'nodebuffer' });
}

module.exports = { buildDeckBuffer, filled };
