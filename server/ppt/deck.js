// PPT 내보내기 v3 — 필름 디렉터스 트리트먼트 문법.
// 레퍼런스(Behance 트리트먼트 덱 실물 검수): 풀블리드 스틸 위에 큰 세리프 디스플레이 타이포,
// 텍스트 존은 이미지에 '구운' 스크림으로 확보, 괄호 페이지 넘버 (02), 코너 메타 레일.
//
// 왜곡 사고의 교훈(2026-07-11): pptxgenjs 의 sizing:cover 는 Node 에서 원본 크기를 못 읽어
// 조용히 스트레치된다. 크롭·스크림·리사이즈는 전부 sharp 로 이미지에 직접 굽고,
// PPT 에는 '정확히 그 비율의 완성된 이미지'만 얹는다. (attention 크롭 — 인물 보존)
//
// 아키텍처: 데이터 → 슬라이드 스펙(JSON) → PPTX 렌더러 + HTML 프리뷰 렌더러(스크린샷 검수용).
// 스펙: docs/superpowers/specs/2026-07-11-ppt-export-design.md

const PptxGenJS = require('pptxgenjs');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { UPLOADS_DIR } = require('../persist');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

// ── 팔레트/타이포 ──
const INK = '141416';
const PAPER = 'F4F2EE';         // 순백보다 따뜻한 지면
const WHITE = 'FFFFFF';
const MUTE = '8A8886';
const MUTE_INK = 'A8A6A0';
const SOFT_INK = 'D6D4CF';
const HAIR = 'DDDAD4';
const SERIF = 'Georgia';        // 디스플레이(영문) — Win/Mac 공통 탑재
const SANS = 'Malgun Gothic';   // 한글 본문/타이틀
const KEY = 'C7B9FF';           // 브랜드 키(라벤더) — 커버 워드마크 악센트. ponytail: 솔리드(PPT는 그라데이션 텍스트 불가)

const PW = 13.333, PH = 7.5, M = 0.62;
const DPI = 150;                 // 이미지 픽셀 밀도 (인치 → px)
const px = inch => Math.round(inch * DPI);

// ── 데이터 정제 ──
function filled(v) {
  const s = String(v ?? '').trim();
  return /[\p{L}\p{N}]/u.test(s) ? s : '';
}
function bulletLines(s) {
  return String(s).split('\n').map(l => l.replace(/^[-•·]\s*\t?\s*/, '').trim()).filter(Boolean);
}
function oneLiner(s, max = 120) {
  const first = String(s || '').split('\n').map(l => l.trim()).filter(Boolean)[0] || '';
  return first.length > max ? first.slice(0, max - 1) + '…' : first;
}
// 디렉터 노트 정돈 — 문단은 살리되 문단 내부 하드 줄바꿈은 흐르는 산문으로 접는다.
// (자리표시자 '.' 줄·빈 줄 제거) 좁은 칼럼에서 줄 수가 폭발하지 않게. maxChars 로 총량 제한.
function cleanNote(s, maxChars = 460) {
  const paras = String(s || '')
    .split(/\n\s*\n+/)
    .map(p => p.split('\n').map(l => l.trim()).filter(l => /[\p{L}\p{N}]/u.test(l)).join(' ').trim())
    .filter(Boolean);
  let out = [], total = 0;
  for (const p of paras) {
    if (total + p.length > maxChars && out.length) break;
    out.push(p); total += p.length;
  }
  let joined = out.join('\n');
  if (joined.length > maxChars) joined = joined.slice(0, maxChars - 1).replace(/\s+\S*$/, '') + '…';
  return joined;
}
const nn = i => String(i).padStart(2, '0');

// ── 미디어 소스 해석 (후보 체인 — 죽은 업로드/권한 실패 우회) ──
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

const bufCache = new Map();
async function fetchBuffer(url, timeoutMs = 8000) {
  if (bufCache.has(url)) return bufCache.get(url);
  let result = null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const r = await fetch(url, { signal: ctl.signal, redirect: 'follow' });
    clearTimeout(t);
    const ct = (r.headers.get('content-type') || '').split(';')[0].trim();
    if (r.ok && ct.startsWith('image/')) {
      const b = Buffer.from(await r.arrayBuffer());
      if (b.length > 100) result = b;
    }
  } catch (_) { /* 다음 후보로 */ }
  bufCache.set(url, result);
  return result;
}
async function resolveBuffer(raw, w) {
  for (const c of mediaCandidates(raw, w)) {
    if (c.kind === 'file') { try { return fs.readFileSync(c.path); } catch (_) { continue; } }
    const b = await fetchBuffer(c.url);
    if (b) return b;
  }
  return null;
}

