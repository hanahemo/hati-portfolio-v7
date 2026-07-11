// PPT 내보내기 — 홈페이지 데이터의 스냅샷을 기업 제출용 표준 덱(PPTX)으로.
// 홈페이지가 원천, PPT 는 출력물. 디자인은 웹과 별개의 클래식 코퍼레이트(화이트/모노크롬 헤어라인).
// 스펙: docs/superpowers/specs/2026-07-11-ppt-export-design.md

const PptxGenJS = require('pptxgenjs');
const fs = require('fs');
const path = require('path');
const { UPLOADS_DIR } = require('../persist');

// ── 팔레트/타이포 (fill 말고 stroke — 지면에서도 모노크롬 헤어라인) ──
const INK = '141416';
const MUTE = '8A8886';
const HAIR = 'D9D7D2';
const FONT = 'Malgun Gothic';   // 한국 기업 윈도우 표준, 맥은 자동 폴백

// 페이지 (16:9 inch)
const PW = 13.333, PH = 7.5;

// ── 데이터 정제 — 웹(project-modal.js)과 동일 원칙: 글자/숫자 없는 값은 자리표시자 ──
function filled(v) {
  const s = String(v ?? '').trim();
  return /[\p{L}\p{N}]/u.test(s) ? s : '';
}

// result 의 "-\t..." / "- ..." 줄을 "· " 불릿 줄 배열로
function bulletLines(s) {
  return String(s).split('\n')
    .map(l => l.replace(/^[-•·]\s*\t?\s*/, '').trim())
    .filter(Boolean);
}

// ── 미디어 후보 체인 — public/assets/js/sections/cards.js 의 서버판 ──
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

// 미디어 하나 → 시도할 후보 목록 [{kind:'file',path} | {kind:'url',url}]
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
  if (DIRECT_VIDEO_RE.test(raw)) return [];
  const yt = getYouTubeId(raw);
  if (yt) return [{ kind: 'url', url: `https://img.youtube.com/vi/${yt}/hqdefault.jpg` }];
  if (/vimeo\.com/.test(raw)) return [];          // 포스터는 oEmbed 필요 — 생략
  if (/^https?:\/\//.test(raw)) return [{ kind: 'url', url: raw }];
  return [];
}

// 프로젝트 → 후보 체인 (첫 이미지 → 마지막 이미지 → 첫 영상 포스터)
function projectCandidates(project, w) {
  const media = Array.isArray(project.media) ? project.media : [];
  const isImg = m => (m.type || '').startsWith('image');
  const imgs = media.filter(isImg);
  const vids = media.filter(m => !isImg(m));
  const picks = [imgs[0], imgs[imgs.length - 1], vids[0]].filter(Boolean);
  const out = [];
  for (const m of picks) out.push(...mediaCandidates(m.url, w));
  // 중복 제거
  const seen = new Set();
  return out.filter(c => { const k = c.kind + ':' + (c.url || c.path); if (seen.has(k)) return false; seen.add(k); return true; });
}

// URL fetch → data URI (content-type 이 image/* 아니면 실패 — 권한 없는 Drive 는 HTML 을 준다)
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

// 후보 체인 소진 — 성공하면 pptxgenjs image props ({path} 또는 {data})
async function resolveImage(project, w = 1280) {
  for (const c of projectCandidates(project, w)) {
    if (c.kind === 'file') return { path: c.path };
    const data = await fetchImageDataUri(c.url);
    if (data) return { data };
  }
  return null;
}

// 동시 5개 풀
async function resolveAllImages(projects) {
  const out = new Array(projects.length).fill(null);
  let i = 0;
  const worker = async () => {
    while (i < projects.length) {
      const idx = i++;
      out[idx] = await resolveImage(projects[idx]);
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));
  return out;
}

// ── 공용 텍스트 헬퍼 ──
const kicker = (text) => ({ text, options: { fontSize: 10, color: MUTE, charSpacing: 3, breakLine: true } });

