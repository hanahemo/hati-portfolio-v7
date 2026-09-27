// 포트폴리오 덱 v4 — "Screening Notes". 한 번의 빌드로 PDF(정본)와 PPTX(편집본)를 함께 낸다.
// 설계 원칙: design/deck-design-philosophy.md
//  · 12단 스위스 그리드(마진 44 / 거터 16 / 단 58pt) — 모든 요소가 단 경계에 선다.
//  · 활자는 사이트와 같은 계통: Pretendard(본문·디스플레이) / JetBrains Mono(기록) / Instrument Serif Italic(장면 번호).
//  · 줄은 type.js 가 직접 짠다 — 어절 단위 줄바꿈, 제목 균형 배분, 외톨이 줄 방지. PDF·PPTX 가 같은 줄을 쓴다.
//  · 크롭은 sharp 로 이미지에 굽는다 (pptxgenjs sizing 은 Node 에서 원본 크기를 몰라 늘어난다 — v2 사고).
//  · 컬러는 잉크/지면 두 재질 + 라벤더 헤어라인 하나(표지·마지막 장). 면 채움 금지.
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { UPLOADS_DIR } = require('../persist');
const T = require('./type');
const { renderPdf, renderPptx } = require('./render');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

// ── 그리드 ──
const W = 960, H = 540;
const MX = 44, G = 16, PITCH = 74;          // 12단: 단 58 + 거터 16
const cx = i => MX + i * PITCH;              // i번째 단(0부터)의 왼쪽 경계
const span = n => n * PITCH - G;             // n단 폭
const TOP = 72, BOT = 496, RAIL = 30;        // 본문 밴드, 레일 베이스라인
const RIGHT = W - MX;

// ── 재질 ──
const DARK = { bg: '0B0B0C', fg: 'EDEBE6', fg2: '8E8C86', fg3: '4A4945', hair: '29292B', dark: true };
const LIGHT = { bg: 'F2F1ED', fg: '121213', fg2: '6E6C67', fg3: 'A6A49E', hair: 'D3D1CA', dark: false };
const ON_IMG = { fg: 'F2F0EB', fg2: 'C4C2BC' };
const KEY = 'C7B9FF';

// ── 활자 역할 ── (f 페이스, s 크기pt, c 색, tr 자간em)
const sp = (text, f, s, c, tr = 0, up = false) => ({ text, f, s, c, tr, up });
const label = (text, c) => sp(text, 'mono', 6.5, c, 0.08, true);
const P = (spans, o = {}) => ({ spans: Array.isArray(spans) ? spans : [spans], ...o });
const line = (els, x1, y1, x2, y2, c, w = 0.5) => els.push({ t: 'rule', x1, y1, x2, y2, c, w });
const text = (els, o) => { const b = T.block(o); els.push(b); return b; };
// 조판이 끝난 요소 묶음을 세로로 옮긴다 (먼저 높이를 재고 나중에 자리를 정하는 배치용)
function shift(els, dy) {
  for (const e of els) {
    if (e.t === 'text') { e.y += dy; e.bottom += dy; e.firstBase += dy; e.lastBase += dy; e.paras.forEach(p => p.lines.forEach(l => { l.base += dy; })); }
    else if (e.t === 'rule') { e.y1 += dy; e.y2 += dy; }
    else e.y += dy;
  }
}

// ── 데이터 정제 ──
function filled(v) {
  const s = String(v ?? '').trim();
  return /[\p{L}\p{N}]/u.test(s) ? s : '';
}
const bulletLines = s => String(s).split('\n').map(l => l.replace(/^[-•·–—]\s*\t?\s*/, '').trim()).filter(l => filled(l));
function oneLiner(s, max = 140) {
  const first = String(s || '').split('\n').map(l => l.trim()).filter(l => filled(l))[0] || '';
  return first.length > max ? first.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : first;
}
// 문단은 살리고 문단 안의 하드 줄바꿈(웹용 수동 개행)은 산문으로 접는다
function prose(s, maxChars = 420) {
  const paras = String(s || '').split(/\n\s*\n+/)
    .map(p => p.split('\n').map(l => l.trim()).filter(l => filled(l)).join(' ').replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean);
  const out = [];
  let total = 0;
  for (const p of paras) {
    if (total + p.length > maxChars && out.length) break;
    out.push(p); total += p.length;
  }
  let joined = out.join('\n');
  if (joined.length > maxChars) joined = joined.slice(0, maxChars - 1).replace(/\s+\S*$/, '') + '…';
  return joined;
}
const normRole = s => filled(s) ? s.replace(/\s*[\/,]\s*/g, ' · ').replace(/[\s·]+$/, '').replace(/^[\s·]+/, '').replace(/\s{2,}/g, ' ') : '';
const nn = i => String(i).padStart(2, '0');
const CAT = { video: 'Film', photo: 'Photo', graphic: 'Graphic' };
const catOf = p => CAT[p.category] || filled(p.category) || 'Work';