// ── sharp 가공 — 크롭/스크림을 이미지에 굽는다 ──
// scrim: 'bottom'(로어서드용 하단 그라데이션) | 'full'(전체 은은한 암막) | null
async function bakeImage(buf, wIn, hIn, { scrim = null, position = 'attention', quality = 78 } = {}) {
  const w = px(wIn), h = px(hIn);
  try {
    let pipe = sharp(buf).rotate().resize(w, h, { fit: 'cover', position });
    if (scrim) {
      const stops = scrim === 'bottom'
        ? `<stop offset="0.42" stop-color="#0b0b0d" stop-opacity="0"/><stop offset="0.72" stop-color="#0b0b0d" stop-opacity="0.55"/><stop offset="1" stop-color="#0b0b0d" stop-opacity="0.88"/>`
        : `<stop offset="0" stop-color="#0b0b0d" stop-opacity="0.38"/><stop offset="1" stop-color="#0b0b0d" stop-opacity="0.38"/>`;
      const svg = Buffer.from(
        `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
        `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient></defs>` +
        `<rect width="100%" height="100%" fill="url(#g)"/></svg>`
      );
      pipe = pipe.composite([{ input: svg }]);
    }
    const out = await pipe.jpeg({ quality, mozjpeg: true }).toBuffer();
    return 'data:image/jpeg;base64,' + out.toString('base64');
  } catch (_) { return null; }   // 손상 이미지 → 없는 셈 친다
}
// 로고 — 비율 유지 리사이즈(투명 보존), 배치 크기(인치)도 함께 반환
async function bakeLogo(buf, maxWIn, maxHIn) {
  try {
    const meta = await sharp(buf).metadata();
    if (!meta.width || !meta.height) return null;
    const scale = Math.min((px(maxWIn)) / meta.width, (px(maxHIn)) / meta.height, 1);
    const w = Math.max(1, Math.round(meta.width * scale)), h = Math.max(1, Math.round(meta.height * scale));
    // 모노톤 처리 — 홈페이지 marquee 의 brightness(0) invert(0.92) 와 동일한 톤(#EBEBEB).
    // 원색 로고들이 잉크 지면에서 제각각 튀지 않게 알파를 마스크로 단색 화이트그레이 실루엣으로 굽는다.
    let out;
    if ((meta.channels || 3) >= 4 || meta.hasAlpha) {
      const alpha = await sharp(buf).resize(w, h).ensureAlpha().extractChannel('alpha').toBuffer();
      out = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 235, g: 235, b: 235 } } })
        .joinChannel(alpha).png().toBuffer();
    } else {
      out = await sharp(buf).resize(w, h).grayscale().png().toBuffer();   // 알파 없는 로고 폴백
    }
    return { data: 'data:image/png;base64,' + out.toString('base64'), w: w / DPI, h: h / DPI };
  } catch (_) { return null; }
}

async function withPool(jobs, size = 5) {
  const out = new Array(jobs.length).fill(null);
  let i = 0;
  const worker = async () => { while (i < jobs.length) { const idx = i++; out[idx] = await jobs[idx](); } };
  await Promise.all(Array.from({ length: Math.min(size, jobs.length) || 1 }, worker));
  return out;
}

// 프로젝트의 원시 이미지 버퍼 목록 — coverImage(장표 지정 커버) 우선, 이미지 → 영상 포스터 순
async function projectBuffers(project, max, w) {
  const media = Array.isArray(project.media) ? project.media : [];
  const isImg = m => (m.type || '').startsWith('image');
  const urls = [];
  if (filled(project.coverImage)) urls.push(project.coverImage);
  urls.push(...media.filter(isImg).map(m => m.url), ...media.filter(m => !isImg(m)).map(m => m.url));
  const out = [];
  const seen = new Set();
  for (const u of urls) {
    if (out.length >= max) break;
    if (seen.has(u)) continue; seen.add(u);
    const b = await resolveBuffer(u, w);
    if (b) out.push(b);
  }
  return out;
}

// ═══════════════════════ 슬라이드 스펙 빌더 ═══════════════════════
// 스펙 요소: {type:'text'|'image'|'line', x,y,w,h(inch), ...스타일}
// 텍스트 스타일: text|runs, font('serif'|'sans'), size(pt), bold, italic, color(hex),
//               align, valign, charSpacing, lineSpacingMultiple, shrink
// 코너 메타 레일 — 모든 프레임에 흐르는 타임코드 (Printed Light: 시스템이 흔들리지 않을 때 이미지가 자유롭다)
function railTop(slide, year, dark = true) {
  const c = dark ? MUTE_INK : MUTE;
  slide.push(
    { type: 'text', text: 'HATI®', x: M, y: 0.34, w: 2, h: 0.28, font: 'sans', size: 9, color: c, charSpacing: 3 },
    { type: 'text', text: `PORTFOLIO — ${year}`, x: PW - 4 - M, y: 0.34, w: 4, h: 0.28, font: 'sans', size: 9, color: c, charSpacing: 3, align: 'right' },
  );
}
// 괄호 페이지 번호 — 필름 롤의 각인처럼 매 장 같은 자리에
function pageNo(slide, n, dark) {
  slide.push({ type: 'text', text: `( ${nn(n)} )`, x: PW / 2 - 1, y: PH - 0.52, w: 2, h: 0.3, font: 'serif', italic: true, size: 10.5, color: dark ? MUTE_INK : MUTE, align: 'center' });
}

async function buildSpecs({ portfolio, settings, scope }) {
  const all = Array.isArray(portfolio.projects) ? portfolio.projects : [];
  const byId = new Map(all.map(p => [p.id, p]));
  const featured = (settings.featuredProjectIds || []).map(id => byId.get(id)).filter(Boolean);
  const CAT_PRIORITY = { video: 0, photo: 1, graphic: 2 };
  const projects = scope === 'all'
    ? all.slice().sort((a, b) => ((CAT_PRIORITY[a.category] ?? 9) - (CAT_PRIORITY[b.category] ?? 9)) || ((a.order ?? 0) - (b.order ?? 0)))
    : (featured.length ? featured : all.slice(0, 9));

  const deck = settings.deck || {};
  const email = filled(settings.contactEmail);
  const phone = filled(settings.contactPhone);
  const insta = filled(settings.contactInstagram);
  const instaHandle = insta ? '@' + insta.replace(/\/+$/, '').split('/').pop() : '';
  const est = filled(settings.est);
  const year = new Date().getFullYear();
  const dateStr = `${year}.${nn(new Date().getMonth() + 1)}.${nn(new Date().getDate())}`;

  // ── 원시 버퍼 수집 (풀 5) ──
  const maxImgs = scope === 'all' ? 1 : 7;
  const jobs = projects.map(p => () => projectBuffers(p, maxImgs, 1600));
  jobs.push(async () => {
    const raw = filled(settings.heroBackground) || '/uploads/hero-poster.jpg';
    return (await resolveBuffer(raw, 1920)) || (await projectBuffers(projects[0] || {}, 1, 1600))[0] || null;
  });
  jobs.push(() => filled(settings.aboutImage) ? resolveBuffer(settings.aboutImage, 1000) : null);
  const resolved = await withPool(jobs, 5);
  const rawImgs = resolved.slice(0, projects.length);
  const aboutBuf = resolved[projects.length];   // 커버는 사진을 쓰지 않는다(타이포 전용) — hero-poster 는 인물이라 뺐다

  // 로고
  const logoBufs = await withPool((Array.isArray(settings.clientLogos) ? settings.clientLogos : [])
    .map(l => () => resolveBuffer(l.url, 600)), 5);

  const slides = [];   // {bg, dark, els:[]}
  let pageCounter = 0;
  const newSlide = (bg, dark) => { const s = { bg, dark, els: [] }; slides.push(s); pageCounter++; return s; };
  const indexPatch = [];   // 인덱스 → 실제 장표 번호 매핑 (프로젝트 장표 생성 후 2-pass 로 기입)
  const projPage = [];     // projIdx → 해당 프로젝트 첫 장표 번호

  // ═══ 1. 커버 — 타이포 전용 (잉크 지면, 사진 없음). 세리프 워드마크가 주인공 ═══
  {
    const s = newSlide(INK, true);
    railTop(s.els, year);
    const headline = filled(deck.coverHeadline) || 'Visual Creative Portfolio';
    const sub = filled(settings.heroSubtitle);
    // 상단 얇은 규칙 + 카테고리 캡션으로 프레임을 잡는다
    s.els.push(
      { type: 'text', text: 'PORTFOLIO', x: M, y: 2.35, w: 6, h: 0.32, font: 'sans', size: 11, color: MUTE_INK, charSpacing: 5 },
      { type: 'text', runs: [
          { text: 'Hati', font: 'serif', italic: true, size: 118, color: KEY },
          { text: ' ®', font: 'sans', size: 22, color: MUTE_INK, superscript: true },   // 나브 위첨자 ® 문법과 정렬
        ], x: M - 0.06, y: 2.75, w: PW - M * 2, h: 1.95 },
      { type: 'text', text: headline, x: M, y: 4.78, w: 10.5, h: 0.5, font: 'sans', size: 15, color: SOFT_INK, charSpacing: 1 },
    );
    if (sub) s.els.push({ type: 'text', text: sub.toUpperCase(), x: M, y: 5.32, w: 10.5, h: 0.35, font: 'sans', size: 9.5, color: MUTE_INK, charSpacing: 2 });
    // 하단 메타 스트립
    s.els.push({ type: 'line', x: M, y: 6.72, w: PW - M * 2, color: '5A5852', width: 0.5 });
    s.els.push(
      { type: 'text', text: [email, phone, instaHandle].filter(Boolean).join('    ·    '), x: M, y: 6.9, w: 9, h: 0.3, font: 'sans', size: 9.5, color: MUTE_INK },
      { type: 'text', text: `SEOUL${est ? ' — EST. ' + est : ''}`, x: PW - 4.2 - M, y: 6.9, w: 4.2, h: 0.3, font: 'sans', size: 9.5, color: MUTE_INK, align: 'right', charSpacing: 2 },
    );
  }

  // ═══ 2. 스테이트먼트 — 타이포 온리 (네거티브 스페이스) ═══
  const statement = filled(deck.statement) || filled(settings.philosophy);
  if (statement) {
    const s = newSlide(INK, true);
    railTop(s.els, year);
    s.els.push(
      { type: 'text', text: statement, x: 1.4, y: 2.75, w: PW - 2.8, h: 1.9, font: 'serif', italic: true, size: 38, color: WHITE, align: 'center', valign: 'middle', shrink: true, lineSpacingMultiple: 1.2 },
    );
    const sub = filled(settings.heroSubtitle);
    if (sub) s.els.push({ type: 'text', text: sub.toUpperCase(), x: 1.4, y: 5.1, w: PW - 2.8, h: 0.35, font: 'sans', size: 9.5, color: MUTE_INK, align: 'center', charSpacing: 2 });
    pageNo(s.els, pageCounter, true);
  }

  // ═══ 3. 디렉터 노트 / About — 좌 프로필, 우 에디토리얼 ═══
  const introText = filled(deck.introText) || filled(settings.aboutText);
  if (introText) {
    const s = newSlide(PAPER, false);
    const img = aboutBuf && await bakeImage(aboutBuf, 5.4, PH, { position: 'attention', quality: 80 });
    if (img) s.els.push({ type: 'image', data: img, x: 0, y: 0, w: 5.4, h: PH });
    const tx = img ? 6.15 : M, tw = img ? PW - 6.15 - M : PW - M * 2;
    s.els.push({ type: 'text', text: `PORTFOLIO — ${year}`, x: PW - 4 - M, y: 0.34, w: 4, h: 0.28, font: 'sans', size: 9, color: MUTE, charSpacing: 3, align: 'right' });
    s.els.push(
      { type: 'text', text: 'Introduction', x: tx, y: 0.85, w: tw, h: 0.75, font: 'serif', italic: true, size: 34, color: INK },
      { type: 'line', x: tx + 0.02, y: 1.78, w: 1.1, color: INK, width: 1 },
      { type: 'text', text: introText, x: tx, y: 2.15, w: tw, h: 3.2, font: 'sans', size: 12.5, color: INK, lineSpacingMultiple: 1.6, valign: 'top', shrink: true },
    );
    // 서비스 (deck.services 줄단위) 또는 스탯 로우
    const services = filled(deck.services) ? deck.services.split('\n').map(t => t.trim()).filter(Boolean) : [];
    if (services.length) {
      s.els.push({ type: 'text', text: 'SERVICES', x: tx, y: 5.55, w: 3, h: 0.28, font: 'sans', size: 8.5, color: MUTE, charSpacing: 3 });
      s.els.push({ type: 'text', text: services.map(t => '·  ' + t).join('\n'), x: tx, y: 5.9, w: tw, h: 1.15, font: 'sans', size: 10.5, color: INK, lineSpacingMultiple: 1.35, valign: 'top', shrink: true });
    } else {
      const cats = {}; all.forEach(p => { cats[p.category] = (cats[p.category] || 0) + 1; });
      const stats = [est && ['EST.', est], ['PROJECTS', String(all.length)], ['VIDEO', String(cats.video || 0)], ['PHOTO', String(cats.photo || 0)], ['GRAPHIC', String(cats.graphic || 0)]].filter(Boolean);
      s.els.push({ type: 'line', x: tx, y: 5.62, w: tw, color: HAIR, width: 0.75 });
      stats.forEach(([label, value], i) => {
        const x = tx + i * 1.35;
        s.els.push(
          { type: 'text', text: value, x, y: 5.82, w: 1.3, h: 0.5, font: 'serif', size: 21, color: INK },
          { type: 'text', text: label, x, y: 6.36, w: 1.3, h: 0.26, font: 'sans', size: 7.5, color: MUTE, charSpacing: 2 },
        );
      });
    }
    pageNo(s.els, pageCounter, false);
  }

  // ═══ 4. 클라이언트 ═══
  const logos = (await withPool(logoBufs.filter(Boolean).map(b => () => bakeLogo(b, 2.2, 0.85)), 5)).filter(Boolean);
  if (logos.length) {
    const s = newSlide(INK, true);
    railTop(s.els, year);
    s.els.push({ type: 'text', text: 'Selected Clients', x: M, y: 0.95, w: 8, h: 0.75, font: 'serif', italic: true, size: 34, color: WHITE });
    const cols = 4;
    const rows = Math.ceil(logos.length / cols);
    const cellW = 2.85, cellH = 1.5, gridW = cols * cellW, gridH = rows * cellH;
    const x0 = (PW - gridW) / 2, y0 = (PH - gridH) / 2 + 0.55;
    logos.forEach((logo, i) => {
      const cx = x0 + (i % cols) * cellW + (cellW - logo.w) / 2;
      const cy = y0 + Math.floor(i / cols) * cellH + (cellH - logo.h) / 2;
      s.els.push({ type: 'image', data: logo.data, x: cx, y: cy, w: logo.w, h: logo.h });
    });
    pageNo(s.els, pageCounter, true);
  }

  // ═══ 5. 인덱스 ═══
  {
    const s = newSlide(PAPER, false);
    railTop(s.els, year, false);
    s.els.push(
      { type: 'text', text: 'Index', x: M, y: 0.85, w: 6, h: 0.75, font: 'serif', italic: true, size: 34, color: INK },
      { type: 'line', x: M + 0.02, y: 1.78, w: 1.1, color: INK, width: 1 },
    );
    const rows = projects.map((p, i) => {
      const meta = [filled(p.client), filled(p.year)].filter(Boolean).join(', ');
      return { no: `( ${nn(i + 1)} )`, title: p.title || '(untitled)', meta: meta || String(p.category || '').toUpperCase() };
    });
    const colCount = rows.length > 12 ? 2 : 1;
    const per = Math.ceil(rows.length / colCount);
    const colW = colCount === 1 ? 9.5 : 5.85;
    for (let c = 0; c < colCount; c++) {
      const runs = [];
      rows.slice(c * per, (c + 1) * per).forEach((r, k) => {
        runs.push({ text: r.no + '   ', font: 'serif', italic: true, size: rows.length > 24 ? 9 : 10.5, color: MUTE });
        runs.push({ text: r.title, font: 'sans', size: rows.length > 24 ? 10 : 12, color: INK, bold: false });
        const metaRun = { text: '   —  ' + r.meta, font: 'sans', size: rows.length > 24 ? 8 : 9, color: MUTE, breakLine: true, paraSpaceAfter: rows.length > 24 ? 5 : 9 };
        runs.push(metaRun);
        indexPatch.push({ run: metaRun, projIdx: c * per + k });   // 실제 장표 번호는 프로젝트 장표가 다 잡힌 뒤 채운다
      });
      s.els.push({ type: 'text', runs, x: M + c * 6.35, y: 2.15, w: colW, h: 4.7, valign: 'top', shrink: true });
    }
    pageNo(s.els, pageCounter, false);
  }

  // ── 팩트 리치텍스트 — (A)(B) 에디토리얼 마커로 블록을 넘버링 (Filmsupply 각주 문법) ──
  function factRuns(p, { compact = false } = {}) {
    const runs = [];
    let markerIdx = 0;
    const fact = (label, value, opts = {}) => {
      const marker = `( ${String.fromCharCode(65 + markerIdx++)} )  `;
      runs.push({ text: marker, font: 'serif', italic: true, size: 8.5, color: MUTE, paraSpaceBefore: 11 });
      runs.push({ text: label, font: 'sans', size: 8.5, color: MUTE, charSpacing: 3, breakLine: true, paraSpaceAfter: 3 });
      (Array.isArray(value) ? value : [value]).forEach(l =>
        runs.push({ text: l, font: 'sans', size: compact ? 10 : 11, color: INK, breakLine: true, paraSpaceAfter: 2, ...opts }));
    };
    const client = filled(p.client); const yearF = filled(p.year);
    if (client || yearF) fact('CLIENT', [client, yearF].filter(Boolean).join(' — '));
    const role = filled(p.role); if (role) fact('ROLE', role);
    const contribution = filled(p.contribution); if (contribution) fact('CONTRIBUTION', contribution);
    const result = filled(p.result); if (result) fact('RESULT', bulletLines(result).map(l => '·  ' + l));
    const credits = Array.isArray(p.credits) ? p.credits.filter(c => c && (filled(c.role) || filled(c.name))) : [];
    if (credits.length) {
      const cap = compact ? 5 : 8;
      const lines = credits.slice(0, cap).map(c => [filled(c.role), filled(c.name)].filter(Boolean).join(' — '));
      if (credits.length > cap) lines.push(`외 ${credits.length - cap}`);
      fact('CREDITS', lines, { size: 9, color: MUTE });
    }
    runs.factCount = markerIdx;   // 블록 수 — 레이아웃 분기(인라인/스킵)는 run 수가 아니라 블록 수로 판단
    return runs;
  }

  // ═══ 6. 프로젝트 ═══
  if (scope === 'all') {
    const CAT_LABEL = { video: 'Video', photo: 'Photo', graphic: 'Graphic' };
    let lastCat = null;
    for (let i = 0; i < projects.length; i++) {
      const p = projects[i];
      if (p.category !== lastCat) {
        lastCat = p.category;
        const d = newSlide(INK, true);
        railTop(d.els, year);
        const count = projects.filter(x => x.category === p.category).length;
        d.els.push(
          { type: 'text', text: CAT_LABEL[p.category] || String(p.category || ''), x: M, y: 2.6, w: 12, h: 1.7, font: 'serif', italic: true, size: 88, color: WHITE },
          { type: 'text', text: `${count} PROJECTS`, x: M + 0.08, y: 4.5, w: 6, h: 0.32, font: 'sans', size: 10, color: MUTE_INK, charSpacing: 3 },
        );
      }
      const meta = [filled(p.client), filled(p.year)].filter(Boolean).join(' — ');
      const tagLine = [String(p.category || '').toUpperCase(), ...(Array.isArray(p.tags) ? p.tags.filter(filled) : [])].join(' · ');
      const sum = filled(p.deckSummary) || '';
      const facts = factRuns(p, { compact: true });
      const buf = (rawImgs[i] || [])[0];

      // 팩트도 요약도 빈약하면 스플릿 우측이 빈 종이가 된다 — 풀블리드 히어로로 전환 (이미지가 주인공)
      if (buf && !sum && (facts.factCount || 0) < 2) {
        const s = newSlide(INK, true);
        projPage[i] = pageCounter;
        const img = await bakeImage(buf, PW, PH, { scrim: 'bottom', position: 'attention', quality: 78 });
        if (img) s.els.push({ type: 'image', data: img, x: 0, y: 0, w: PW, h: PH });
        s.els.push(
          { type: 'text', runs: [
              { text: `( ${nn(i + 1)} )`, font: 'serif', italic: true, size: 12, color: SOFT_INK },
              { text: '    ' + tagLine + (meta ? `    —    ${meta}` : ''), font: 'sans', size: 9, color: SOFT_INK, charSpacing: 2 },
            ], x: M, y: 5.75, w: PW - M * 2, h: 0.32 },
          { type: 'text', text: p.title || '(untitled)', x: M - 0.02, y: 6.1, w: PW - M * 2, h: 0.75, font: 'sans', size: 25, bold: true, color: WHITE, valign: 'top', shrink: true },
        );
        pageNo(s.els, pageCounter, true);
        continue;
      }

      const s = newSlide(PAPER, false);
      projPage[i] = pageCounter;
      const img = buf && await bakeImage(buf, 6.4, PH, { position: 'attention' });
      if (img) s.els.push({ type: 'image', data: img, x: 0, y: 0, w: 6.4, h: PH });
      const tx = img ? 7.0 : M, tw = img ? PW - 7.0 - M : PW - M * 2;
      const runs = [
        { text: `( ${nn(i + 1)} )`, font: 'serif', italic: true, size: 12, color: MUTE, breakLine: true, paraSpaceAfter: 12 },
        { text: p.title || '(untitled)', font: 'sans', size: 21, bold: true, color: INK, breakLine: true, paraSpaceAfter: 5 },
      ];
      if (meta) runs.push({ text: meta, font: 'sans', size: 10.5, color: INK, breakLine: true, paraSpaceAfter: 3 });
      runs.push({ text: tagLine, font: 'sans', size: 9, color: MUTE, breakLine: true, paraSpaceAfter: 6, charSpacing: 1 });
      if (sum) runs.push({ text: sum, font: 'sans', size: 10.5, color: INK, breakLine: true, paraSpaceAfter: 4, lineSpacingMultiple: 1.4 });
      runs.push(...facts);
      s.els.push({ type: 'text', runs, x: tx, y: 0.85, w: tw, h: PH - 1.6, valign: 'top', shrink: true });
      pageNo(s.els, pageCounter, false);
    }
  } else {
    for (let i = 0; i < projects.length; i++) {
      const p = projects[i];
      const bufs = rawImgs[i] || [];
      const title = p.title || '(untitled)';
      const meta = [filled(p.client), filled(p.year)].filter(Boolean).join(' — ');
      const tagLine = [String(p.category || '').toUpperCase(), ...(Array.isArray(p.tags) ? p.tags.filter(filled) : []).slice(0, 4)].join(' · ');
      const summary = filled(p.deckSummary) || oneLiner(p.description);

      // ── 히어로: 풀블리드 + 구운 하단 스크림, 트리트먼트 타이포 ──
      const s = newSlide(INK, true);
      projPage[i] = pageCounter;
      const heroImg = bufs[0] && await bakeImage(bufs[0], PW, PH, { scrim: 'bottom', position: 'attention', quality: 80 });
      if (heroImg) s.els.push({ type: 'image', data: heroImg, x: 0, y: 0, w: PW, h: PH });
      railTop(s.els, year);
      if (!heroImg) s.els.push({ type: 'text', text: nn(i + 1), x: PW - 4.4, y: 0.7, w: 3.8, h: 2.6, font: 'serif', italic: true, size: 150, color: '26262A', align: 'right' });
      s.els.push(
        { type: 'text', runs: [
            { text: `( ${nn(i + 1)} )`, font: 'serif', italic: true, size: 13, color: SOFT_INK },
            { text: '    ' + tagLine + (meta ? `    —    ${meta}` : ''), font: 'sans', size: 9.5, color: SOFT_INK, charSpacing: 2 },
          ], x: M, y: 5.28, w: PW - M * 2, h: 0.34 },
        { type: 'text', text: title, x: M - 0.02, y: 5.66, w: PW - M * 2, h: 0.9, font: 'sans', size: 30, bold: true, color: WHITE, valign: 'top', shrink: true },
      );
      if (summary) s.els.push({ type: 'text', text: summary, x: M, y: 6.62, w: PW - M * 2, h: 0.55, font: 'sans', size: 11, color: SOFT_INK, valign: 'top', shrink: true, lineSpacingMultiple: 1.3 });

      // ── 디테일: 팩트 칼럼 + 벤토 (sharp 로 셀 비율 정확히 크롭) ──
      const stillBufs = bufs.slice(1);
      let runs = factRuns(p);
      const descFull = cleanNote(p.description, 460);
      // 팩트가 한두 줄뿐이면 칼럼이 죽는다 — 킥커 라인에 인라인으로 붙이고 벤토를 전폭으로
      let inlineFacts = '';
      if (stillBufs.length && runs.length && (runs.factCount || 0) < 2) {
        inlineFacts = [
          filled(p.contribution) && `CONTRIBUTION ${filled(p.contribution)}`,
          filled(p.role) && oneLiner(p.role, 60),
        ].filter(Boolean).join('   ·   ');
        runs = [];
      }
      // 스틸도 설명도 없고 팩트마저 짧으면 — 빈 종이를 만드느니 디테일을 생략 (히어로가 이미 킥커를 든다)
      const skipDetail = !stillBufs.length && !descFull && (runs.factCount || 0) < 3;
      if ((runs.length || stillBufs.length || descFull) && !skipDetail) {
        const d = newSlide(PAPER, false);
        d.els.push(
          { type: 'text', runs: [
              { text: `( ${nn(i + 1)} )  `, font: 'serif', italic: true, size: 11, color: MUTE },
              { text: title + (inlineFacts ? '      —      ' + inlineFacts : ''), font: 'sans', size: 10, color: MUTE, charSpacing: 1 },
            ], x: M, y: 0.55, w: PW - M * 2, h: 0.3 },
          { type: 'line', x: M + 0.02, y: 0.98, w: 1.1, color: INK, width: 1 },
        );
        const hasFacts = runs.length > 0;
        if (stillBufs.length) {
          if (hasFacts) {
            // 팩트 아래 남는 자리에 설명을 받친다 — 칼럼이 숨을 쉰다
            const note = cleanNote(p.description, 300);
            if (note) {
              runs.push({ text: 'NOTE', font: 'sans', size: 8.5, color: MUTE, charSpacing: 3, breakLine: true, paraSpaceBefore: 12, paraSpaceAfter: 3 });
              runs.push({ text: note, font: 'sans', size: 9.5, color: MUTE, breakLine: true, lineSpacingMultiple: 1.45 });
            }
            d.els.push({ type: 'text', runs, x: M, y: 1.32, w: 4.15, h: 5.55, valign: 'top', shrink: true });
          }
          const bx = hasFacts ? 5.15 : M, bw = PW - bx - M, by = 1.32, bh = 5.55, g = 0.16;
          const n = Math.min(stillBufs.length, 4);
          const cells = n === 1 ? [[bx, by, bw, bh]]
            : n === 2 ? [[bx, by, (bw - g) / 2, bh], [bx + (bw + g) / 2, by, (bw - g) / 2, bh]]
            : n === 3 ? [[bx, by, (bw - g) / 2, bh], [bx + (bw + g) / 2, by, (bw - g) / 2, (bh - g) / 2], [bx + (bw + g) / 2, by + (bh + g) / 2, (bw - g) / 2, (bh - g) / 2]]
            : [[bx, by, (bw - g) / 2, (bh - g) / 2], [bx + (bw + g) / 2, by, (bw - g) / 2, (bh - g) / 2], [bx, by + (bh + g) / 2, (bw - g) / 2, (bh - g) / 2], [bx + (bw + g) / 2, by + (bh + g) / 2, (bw - g) / 2, (bh - g) / 2]];
          for (let k = 0; k < n; k++) {
            const [cx, cy, cw, ch] = cells[k];
            const cImg = await bakeImage(stillBufs[k], cw, ch, { position: 'centre', quality: 74 });
            if (cImg) d.els.push({ type: 'image', data: cImg, x: cx, y: cy, w: cw, h: ch });
          }
        } else {
          // 스틸 없음 — 좌 팩트 / 우 에디토리얼 설명 (빈 종이 금지). descFull 은 cleanNote 로 정돈됨.
          d.els.push({ type: 'text', runs, x: M, y: 1.32, w: 4.6, h: 5.55, valign: 'top', shrink: true });
          if (descFull) {
            d.els.push(
              { type: 'line', x: 5.7, y: 1.42, w: 0, color: HAIR, width: 0.75, vertical: true, h: 5.2 },
              { type: 'text', text: descFull, x: 6.35, y: 1.42, w: PW - 6.35 - M, h: 5.3, font: 'sans', size: 11, color: INK, lineSpacingMultiple: 1.55, valign: 'top', shrink: true },
            );
          }
        }
        pageNo(d.els, pageCounter, false);
      }

      // ── 스틸 스프레드: 이미지 5장 이상이면 풀블리드 2업 한 장 더 ──
      if (bufs.length >= 6) {
        const sp = newSlide(INK, true);
        const g2 = 0.08;
        const L = await bakeImage(bufs[4], (PW - g2) / 2, PH, { position: 'centre', quality: 76 });
        const R = await bakeImage(bufs[5], (PW - g2) / 2, PH, { position: 'centre', quality: 76 });
        if (L) sp.els.push({ type: 'image', data: L, x: 0, y: 0, w: (PW - g2) / 2, h: PH });
        if (R) sp.els.push({ type: 'image', data: R, x: (PW + g2) / 2, y: 0, w: (PW - g2) / 2, h: PH });
        sp.els.push({ type: 'text', text: `( ${nn(i + 1)} )  ${title}`, x: M, y: PH - 0.52, w: 8, h: 0.3, font: 'sans', size: 8.5, color: SOFT_INK, charSpacing: 2 });
      }
    }
  }

  // ═══ 7. 클로징 ═══
  {
    const s = newSlide(INK, true);
    railTop(s.els, year);
    s.els.push(
      { type: 'text', runs: [
          { text: 'Thank you', font: 'serif', italic: true, size: 58, color: WHITE },
          { text: '.', font: 'serif', italic: true, size: 58, color: KEY },   // 커버 라벤더와 북엔드
        ], x: M, y: 2.35, w: 12, h: 1.15 },
      { type: 'line', x: M + 0.03, y: 3.95, w: 1.1, color: '5A5852', width: 1 },
    );
    const lines = [email, phone, instaHandle && `Instagram  ${instaHandle}`, 'hatist.studio'].filter(Boolean);
    s.els.push({ type: 'text', runs: lines.map(t => ({ text: t, font: 'sans', size: 12.5, color: SOFT_INK, breakLine: true, paraSpaceAfter: 7 })), x: M + 0.03, y: 4.3, w: 10, h: 1.9, valign: 'top' });
    s.els.push({ type: 'text', text: `GENERATED FROM HATIST.STUDIO — ${dateStr}`, x: M + 0.03, y: PH - 0.52, w: 8, h: 0.3, font: 'sans', size: 8, color: MUTE_INK, charSpacing: 2 });
  }

  // 인덱스 2-pass — 각 행 끝에 실제 장표 번호 기입 ("… — meta · 07")
  for (const { run, projIdx } of indexPatch) {
    if (projPage[projIdx]) run.text += `   ·   ${nn(projPage[projIdx])}`;
  }

  return slides;
}

// ═══════════════════════ PPTX 렌더러 ═══════════════════════
function renderPptx(slides) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'W169', width: PW, height: PH });
  pptx.layout = 'W169';
  pptx.author = 'Hati';
  pptx.company = 'Hati — Visual Creative Studio';
  pptx.title = 'Hati Portfolio';

  const font = f => (f === 'serif' ? SERIF : SANS);
  for (const sl of slides) {
    const s = pptx.addSlide();
    s.background = { color: sl.bg };
    for (const el of sl.els) {
      if (el.type === 'image') {
        s.addImage({ data: el.data, x: el.x, y: el.y, w: el.w, h: el.h });
      } else if (el.type === 'line') {
        if (el.vertical) s.addShape('line', { x: el.x, y: el.y, w: 0, h: el.h, line: { color: el.color, width: el.width || 0.75 } });
        else s.addShape('line', { x: el.x, y: el.y, w: el.w, h: 0, line: { color: el.color, width: el.width || 0.75 } });
      } else if (el.type === 'text') {
        const opts = {
          x: el.x, y: el.y, w: el.w, h: el.h || 0.4,
          align: el.align, valign: el.valign || 'top',
          fit: el.shrink ? 'shrink' : undefined,
          lineSpacingMultiple: el.lineSpacingMultiple,
        };
        if (el.runs) {
          s.addText(el.runs.map(r => ({
            text: r.text,
            options: {
              fontFace: font(r.font), fontSize: r.size, bold: r.bold, italic: r.italic,
              color: r.color, charSpacing: r.charSpacing, breakLine: r.breakLine,
              paraSpaceBefore: r.paraSpaceBefore, paraSpaceAfter: r.paraSpaceAfter,
              lineSpacingMultiple: r.lineSpacingMultiple, superscript: r.superscript,
            },
          })), opts);
        } else {
          s.addText(el.text, {
            ...opts,
            fontFace: font(el.font), fontSize: el.size, bold: el.bold, italic: el.italic,
            color: el.color, charSpacing: el.charSpacing,
          });
        }
      }
    }
  }
  return pptx.write({ outputType: 'nodebuffer' });
}

// ═══════════════════════ HTML 프리뷰 렌더러 (검수용 — 스크린샷과 눈검수) ═══════════════════════
function renderHtml(slides) {
  const S = 96;   // px per inch
  const font = f => (f === 'serif' ? 'Georgia, serif' : "'Malgun Gothic','Apple SD Gothic Neo',sans-serif");
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const runHtml = r => `<span style="font-family:${font(r.font)};font-size:${(r.size || 12) * S / 72}px;${r.bold ? 'font-weight:700;' : ''}${r.italic ? 'font-style:italic;' : ''}${r.superscript ? 'vertical-align:super;' : ''}color:#${r.color || '000'};letter-spacing:${(r.charSpacing || 0) * S / 72 / 10}px;">${esc(r.text)}</span>${r.breakLine ? `<div style="height:${((r.paraSpaceAfter || 0) + (r.paraSpaceBefore || 0)) * S / 72}px"></div>` : ''}`;
  const body = slides.map((sl, i) => `
  <div class="slide" style="position:relative;width:${PW * S}px;height:${PH * S}px;background:#${sl.bg};overflow:hidden;margin:24px auto;box-shadow:0 8px 40px rgba(0,0,0,0.35)" data-n="${i + 1}">
    ${sl.els.map(el => {
      const box = `left:${el.x * S}px;top:${el.y * S}px;width:${el.w * S}px;`;
      if (el.type === 'image') return `<img src="${el.data}" style="position:absolute;${box}height:${el.h * S}px;object-fit:fill;display:block">`;
      if (el.type === 'line') return el.vertical
        ? `<div style="position:absolute;left:${el.x * S}px;top:${el.y * S}px;width:0;height:${el.h * S}px;border-left:${Math.max(1, (el.width || 0.75))}px solid #${el.color}"></div>`
        : `<div style="position:absolute;${box}height:0;border-top:${Math.max(1, (el.width || 0.75))}px solid #${el.color}"></div>`;
      const align = el.align ? `text-align:${el.align};` : '';
      const va = el.valign === 'middle' ? 'display:flex;align-items:center;justify-content:' + (el.align === 'center' ? 'center' : 'flex-start') + ';' : '';
      const lh = el.lineSpacingMultiple ? `line-height:${el.lineSpacingMultiple * 1.2};` : 'line-height:1.25;';
      const inner = el.runs ? el.runs.map(runHtml).join('') :
        `<span style="font-family:${font(el.font)};font-size:${(el.size || 12) * S / 72}px;${el.bold ? 'font-weight:700;' : ''}${el.italic ? 'font-style:italic;' : ''}color:#${el.color};letter-spacing:${(el.charSpacing || 0) * S / 72 / 10}px;white-space:pre-wrap;">${esc(el.text)}</span>`;
      const shrinkAttr = el.shrink ? ' data-shrink' : '';
      return `<div${shrinkAttr} style="position:absolute;${box}height:${(el.h || 0.4) * S}px;${align}${va}${lh}overflow:hidden;">${inner}</div>`;
    }).join('\n')}
  </div>`).join('\n');
  // PPTX 의 fit:'shrink' 를 HTML 에서도 재현 — 넘치는 텍스트 박스는 폰트를 줄여 맞춘다(0.6까지).
  // 이렇게 해야 프리뷰가 실제 PPTX 렌더와 어긋나지 않아 검수가 정확해진다.
  const shrinkScript = `<script>document.querySelectorAll('[data-shrink]').forEach(function(el){var g=0;while(el.scrollHeight>el.clientHeight+1&&g++<14){var kids=el.querySelectorAll('span');kids.forEach(function(s){var f=parseFloat(getComputedStyle(s).fontSize);s.style.fontSize=(f*0.94)+'px';});}});<\/script>`;
  return `<!doctype html><meta charset="utf-8"><body style="background:#333;margin:0;padding:1px 0">${body}${shrinkScript}</body>`;
}

async function buildDeckBuffer({ portfolio, settings, scope = 'featured' }) {
  const slides = await buildSpecs({ portfolio, settings, scope });
  return renderPptx(slides);
}

module.exports = { buildDeckBuffer, buildSpecs, renderPptx, renderHtml, filled };