// ── 덱 빌드 ──
async function buildDeckBuffer({ portfolio, settings, scope = 'featured' }) {
  const all = Array.isArray(portfolio.projects) ? portfolio.projects : [];
  let projects;
  if (scope === 'all') {
    projects = all.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  } else {
    const byId = new Map(all.map(p => [p.id, p]));
    projects = (settings.featuredProjectIds || []).map(id => byId.get(id)).filter(Boolean);
    if (!projects.length) projects = all.slice(0, 9);
  }

  const images = await resolveAllImages(projects);

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'W169', width: PW, height: PH });
  pptx.layout = 'W169';
  pptx.author = 'Hati';
  pptx.company = 'Hati — Visual Creative Studio';
  pptx.title = 'Hati Portfolio';

  // 프로젝트 장표 공용 마스터 — 하단 풋터 + 페이지 번호
  pptx.defineSlideMaster({
    title: 'MAIN',
    background: { color: 'FFFFFF' },
    objects: [
      { text: { text: 'Hati® — Visual Creative Portfolio', options: { x: 0.55, y: PH - 0.42, w: 5, h: 0.3, fontFace: FONT, fontSize: 8, color: MUTE, charSpacing: 2 } } },
    ],
    slideNumber: { x: PW - 0.9, y: PH - 0.42, w: 0.5, h: 0.3, fontFace: FONT, fontSize: 8, color: MUTE, align: 'right' },
  });

  const email = filled(settings.contactEmail);
  const phone = filled(settings.contactPhone);
  const insta = filled(settings.contactInstagram);
  const instaHandle = insta ? '@' + insta.replace(/\/+$/, '').split('/').pop() : '';
  const est = filled(settings.est);
  const contactLine = [email, phone, instaHandle, 'hatist.studio'].filter(Boolean).join('   ·   ');
  const today = new Date();
  const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;

  // ── 1. 커버 ──
  {
    const s = pptx.addSlide();
    s.background = { color: 'FFFFFF' };
    s.addText(`PORTFOLIO — ${today.getFullYear()}`, { x: 0.55, y: 0.5, w: 6, h: 0.35, fontFace: FONT, fontSize: 11, color: MUTE, charSpacing: 4 });
    s.addText([
      { text: filled(settings.heroTitle) || 'Hati', options: { fontSize: 66, bold: true, color: INK } },
      { text: '®', options: { fontSize: 24, color: MUTE, superscript: true } },
    ], { x: 0.5, y: 2.55, w: 12, h: 1.3, fontFace: FONT });
    const sub = filled(settings.heroSubtitle);
    if (sub) s.addText(sub, { x: 0.55, y: 3.95, w: 10.5, h: 0.6, fontFace: FONT, fontSize: 15, color: MUTE });
    s.addShape('line', { x: 0.55, y: 6.55, w: 12.23, h: 0, line: { color: HAIR, width: 0.75 } });
    s.addText(`SEOUL${est ? ' — EST. ' + est : ''}`, { x: 0.55, y: 6.7, w: 5, h: 0.35, fontFace: FONT, fontSize: 10, color: MUTE, charSpacing: 2 });
    if (contactLine) s.addText(contactLine, { x: 5.5, y: 6.7, w: 7.28, h: 0.35, fontFace: FONT, fontSize: 10, color: MUTE, align: 'right' });
  }

  // ── 2. About (있을 때만) ──
  const about = filled(settings.aboutText);
  if (about) {
    const s = pptx.addSlide({ masterName: 'MAIN' });
    s.addText('ABOUT', { x: 0.55, y: 0.65, w: 4, h: 0.35, fontFace: FONT, fontSize: 11, color: MUTE, charSpacing: 4 });
    s.addShape('line', { x: 0.55, y: 1.15, w: 1.2, h: 0, line: { color: INK, width: 1 } });
    s.addText(about, { x: 0.55, y: 1.7, w: 9.2, h: 4.8, fontFace: FONT, fontSize: 16, color: INK, lineSpacingMultiple: 1.5, valign: 'top', fit: 'shrink' });
  }

  // ── 3. 인덱스 ──
  {
    const s = pptx.addSlide({ masterName: 'MAIN' });
    s.addText('INDEX', { x: 0.55, y: 0.65, w: 4, h: 0.35, fontFace: FONT, fontSize: 11, color: MUTE, charSpacing: 4 });
    s.addShape('line', { x: 0.55, y: 1.15, w: 1.2, h: 0, line: { color: INK, width: 1 } });
    const rows = projects.map((p, i) => ({
      text: `${String(i + 1).padStart(2, '0')}   ${p.title || '(untitled)'}`,
      options: { fontSize: projects.length > 24 ? 10 : 12, color: INK, breakLine: true, paraSpaceAfter: projects.length > 24 ? 4 : 7 },
    }));
    if (rows.length <= 14) {
      s.addText(rows, { x: 0.55, y: 1.55, w: 11.5, h: 5.3, fontFace: FONT, valign: 'top', fit: 'shrink' });
    } else {
      const half = Math.ceil(rows.length / 2);
      s.addText(rows.slice(0, half), { x: 0.55, y: 1.55, w: 6.0, h: 5.3, fontFace: FONT, valign: 'top', fit: 'shrink' });
      s.addText(rows.slice(half), { x: 6.9, y: 1.55, w: 6.0, h: 5.3, fontFace: FONT, valign: 'top', fit: 'shrink' });
    }
  }

  // ── 4. 프로젝트 장표 ──
  projects.forEach((p, i) => {
    const s = pptx.addSlide({ masterName: 'MAIN' });
    const img = images[i];
    const hasImg = !!img;
    // 좌: 풀블리드 이미지 절반 (cover 크롭) — 실패 시 텍스트 패널 확장(빈 회색 박스 금지)
    if (hasImg) {
      s.addImage({ ...img, x: 0, y: 0, w: 6.66, h: PH, sizing: { type: 'cover', w: 6.66, h: PH } });
    }
    const tx = hasImg ? 7.15 : 0.9;
    const tw = hasImg ? 5.6 : 11.5;

    const parts = [];
    parts.push({ text: `${String(i + 1).padStart(2, '0')} — ${String(p.category || '').toUpperCase()}`, options: { fontSize: 10, color: MUTE, charSpacing: 3, breakLine: true, paraSpaceAfter: 10 } });
    parts.push({ text: p.title || '(untitled)', options: { fontSize: 23, bold: true, color: INK, breakLine: true, paraSpaceAfter: 6 } });
    const tags = Array.isArray(p.tags) ? p.tags.filter(filled) : [];
    if (tags.length) parts.push({ text: tags.join(' · '), options: { fontSize: 10, color: MUTE, breakLine: true, paraSpaceAfter: 12 } });

    // 팩트 — 어드민에서 안 채운 칸(자리표시자 ".")은 줄째로 뺀다
    const fact = (label, value, opts = {}) => {
      parts.push({ text: label, options: { fontSize: 8.5, color: MUTE, charSpacing: 3, breakLine: true, paraSpaceBefore: 8, paraSpaceAfter: 2 } });
      if (Array.isArray(value)) {
        value.forEach(l => parts.push({ text: l, options: { fontSize: 10.5, color: INK, breakLine: true, paraSpaceAfter: 2, ...opts } }));
      } else {
        parts.push({ text: value, options: { fontSize: 11, color: INK, breakLine: true, paraSpaceAfter: 2, ...opts } });
      }
    };
    const role = filled(p.role); if (role) fact('ROLE', role);
    const contribution = filled(p.contribution); if (contribution) fact('CONTRIBUTION', contribution);
    const result = filled(p.result); if (result) fact('RESULT', bulletLines(result).map(l => '·  ' + l));
    const credits = Array.isArray(p.credits) ? p.credits.filter(c => c && (filled(c.role) || filled(c.name))) : [];
    if (credits.length) {
      const lines = credits.slice(0, 6).map(c => [filled(c.role), filled(c.name)].filter(Boolean).join(' — '));
      if (credits.length > 6) lines.push(`외 ${credits.length - 6}`);
      fact('CREDITS', lines, { fontSize: 9, color: MUTE });
    }

    s.addText(parts, { x: tx, y: 0.8, w: tw, h: PH - 1.5, fontFace: FONT, valign: 'top', fit: 'shrink' });
  });

  // ── 5. 클로징 ──
  {
    const s = pptx.addSlide();
    s.background = { color: 'FFFFFF' };
    s.addText("Let's create together.", { x: 0.55, y: 2.7, w: 12.2, h: 1.0, fontFace: FONT, fontSize: 40, bold: true, color: INK });
    const lines = [email, phone, instaHandle && `Instagram ${instaHandle}`, 'hatist.studio'].filter(Boolean)
      .map(t => ({ text: t, options: { fontSize: 14, color: INK, breakLine: true, paraSpaceAfter: 6 } }));
    if (lines.length) s.addText(lines, { x: 0.58, y: 4.1, w: 10, h: 2, fontFace: FONT, valign: 'top' });
    s.addText(`Generated from hatist.studio — ${dateStr}`, { x: 0.58, y: PH - 0.5, w: 8, h: 0.3, fontFace: FONT, fontSize: 8, color: MUTE, charSpacing: 2 });
  }

  return pptx.write({ outputType: 'nodebuffer' });
}

module.exports = { buildDeckBuffer, filled };