// ── 미디어 소스 (후보 체인 — 죽은 업로드/권한 실패 우회) ──
function getDriveId(url) {
  if (!url || typeof url !== 'string' || !url.includes('drive.google.com')) return '';
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : '';
}
function getYouTubeId(url) {
  const m = String(url || '').match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
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
  if (yt) return ['maxresdefault', 'sddefault', 'hqdefault'].map(q => ({ kind: 'url', url: `https://img.youtube.com/vi/${yt}/${q}.jpg`, letterbox: q !== 'maxresdefault' }));
  if (/vimeo\.com/.test(raw)) return [];
  if (/^https?:\/\//.test(raw)) return [{ kind: 'url', url: raw }];
  return [];
}

const bufCache = new Map();
async function fetchBuffer(url, timeoutMs = 9000) {
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
  if (bufCache.size > 400) bufCache.clear();
  bufCache.set(url, result);
  return result;
}
// 버퍼 + 실제 가로세로비(EXIF 회전 반영). 유튜브 sd/hq 썸네일은 4:3 레터박스 → 16:9 로 잘라낸다.
async function resolveImage(raw, w) {
  for (const c of mediaCandidates(raw, w)) {
    let buf = null;
    if (c.kind === 'file') { try { buf = fs.readFileSync(c.path); } catch (_) { continue; } }
    else buf = await fetchBuffer(c.url);
    if (!buf) continue;
    try {
      const m = await sharp(buf).metadata();
      let iw = m.width, ih = m.height;
      if (!iw || !ih) continue;
      if (c.letterbox) {
        buf = await sharp(buf).extract({ left: 0, top: Math.round(ih * 0.125), width: iw, height: Math.round(ih * 0.75) }).toBuffer();
        ih = Math.round(ih * 0.75);
      }
      if ((m.orientation || 1) >= 5) [iw, ih] = [ih, iw];
      return { buf, ar: iw / ih };
    } catch (_) { continue; }
  }
  return null;
}

async function withPool(jobs, size = 5) {
  const out = new Array(jobs.length).fill(null);
  let i = 0;
  const worker = async () => { while (i < jobs.length) { const idx = i++; try { out[idx] = await jobs[idx](); } catch (_) { out[idx] = null; } } };
  await Promise.all(Array.from({ length: Math.min(size, jobs.length) || 1 }, worker));
  return out;
}

// 프로젝트 이미지 — 장표 커버 지정 → 이미지 → 영상 포스터 순
async function projectImages(project, max, w) {
  const media = Array.isArray(project.media) ? project.media : [];
  const isImg = m => (m.type || '').startsWith('image');
  const urls = [];
  if (filled(project.coverImage)) urls.push(project.coverImage);
  urls.push(...media.filter(isImg).map(m => m.url), ...media.filter(m => !isImg(m)).map(m => m.url));
  const out = [], seen = new Set();
  for (const u of urls) {
    if (out.length >= max) break;
    if (!u || seen.has(u)) continue;
    seen.add(u);
    const r = await resolveImage(u, w);
    if (r) out.push(r);
  }
  return out;
}

// 영상 원본 링크 (장표에서 바로 재생 페이지로)
function filmLink(p) {
  const media = Array.isArray(p.media) ? p.media : [];
  for (const m of media) {
    const yt = getYouTubeId(m.url);
    if (yt) return { url: `https://youtu.be/${yt}`, label: `youtu.be/${yt}` };
    const vm = String(m.url || '').match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (vm) return { url: `https://vimeo.com/${vm[1]}`, label: `vimeo.com/${vm[1]}` };
  }
  const v = media.find(m => (m.type || '').startsWith('video') && getDriveId(m.url));
  if (v) return { url: `https://drive.google.com/file/d/${getDriveId(v.url)}/view`, label: 'Google Drive' };
  return null;
}

// ── sharp — 크롭·스크림을 이미지에 굽는다 (150dpi) ──
const DPI = 150;
const px = pt => Math.max(1, Math.round(pt / 72 * DPI));
async function bake(img, wPt, hPt, { scrim = null, quality = 80 } = {}) {
  const w = px(wPt), h = px(hPt);
  try {
    let pipe = sharp(img.buf).rotate().resize(w, h, { fit: 'cover', position: sharp.strategy.attention });
    if (scrim) {
      const g = scrim === 'hero'
        // 위: 레일 가독용 옅은 그늘 / 아래: 타이틀 존 — 아래 45% 에서만 어두워진다
        ? `<linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.5"/><stop offset="0.16" stop-color="#000" stop-opacity="0"/><stop offset="0.5" stop-color="#000" stop-opacity="0"/><stop offset="0.78" stop-color="#050506" stop-opacity="0.55"/><stop offset="1" stop-color="#050506" stop-opacity="0.86"/></linearGradient>`
        : `<linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.42"/><stop offset="0.2" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>`;
      pipe = pipe.composite([{ input: Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><defs>${g}</defs><rect width="100%" height="100%" fill="url(#a)"/></svg>`) }]);
    }
    return await pipe.jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer();
  } catch (_) { return null; }
}
// 로고 — 여백을 깎고(trim), 면적을 맞춰(광학 크기 정규화) 알파 마스크 단색 실루엣으로 굽는다.
// 가로로 긴 워드마크와 정사각 심볼이 같은 '무게'로 보이게: 넓이 = area 로 맞추고 최대 폭/높이로 제한.
async function bakeLogo(img, area, maxW, maxH, rgb) {
  try {
    const trimmed = await sharp(img.buf).trim({ threshold: 8 }).toBuffer().catch(() => img.buf);
    const meta = await sharp(trimmed).metadata();
    const ar = meta.width / meta.height;
    let hPt = Math.sqrt(area / ar), wPt = hPt * ar;
    const k = Math.min(1, maxW / wPt, maxH / hPt);
    wPt *= k; hPt *= k;
    const w = px(wPt), h = px(hPt);
    let out;
    if (meta.hasAlpha) {
      const alpha = await sharp(trimmed).resize(w, h, { fit: 'fill' }).ensureAlpha().extractChannel('alpha').toBuffer();
      out = await sharp({ create: { width: w, height: h, channels: 3, background: rgb } }).joinChannel(alpha).png().toBuffer();
    } else {
      out = await sharp(trimmed).resize(w, h, { fit: 'fill' }).grayscale().png().toBuffer();
    }
    return { data: out, w: wPt, h: hPt };
  } catch (_) { return null; }
}

// ── 크롭 인지 벤토 — 원본 비율과 셀 비율의 차이(면적 가중)가 가장 작은 배치/순서를 고른다 ──
function bentoTemplates(n, x, y, w, h, g) {
  const hw = (w - g) / 2, hh = (h - g) / 2;
  const T3w = (w - 2 * g) / 3, T4w = (w - 3 * g) / 4;
  const split = r => [w * r - g / 2, w * (1 - r) - g / 2];
  if (n === 1) return [[[x, y, w, h]]];
  if (n === 2) {
    const [a, b] = split(0.6);
    return [
      [[x, y, hw, h], [x + hw + g, y, hw, h]],
      [[x, y, w, hh], [x, y + hh + g, w, hh]],
      [[x, y, a, h], [x + a + g, y, b, h]],
      [[x, y, b, h], [x + b + g, y, a, h]],
    ];
  }
  if (n === 3) {
    const [a, b] = split(0.58);
    const th = h * 0.6 - g / 2, bh = h - th - g;
    return [
      [[x, y, a, h], [x + a + g, y, b, hh], [x + a + g, y + hh + g, b, hh]],
      [[x, y, b, hh], [x, y + hh + g, b, hh], [x + b + g, y, a, h]],
      [[x, y, w, th], [x, y + th + g, hw, bh], [x + hw + g, y + th + g, hw, bh]],
      [[x, y, T3w, h], [x + T3w + g, y, T3w, h], [x + 2 * (T3w + g), y, T3w, h]],
    ];
  }
  const [a, b] = split(0.62);
  const t3h = (h - 2 * g) / 3, th = h * 0.6 - g / 2, bh = h - th - g;
  return [
    [[x, y, hw, hh], [x + hw + g, y, hw, hh], [x, y + hh + g, hw, hh], [x + hw + g, y + hh + g, hw, hh]],
    [[x, y, a, h], [x + a + g, y, b, t3h], [x + a + g, y + t3h + g, b, t3h], [x + a + g, y + 2 * (t3h + g), b, t3h]],
    [[x, y, w, th], [x, y + th + g, T3w, bh], [x + T3w + g, y + th + g, T3w, bh], [x + 2 * (T3w + g), y + th + g, T3w, bh]],
    [[x, y, T4w, h], [x + T4w + g, y, T4w, h], [x + 2 * (T4w + g), y, T4w, h], [x + 3 * (T4w + g), y, T4w, h]],
  ];
}
function perms(a) { return a.length <= 1 ? [a] : a.flatMap((v, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [v, ...p])); }
function bento(imgs, x, y, w, h, g) {
  const n = Math.min(imgs.length, 4);
  let best = null;
  for (const cells of bentoTemplates(n, x, y, w, h, g)) {
    for (const order of perms([...Array(n).keys()])) {
      const cost = cells.reduce((a, [, , cw, ch], k) => a + Math.abs(Math.log(imgs[order[k]].ar / (cw / ch))) * cw * ch, 0);
      if (!best || cost < best.cost) best = { cost, cells: cells.map((c, k) => ({ c, img: imgs[order[k]] })) };
    }
  }
  return best.cells;
}

// ═══════════════════════ 장표 빌더 ═══════════════════════
async function buildDeck({ portfolio, settings, scope }) {
  const all = Array.isArray(portfolio.projects) ? portfolio.projects : [];
  const byId = new Map(all.map(p => [p.id, p]));
  const featured = (settings.featuredProjectIds || []).map(id => byId.get(id)).filter(Boolean);
  const CAT_ORDER = { video: 0, photo: 1, graphic: 2 };
  const projects = scope === 'all'
    ? all.slice().sort((a, b) => ((CAT_ORDER[a.category] ?? 9) - (CAT_ORDER[b.category] ?? 9)) || ((a.order ?? 0) - (b.order ?? 0)))
    : (featured.length ? featured : all.slice(0, 9));

  const deckTx = settings.deck || {};
  const email = filled(settings.contactEmail);
  const phone = filled(settings.contactPhone);
  const insta = filled(settings.contactInstagram);
  const instaHandle = insta ? '@' + insta.replace(/\/+$/, '').split('/').pop().replace(/^@/, '') : '';
  const instaUrl = insta ? (/^https?:/.test(insta) ? insta : `https://www.instagram.com/${instaHandle.slice(1)}/`) : '';
  const est = filled(settings.est);
  const now = new Date();
  const year = now.getFullYear();
  const dateStr = `${year}.${nn(now.getMonth() + 1)}.${nn(now.getDate())}`;
  const span_ = est ? `${est}—${year}` : String(year);

  // ── 이미지 수집 (풀 5) ──
  const maxImgs = scope === 'all' ? 1 : 8;
  const jobs = projects.map(p => () => projectImages(p, maxImgs, 1800));
  jobs.push(() => filled(settings.aboutImage) ? resolveImage(settings.aboutImage, 1400) : null);
  const logoList = Array.isArray(settings.clientLogos) ? settings.clientLogos : [];
  logoList.forEach(l => jobs.push(() => resolveImage(l.url, 800)));
  const resolved = await withPool(jobs, 5);
  const imgs = resolved.slice(0, projects.length).map(x => x || []);
  const aboutImg = resolved[projects.length];
  const logoImgs = resolved.slice(projects.length + 1).filter(Boolean);

  const slides = [];
  const add = (th, meta = {}) => { const s = { bg: th.bg, th, els: [], ...meta }; slides.push(s); return s; };
  const projPage = [];                 // 프로젝트 i → 첫 장 번호
  const late = [];                     // 전체 장 수가 정해진 뒤 채우는 것들 (인덱스·목차 번호)

  // ═══ 1. 표지 — 거대한 워드마크가 바닥에 앉는다. 사진 없음. ═══
  {
    const th = DARK;
    const s = add(th, { rail: { left: 'Portfolio', mid: `Selected Works ${span_}`, right: 'Seoul, KR', rule: KEY }, outline: 'Cover' });
    // 워드마크 — 폭 기준으로 크기를 정해 단 6.5개를 채운다
    const mark = 'Hati';
    const target = span(7);
    const size = Math.min(280, target / (T.measure(mark, { f: 'semi', s: 100, tr: -0.05 }) / 100));
    const mx = MX - T.lsb('H', { f: 'semi', s: size });   // H 기둥이 그리드 선에 정확히 닿게 (사이드베어링 상쇄)
    const wm = text(s.els, { x: mx, y: BOT, w: span(8), anchor: 'last', paras: [P(sp(mark, 'semi', size, th.fg, -0.05), { lead: 0.9 })] });
    const markW = T.measure(mark, { f: 'semi', s: size, tr: -0.05 });
    text(s.els, { x: mx + markW + size * 0.02, y: wm.lastBase - size * 0.6, w: 60, anchor: 'baseline', paras: [P(sp('®', 'sans', size * 0.13, KEY))] });

    // 우측 칼럼 — 헤드라인 + 레저(연락처), 워드마크 베이스라인에 맞춰 바닥 정렬
    const x = cx(8), w = span(4);
    const rows = [['Contact', email], ['Phone', phone], ['Instagram', instaHandle]].filter(r => r[1]);
    let yb = BOT;
    for (let i = rows.length - 1; i >= 0; i--) {
      text(s.els, { x, y: yb, w: span(1), anchor: 'baseline', paras: [P(label(rows[i][0], th.fg2))] });
      text(s.els, { x: cx(9), y: yb, w: span(3), anchor: 'baseline', paras: [P(sp(rows[i][1], 'sans', 8.5, th.fg, -0.005))] });
      line(s.els, x, yb - 12, RIGHT, yb - 12, th.hair);
      yb -= 22;
    }
    const headline = filled(deckTx.coverHeadline) || 'Visual Creative Portfolio';
    const sub = filled(settings.heroSubtitle);
    text(s.els, { x, y: yb - 18, w, anchor: 'last', balance: true, paras: [
      P(sp(headline, 'semi', 19, th.fg, -0.025), { lead: 1.15 }),
      sub && P(sp(sub, 'sans', 8.5, th.fg2, -0.005), { lead: 1.55, before: 8 }),
    ].filter(Boolean) });
  }

  // ═══ 2. 스테이트먼트 — 큰 한 문장, 좌측 정렬 (스위스) ═══
  const statement = filled(deckTx.statement) || filled(settings.philosophy);
  if (statement) {
    const th = DARK;
    const s = add(th, { rail: { mid: 'Statement' } });
    text(s.els, { x: MX, y: TOP + 6, w: span(3), anchor: 'baseline', paras: [P(label('( Statement )', th.fg2))] });
    const len = statement.length;
    const size = len < 60 ? 58 : len < 120 ? 44 : len < 220 ? 32 : 24;
    text(s.els, { x: MX, y: TOP + 52, w: span(10), h: 300, balance: true, paras: [P(sp(statement, 'semi', size, th.fg, -0.035), { lead: 1.08 })] });
    text(s.els, { x: MX, y: BOT, w: span(4), anchor: 'last', paras: [
      P(sp('Hati', 'serif', 20, th.fg), { lead: 1.1 }),
      P(label('Creative Director — Design, Photo, Film', th.fg2), { lead: 1.4, before: 6 }),
    ] });
    text(s.els, { x: cx(8), y: BOT, w: span(4), anchor: 'last', align: 'right', paras: [P(label(`Seoul — ${est ? 'Est. ' + est : year}`, th.fg2))] });
  }

  // ═══ 3. 소개 — 좌 인물 / 우 에디토리얼 + 서비스 + 숫자 ═══
  const intro = prose(filled(deckTx.introText) || filled(settings.aboutText), 520);
  if (intro) {
    const th = LIGHT;
    const s = add(th, { rail: { mid: 'About' } });
    const photo = aboutImg && await bake(aboutImg, span(5), BOT - TOP, { quality: 82 });
    const x = photo ? cx(6) : MX, w = photo ? span(6) : span(9);
    if (photo) s.els.push({ t: 'img', data: photo, x: MX, y: TOP, w: span(5), h: BOT - TOP });
    text(s.els, { x, y: TOP + 6, w, anchor: 'baseline', paras: [P(label('( About )', th.fg2))] });
    const introB = text(s.els, { x, y: TOP + 24, w, h: 176, paras: [P(sp(intro, 'sans', 17, th.fg, -0.025), { lead: 1.5 })] });

    // 서비스 — deck 탭 입력이 없으면 사이트 부제("Director of A, B & C")에서 분야를 뽑는다 (지어낸 문구 없음)
    const services = filled(deckTx.services)
      ? deckTx.services.split('\n').map(t => t.trim()).filter(Boolean)
      : String(settings.heroSubtitle || '').replace(/^\s*director\s+of\s+/i, '').split(/\s*(?:,|&|\/|·)\s*/).map(t => t.trim()).filter(t => filled(t));
    const listTop = Math.max(introB.bottom + 30, 290);
    if (services.length && listTop < 380) {
      text(s.els, { x, y: listTop, w, anchor: 'baseline', paras: [P(label(filled(deckTx.services) ? 'Services' : 'Disciplines', th.fg2))] });
      const half = Math.ceil(services.length / 2);
      const cw = (w - G) / 2, y0 = listTop + 10, rowH = Math.min(22, (404 - y0) / half);
      services.forEach((sv, i) => {
        const col = i < half ? 0 : 1, r = i < half ? i : i - half;
        const rx = x + col * (cw + G), ry = y0 + r * rowH;
        line(s.els, rx, ry, rx + cw, ry, th.hair);
        text(s.els, { x: rx, y: ry + rowH * 0.66, w: cw, anchor: 'baseline', maxLines: 1, paras: [P([sp(nn(i + 1) + '   ', 'mono', 6.5, th.fg2), sp(sv, 'sans', 9.5, th.fg, -0.01)])] });
      });
    }
    // 숫자 — 레저 형식 (헤어라인 / 라벨 / 숫자)
    const cats = {};
    all.forEach(p => { cats[p.category] = (cats[p.category] || 0) + 1; });
    const stats = [est && ['Since', est], ['Works', nn(all.length)], ['Film', nn(cats.video || 0)], ['Photo', nn(cats.photo || 0)], ['Graphic', nn(cats.graphic || 0)]].filter(Boolean);
    const cw = w / stats.length;
    // 모든 숫자를 같은 크기로 — 가장 긴 값(연도)이 칸 폭의 62% 를 넘지 않는 크기
    const ns = Math.min(34, ...stats.map(([, v]) => cw * 0.62 / (T.measure(v, { f: 'med', s: 1, tr: -0.045 }))));
    line(s.els, x, 420, x + w, 420, th.fg, 0.6);
    stats.forEach(([k, v], i) => {
      text(s.els, { x: x + i * cw, y: 434, w: cw - 8, anchor: 'baseline', paras: [P(label(k, th.fg2))] });
      text(s.els, { x: x + i * cw, y: BOT, w: cw - 4, anchor: 'last', paras: [P(sp(v, 'med', ns, th.fg, -0.045), { lead: 1 })] });
    });
  }

  // ═══ 4. 클라이언트 — 헤어라인 표 (스펙 시트 로고월) ═══
  if (logoImgs.length) {
    const th = DARK;
    const s = add(th, { rail: { mid: 'Clients' } });
    text(s.els, { x: MX, y: TOP + 34, w: span(8), anchor: 'baseline', paras: [P([sp('Selected Clients', 'semi', 40, th.fg, -0.035), sp(`  ${nn(logoImgs.length)}`, 'serif', 24, th.fg2)], { lead: 1 })] });
    const n = logoImgs.length;
    const cols = n <= 8 ? 4 : n <= 15 ? 5 : 6;
    const rows = Math.ceil(n / cols);
    const gx = MX, gw = RIGHT - MX, gy = 168;
    const cellW = gw / cols, cellH = Math.min(rows === 1 ? 150 : 164, (BOT - gy) / rows);
    const area = Math.min(cellW * cellH * 0.085, 3600);
    const logos = await withPool(logoImgs.map(img => () => bakeLogo(img, area, cellW * 0.56, cellH * 0.34, { r: 232, g: 230, b: 225 })), 5);
    for (let r = 0; r <= rows; r++) line(s.els, gx, gy + r * cellH, gx + gw, gy + r * cellH, th.hair);
    for (let c = 1; c < cols; c++) line(s.els, gx + c * cellW, gy, gx + c * cellW, gy + rows * cellH, th.hair);
    logos.forEach((lg, i) => {
      if (!lg) return;
      const c = i % cols, r = Math.floor(i / cols);
      s.els.push({ t: 'img', mime: 'image/png', data: lg.data, x: gx + c * cellW + (cellW - lg.w) / 2, y: gy + r * cellH + (cellH - lg.h) / 2, w: lg.w, h: lg.h });
    });
  }

  // ═══ 5. 인덱스 — 표 (장 번호는 마지막에 채운다) ═══
  const indexSlide = add(LIGHT, { rail: { mid: 'Index' }, outline: 'Index' });

  // ═══ 6. 작품 ═══
  const scene = i => `Scene ${nn(i + 1)}`;
  const kickerOf = (p, i) => [scene(i), catOf(p), filled(p.client), filled(p.year)].filter(Boolean).join('   ·   ');

  // 히어로 — 풀블리드 스틸 + 하단 타이틀 존
  async function hero(p, i, img) {
    const th = DARK;
    const s = add(th, { rail: { mid: 'Selected Works', sub: scene(i), onImage: !!img }, outline: p.title || scene(i) });
    projPage[i] = slides.length;
    const data = img && await bake(img, W, H, { scrim: 'hero', quality: 82 });
    const C = data ? ON_IMG : th;
    if (data) s.els.push({ t: 'img', data, x: 0, y: 0, w: W, h: H });
    else text(s.els, { x: cx(5), y: 380, w: span(7), anchor: 'last', align: 'right', paras: [P(sp(nn(i + 1), 'serif', 300, '1C1C1E'), { lead: 0.9 })] });
    const title = text(s.els, { x: MX, y: BOT, w: span(8), h: 108, anchor: 'last', balance: true, maxLines: 2, minScale: 0.62, paras: [P(sp(p.title || 'Untitled', 'semi', 46, C.fg, -0.035), { lead: 1.04 })] });
    text(s.els, { x: MX, y: title.y - 14, w: span(8), anchor: 'baseline', maxLines: 1, paras: [P(label(kickerOf(p, i), C.fg2))] });
    const summary = filled(p.deckSummary) || oneLiner(p.description, 150);
    if (summary) text(s.els, { x: cx(9), y: BOT, w: span(3), anchor: 'last', maxLines: 6, paras: [P(sp(summary, 'sans', 9, C.fg2, -0.012), { lead: 1.6 })] });
    return s;
  }

  // 레저 행 목록 (라벨 / 값 스팬들 / 링크)
  function facts(p, th) {
    const rows = [];
    const v = t => [P(sp(t, 'sans', 8.5, th.fg, -0.01), { lead: 1.5 })];
    if (filled(p.client)) rows.push({ k: 'Client', paras: v(filled(p.client)) });
    if (filled(p.year)) rows.push({ k: 'Year', paras: v(filled(p.year)) });
    const role = normRole(p.role);
    if (role) rows.push({ k: 'Role', paras: v(role) });
    const tags = (Array.isArray(p.tags) ? p.tags : []).map(filled).filter(Boolean);
    if (tags.length) rows.push({ k: 'Scope', paras: v(tags.join(' · ')) });
    if (filled(p.contribution)) rows.push({ k: 'Share', paras: v(filled(p.contribution)) });
    const result = filled(p.result) ? bulletLines(p.result) : [];
    if (result.length) rows.push({ k: 'Result', paras: result.map(l => P(sp('— ' + l, 'sans', 8.5, th.fg, -0.01), { lead: 1.5, before: 2 })) });
    const credits = (Array.isArray(p.credits) ? p.credits : []).filter(c => c && filled(c.name));
    if (credits.length) rows.push({ k: 'Credits', paras: credits.slice(0, 9).map(c => P([
      filled(c.role) ? sp(filled(c.role) + '   ', 'mono', 6.5, th.fg2, 0.04, true) : null,
      sp(filled(c.name), 'sans', 8.5, th.fg, -0.01),
    ].filter(Boolean), { lead: 1.5, before: 1 })) });
    const film = filmLink(p);
    if (film) rows.push({ k: 'Watch', paras: [P(sp(film.label + '  ↗', 'mono', 7.5, th.fg, 0))], url: film.url });
    return rows;
  }

  // 좌측 텍스트 칼럼 — 넘치면 설명을 줄이고, 그래도 넘치면 전체 축소 (넘치는 글줄 금지)
  function column(p, i, th, x, w, { descMax = 380 } = {}) {
    for (const [dMax, k] of [[descMax, 1], [Math.min(descMax, 240), 1], [120, 0.94], [0, 0.9], [0, 0.82], [0, 0.74]]) {
      const els = [];
      text(els, { x, y: TOP + 6, w, anchor: 'baseline', paras: [P(label(`${scene(i)}   ·   ${catOf(p)}`, th.fg2))] });
      const title = text(els, { x, y: TOP + 20, w, balance: true, maxLines: 3, paras: [P(sp(p.title || 'Untitled', 'semi', 21 * k, th.fg, -0.025), { lead: 1.16 })] });
      let y = title.bottom + 12 * k;
      const desc = dMax ? prose(filled(p.deckSummary) ? p.deckSummary + '\n\n' + (p.description || '') : p.description, dMax) : filled(p.deckSummary);
      if (desc) {
        const d = text(els, { x, y, w, fit: false, paras: desc.split('\n').map((t, j) => P(sp(t, 'sans', 9 * k, th.fg, -0.012), { lead: 1.62, before: j ? 6 : 0 })) });
        y = d.bottom + 18 * k;
      } else y += 8 * k;
      // 레저는 0 에서 조판한 뒤 칼럼 바닥(BOT)에 붙인다 — 제목은 위, 기록은 아래 (벤토 하단선과 정렬)
      const led = [];
      let ly = 0;
      for (const row of facts(p, th)) {
        line(led, x, ly, x + w, ly, th.hair);
        const paras = row.paras.map(pp => ({ ...pp, spans: pp.spans.map(s0 => ({ ...s0, s: s0.s * k })) }));
        text(led, { x, y: ly + 11 * k, w: 70, anchor: 'baseline', paras: [P(label(row.k, th.fg2))] });
        const val = text(led, { x: x + PITCH, y: ly + 5 * k, w: w - PITCH, fit: false, paras });
        if (row.url) led.push({ t: 'link', x: x + PITCH, y: val.y, w: w - PITCH, h: val.h + 2, url: row.url });
        ly = val.bottom + 6 * k;
      }
      if (led.length) line(led, x, ly, x + w, ly, th.hair);
      const top = Math.max(y, BOT - ly);
      shift(led, top);
      if (top + ly <= BOT + 2 || k <= 0.74) return { els: els.concat(led), bottom: top + ly };
    }
  }

  // 디테일 — 좌 칼럼 / 우 크롭 인지 벤토
  async function detail(p, i, stills) {
    const th = LIGHT;
    const s = add(th, { rail: { mid: 'Selected Works', sub: scene(i) } });
    if (stills.length) {
      s.els.push(...column(p, i, th, MX, span(4)).els);
      const cells = bento(stills, cx(4), TOP, span(8), BOT - TOP, 8);
      for (const { c: [x, y, w, h], img } of cells) {
        const data = await bake(img, w, h, { quality: 80 });
        if (data) s.els.push({ t: 'img', data, x, y, w, h });
      }
    } else {
      // 스틸 없음 — 좌 칼럼 + 우측에 설명 전문을 두 단 에디토리얼로
      const colEls = column(p, i, th, MX, span(4), { descMax: 0 });
      s.els.push(...colEls.els);
      const full = prose(p.description, 1400);
      if (full) {
        // 짧은 설명은 인용문처럼 크게 (빈 종이 대신 한 문장이 페이지를 쥔다), 긴 설명은 읽는 크기로
        const short = full.length < 180;
        // 스틸 없는 영상 프로젝트 — 우하단에 거대한 장면 번호를 종이에 눌러 찍은 듯(헤어라인 톤) 앵커로 둔다
        if (full.length < 600) text(s.els, { x: cx(5), y: BOT + 6, w: span(7), anchor: 'last', align: 'right', paras: [P(sp(nn(i + 1), 'serif', 260, th.hair), { lead: 0.9 })] });
        text(s.els, { x: cx(5), y: TOP + 20, w: span(7), h: BOT - TOP - 20, balance: short,
          paras: full.split('\n').map((t, j) => short
            ? P(sp(t, j ? 'sans' : 'med', j ? 15 : 24, j ? th.fg2 : th.fg, -0.03), { lead: j ? 1.55 : 1.32, before: j ? 18 : 0 })
            : P(sp(t, 'sans', 12.5, th.fg, -0.018), { lead: 1.62, before: j ? 10 : 0 })) });
      }
    }
    return s;
  }

  // 스틸 스프레드 — 풀블리드 + 하단 필름 엣지 밴드(캡션)
  async function spread(p, i, stills, from) {
    const th = DARK;
    const s = add(th, { rail: null });
    const bandH = 36;
    const cells = bento(stills, 0, 0, W, H - bandH, 4);
    for (const { c: [x, y, w, h], img } of cells) {
      const data = await bake(img, w, h, { quality: 80 });
      if (data) s.els.push({ t: 'img', data, x, y, w, h });
    }
    const yb = H - 14;
    text(s.els, { x: MX, y: yb, w: span(6), anchor: 'baseline', maxLines: 1, paras: [P([label(`${scene(i)}   ·   `, th.fg2), sp(p.title || '', 'sans', 7.5, th.fg, -0.005)])] });
    s.captionRight = `Stills ${nn(from)}—${nn(from + cells.length - 1)}`;
    return s;
  }

  if (scope === 'all') {
    // 카탈로그 — 장(章) 구분 + 프로젝트당 1장
    const groups = [];
    projects.forEach((p, i) => { const g = groups[groups.length - 1]; if (g && g.cat === p.category) g.items.push(i); else groups.push({ cat: p.category, items: [i] }); });
    for (const [gi, g] of groups.entries()) {
      const th = DARK;
      const d = add(th, { rail: { mid: `Chapter ${nn(gi + 1)}` }, outline: CAT[g.cat] || g.cat });
      text(d.els, { x: MX, y: TOP + 6, w: span(4), anchor: 'baseline', paras: [P(label(`( Chapter ${nn(gi + 1)} )   ${nn(g.items.length)} works`, th.fg2))] });
      const word = CAT[g.cat] || String(g.cat);
      text(d.els, { x: MX - T.lsb(word[0], { f: 'semi', s: 168 }), y: BOT, w: span(8), anchor: 'last', paras: [P(sp(word, 'semi', 168, th.fg, -0.055), { lead: 0.9 })] });
      late.push(() => {
        const paras = g.items.map(i => P([sp(nn(projPage[i] || 0) + '   ', 'mono', 6.5, th.fg2, 0.04), sp(projects[i].title || 'Untitled', 'sans', 8, th.fg, -0.01)], { lead: 1.55 }));
        const b = text(d.els, { x: cx(8), y: TOP, w: span(4), h: BOT - TOP, paras, widow: false, minScale: 0.7 });
        b.paras.forEach((pp, k) => { const ln = pp.lines[0]; if (ln && projPage[g.items[k]]) d.els.push({ t: 'link', x: cx(8), y: ln.base - pp.pitch * 0.72, w: span(4), h: pp.pitch * pp.lines.length, page: projPage[g.items[k]] }); });
      });
      for (const i of g.items) {
        const p = projects[i];
        const img = imgs[i][0];
        const rows = facts(p, LIGHT);
        const sparse = !filled(p.deckSummary) && !filled(p.description) && rows.length < 2;
        if (img && sparse) { await hero(p, i, img); continue; }
        const s = add(LIGHT, { rail: { mid: CAT[p.category] || 'Works', sub: scene(i) }, outline: p.title || scene(i) });
        projPage[i] = slides.length;
        if (img) {
          const data = await bake(img, span(7), BOT - TOP, { quality: 80 });
          if (data) s.els.push({ t: 'img', data, x: MX, y: TOP, w: span(7), h: BOT - TOP });
        }
        s.els.push(...column(p, i, LIGHT, img ? cx(8) : MX, img ? span(4) : span(6), { descMax: 300 }).els);
      }
    }
  } else {
    for (let i = 0; i < projects.length; i++) {
      const p = projects[i];
      const list = imgs[i];
      await hero(p, i, list[0]);
      const stills = list.slice(1, 5);
      const hasText = filled(p.description) || facts(p, LIGHT).length >= 2;
      if (stills.length || hasText) await detail(p, i, stills);
      const more = list.slice(5, 8);
      if (more.length >= 2) await spread(p, i, more, 6);
    }
  }

  // ═══ 7. 마지막 장 — Let's create. (사이트 Contact 와 같은 문장) ═══
  {
    const th = DARK;
    const s = add(th, { rail: { mid: 'Contact', rule: KEY }, outline: 'Contact' });
    text(s.els, { x: MX - 6, y: 250, w: span(12), anchor: 'last', paras: [P([sp('Let’s ', 'semi', 112, th.fg, -0.05), sp('create', 'serif', 124, th.fg, -0.01), sp('.', 'semi', 112, th.fg, -0.05)], { lead: 0.95 })] });
    const rows = [['Email', email, email && `mailto:${email}`], ['Phone', phone, phone && `tel:${phone.replace(/[^\d+]/g, '')}`], ['Instagram', instaHandle, instaUrl], ['Web', 'hatist.studio', 'https://hatist.studio']].filter(r => r[1]);
    const x = cx(6), w = span(6), rowH = 34;
    let y = BOT - rows.length * rowH;
    for (const [k, v, url] of rows) {
      line(s.els, x, y, RIGHT, y, th.hair);
      text(s.els, { x, y: y + rowH * 0.62, w: span(1), anchor: 'baseline', paras: [P(label(k, th.fg2))] });
      text(s.els, { x: cx(7), y: y + rowH * 0.66, w: span(5), anchor: 'baseline', maxLines: 1, paras: [P(sp(v, 'med', 15, th.fg, -0.02))] });
      if (url) s.els.push({ t: 'link', x: cx(7), y: y + 4, w: span(5), h: rowH - 8, url });
      y += rowH;
    }
    line(s.els, x, y, RIGHT, y, th.hair);
    text(s.els, { x: MX, y: BOT, w: span(5), anchor: 'baseline', paras: [P(label(`Generated ${dateStr} from hatist.studio`, th.fg3))] });
  }

  // ═══ 인덱스 채우기 (장 번호 확정 후) ═══
  {
    const s = indexSlide, th = LIGHT;
    text(s.els, { x: MX, y: TOP + 34, w: span(6), anchor: 'baseline', paras: [P(sp('Index', 'semi', 40, th.fg, -0.035), { lead: 1 })] });
    text(s.els, { x: cx(8), y: TOP + 34, w: span(4), anchor: 'baseline', align: 'right', paras: [P(label(`${nn(projects.length)} works   ·   ${span_}`, th.fg2))] });
    const n = projects.length;
    const two = n > 14;
    const tables = two ? [[0, Math.ceil(n / 2)], [Math.ceil(n / 2), n]] : [[0, n]];
    const hasClient = !two && projects.some(p => filled(p.client));
    const hasYear = !two && projects.some(p => filled(p.year));
    const y0 = 150;
    tables.forEach(([a, b], ti) => {
      const x0 = two ? cx(ti * 6) : MX, x1 = two ? cx(ti * 6) + span(6) : RIGHT;
      const cols = two
        ? [['No.', x0, 40], ['Title', x0 + PITCH * 0.6, span(4)], ['Page', x1 - 40, 40, 'right']]
        : [['No.', cx(0), span(1)], ['Title', cx(1), span(hasClient || hasYear ? 5 : 7)],
           hasClient && ['Client', cx(6), span(2)], hasYear && ['Year', cx(8), span(1)],
           ['Discipline', cx(9), span(2)], ['Page', cx(11), span(1), 'right']].filter(Boolean);
      cols.forEach(([k, x, w, al]) => text(s.els, { x, y: y0, w, anchor: 'baseline', align: al || 'left', paras: [P(label(k, th.fg2))] }));
      line(s.els, x0, y0 + 8, x1, y0 + 8, th.fg, 0.6);
      const rowsN = b - a;
      const rowH = Math.min(two ? 22 : 30, (BOT - (y0 + 8)) / rowsN);
      const ts = two ? Math.min(9, rowH * 0.5) : Math.min(12, rowH * 0.44);
      for (let r = 0; r < rowsN; r++) {
        const i = a + r, p = projects[i];
        const top = y0 + 8 + r * rowH, base = top + rowH * 0.64;
        const cells = two
          ? { 'No.': sp(nn(i + 1), 'mono', 6.8, th.fg2), Title: sp(p.title || 'Untitled', 'med', ts, th.fg, -0.015), Page: sp(nn(projPage[i] || 0), 'mono', 6.8, th.fg2) }
          : { 'No.': sp(nn(i + 1), 'mono', 7.5, th.fg2), Title: sp(p.title || 'Untitled', 'med', ts, th.fg, -0.02), Client: sp(filled(p.client), 'sans', 8.5, th.fg2), Year: sp(filled(p.year), 'mono', 7.5, th.fg2), Discipline: label(catOf(p), th.fg2), Page: sp(nn(projPage[i] || 0), 'mono', 7.5, th.fg) };
        cols.forEach(([k, x, w, al]) => { if (cells[k] && cells[k].text) text(s.els, { x, y: base, w, anchor: 'baseline', align: al || 'left', maxLines: 1, paras: [P(cells[k])] }); });
        line(s.els, x0, top + rowH, x1, top + rowH, th.hair);
        if (projPage[i]) s.els.push({ t: 'link', x: x0, y: top, w: x1 - x0, h: rowH, page: projPage[i] });
      }
    });
  }
  late.forEach(fn => fn());

  // ═══ 레일 — 모든 장 같은 자리: Hati® / 섹션 / 장면 / 폴리오 ═══
  const total = slides.length;
  slides.forEach((s, idx) => {
    if (s.rail === null) {   // 스프레드: 레일 대신 하단 엣지 밴드 — 캡션 / 스틸 번호 / 폴리오
      if (s.captionRight) text(s.els, { x: cx(6), y: H - 14, w: span(3), anchor: 'baseline', paras: [P(label(s.captionRight, s.th.fg2))] });
      text(s.els, { x: cx(9), y: H - 14, w: span(3), anchor: 'baseline', align: 'right', paras: [P(label(`${nn(idx + 1)} / ${nn(total)}`, s.th.fg2))] });
      return;
    }
    const r = s.rail || {};
    const C = r.onImage ? ON_IMG : s.th;
    const first = idx === 0;
    text(s.els, { x: MX, y: RAIL, w: span(2), anchor: 'baseline', paras: [P(first ? label(r.left || '', C.fg2) : sp('Hati®', 'semi', 8.5, C.fg, -0.01))] });
    if (r.mid) text(s.els, { x: cx(3), y: RAIL, w: span(3), anchor: 'baseline', maxLines: 1, paras: [P(label(r.mid, C.fg2))] });
    if (r.sub) text(s.els, { x: cx(6), y: RAIL, w: span(3), anchor: 'baseline', maxLines: 1, paras: [P(label(r.sub, C.fg2))] });
    text(s.els, { x: cx(9), y: RAIL, w: span(3), anchor: 'baseline', align: 'right', paras: [P(label(first ? (r.right || '') : `${nn(idx + 1)} / ${nn(total)}`, C.fg2))] });
    if (!r.onImage) line(s.els, MX, RAIL + 10, RIGHT, RAIL + 10, r.rule || s.th.hair, r.rule ? 0.6 : 0.5);
  });

  const title = `Hati — Portfolio ${year}${scope === 'all' ? ' (Complete)' : ''}`;
  return { W, H, title, subject: 'Visual Creative Portfolio', slides };
}

async function buildDeckFiles({ portfolio, settings, scope = 'featured' }) {
  const deck = await buildDeck({ portfolio, settings, scope });
  const [pdf, pptx] = await Promise.all([renderPdf(deck), renderPptx(deck)]);
  return { pdf, pptx, pages: deck.slides.length };
}

module.exports = { buildDeck, buildDeckFiles, filled };
