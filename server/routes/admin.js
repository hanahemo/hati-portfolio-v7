// Phase 2 — 어드민 라우터 (인증 + 포트폴리오/설정 CRUD + 파일 업로드)
// 네온 빌보드 톤의 정적 SPA(public/admin/index.html)를 서빙하고,
// JSON 파일(server/data/*.json)을 소스 오브 트루스로 사용한다.

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { requireAdmin } = require('../middleware/auth');
const source = require('../data/source');

const router = express.Router();

const { UPLOADS_DIR } = require('../persist');   // 업로드는 볼륨(있으면)에 저장 → 재배포에도 유지
const ADMIN_DIR = path.join(__dirname, '..', '..', 'public', 'admin');

// ── 화이트리스트 ──
const ALLOWED_CATS = new Set(['photo', 'graphic', 'video']);
const ALLOWED_SETTINGS = new Set([
  'heroTitle', 'heroSubtitle', 'heroVideo', 'heroBackground', 'heroBackgroundType',
  'aboutText', 'aboutImage', 'aboutGallery',
  'contactEmail', 'contactInstagram', 'contactLinkedin', 'contactPhone',
  'philosophy', 'curtainMain', 'curtainSub', 'curtainAuthor',
  'clientLogos', 'featuredProjectIds',
  'keyColorA', 'keyColorB', 'est', 'reelAnchorHue', 'defaultTheme',
  'gateTitle', 'gateLogo',
  'deck'   // PPT 장표 전역 텍스트 (어드민 deck 탭: 커버 헤드라인/스테이트먼트/디렉터 노트/서비스)
]);
const ALLOWED_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif',
  '.mp4', '.mov', '.webm', '.m4v'
]);

// ── 데이터 소스 헬퍼 (JSON 파일 또는 Supabase) ──
async function readPortfolio() {
  return (await source.readPortfolio()) || { projects: [] };
}
async function writePortfolio(obj) { return source.writePortfolio(obj); }
async function readSettings() {
  return (await source.readSettings()) || {};
}
async function writeSettings(obj) { return source.writeSettings(obj); }

// http/https만 허용, javascript:/data: 등 차단
function safeUrl(val) {
  if (typeof val !== 'string' || !val.trim()) return '';
  try {
    const u = new URL(val);
    return ['http:', 'https:'].includes(u.protocol) ? val.slice(0, 500) : '';
  } catch { return ''; }
}
// 미디어 참조 — 절대 URL(http/https) 또는 사이트 상대경로(/uploads/... 등)
function safeMediaRef(val) {
  if (typeof val !== 'string' || !val.trim()) return '';
  const s = val.trim();
  if (s.startsWith('/') && !s.startsWith('//')) return s.slice(0, 500);
  return safeUrl(s);
}

function pickProject(body, base = {}) {
  return {
    id: base.id,
    category: ALLOWED_CATS.has(body.category) ? body.category : (base.category || 'photo'),
    title: typeof body.title === 'string' ? body.title.slice(0, 200) : (base.title || 'untitled'),
    description: typeof body.description === 'string' ? body.description.slice(0, 4000) : (base.description || ''),
    media: Array.isArray(body.media) ? body.media : (Array.isArray(base.media) ? base.media : []),
    order: body.order !== undefined ? Number(body.order) || 0 : (base.order ?? 0),
    tags: Array.isArray(body.tags) ? body.tags : (Array.isArray(base.tags) ? base.tags : []),
    externalLink: safeUrl(body.externalLink !== undefined ? body.externalLink : base.externalLink),
    // 케이스 스터디 상세 필드 — 미전송 시 기존 값 보존 (편집 시 데이터 유실 방지)
    role: typeof body.role === 'string' ? body.role.slice(0, 2000) : (base.role || ''),
    contribution: typeof body.contribution === 'string' ? body.contribution.slice(0, 200) : (base.contribution || ''),
    result: typeof body.result === 'string' ? body.result.slice(0, 4000) : (base.result || ''),
    // PPT 장표 전용 필드 (어드민 deck 탭에서 작성) — 미전송 시 기존 값 보존
    client: typeof body.client === 'string' ? body.client.slice(0, 200) : (base.client || ''),
    year: typeof body.year === 'string' ? body.year.slice(0, 20) : (base.year || ''),
    deckSummary: typeof body.deckSummary === 'string' ? body.deckSummary.slice(0, 600) : (base.deckSummary || ''),
    coverImage: safeMediaRef(body.coverImage !== undefined ? body.coverImage : base.coverImage),
    credits: Array.isArray(body.credits)
      ? body.credits
          .filter(c => c && (c.role || c.name))
          .map(c => ({ role: String(c.role || '').slice(0, 100), name: String(c.name || '').slice(0, 200) }))
      : (Array.isArray(base.credits) ? base.credits : []),
    // 대표 색상 {h,s,l} — 어드민이 썸네일에서 자동 감지, 시네마릴 색상순 자동배치용. 미전송 시 기존 보존.
    color: pickColor(body.color !== undefined ? body.color : base.color)
  };
}

// 색상 값 정규화 {h:0-360, s:0-1, l:0-1} 또는 null
function pickColor(c) {
  if (!c || typeof c !== 'object') return null;
  const h = Number(c.h), s = Number(c.s), l = Number(c.l);
  if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l)) return null;
  return { h: ((h % 360) + 360) % 360, s: Math.max(0, Math.min(1, s)), l: Math.max(0, Math.min(1, l)) };
}

// ── Multer 업로드 설정 ──
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_\-]/g, '_')
      .slice(0, 40) || 'file';
    cb(null, `${base}-${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const okMime = /^(image|video)\//.test(file.mimetype);
    const okExt = ALLOWED_EXT.has(ext);
    if (okMime && okExt) return cb(null, true);
    cb(new Error('허용되지 않는 파일 형식 (이미지/영상만, 실행 파일 금지)'), false);
  }
});

// ── 로그인 브루트포스 방어 (인메모리 레이트 리밋) ──
// 프로세스 재시작 시 초기화됨. 프라이빗 사이트이므로 충분.
const loginAttempts = new Map(); // ip → { count, until }
function rateLimitLogin(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (rec && rec.until > now && rec.count >= 10) {
    const retry = Math.ceil((rec.until - now) / 1000);
    res.set('Retry-After', String(retry));
    return res.status(429).json({ error: `too many attempts. retry in ${retry}s` });
  }
  if (!rec || rec.until <= now) {
    loginAttempts.set(ip, { count: 0, until: now + 15 * 60 * 1000 });
  }
  next();
}

// ── 인증 ──
router.post('/login', rateLimitLogin, express.json(), (req, res) => {
  const pw = String((req.body && req.body.password) || '');
  const expected = String(process.env.ADMIN_PASSWORD || 'hati-admin');
  const a = Buffer.from(pw);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);

  const ip = req.ip || 'unknown';
  const rec = loginAttempts.get(ip) || { count: 0, until: Date.now() + 15 * 60 * 1000 };
  if (!ok) {
    rec.count += 1;
    loginAttempts.set(ip, rec);
    return res.status(403).json({ error: 'wrong password' });
  }
  loginAttempts.delete(ip);
  req.session.isAdmin = true;
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/auth/status', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// ── 페이지 ──
router.get('/login', (req, res) => {
  res.sendFile(path.join(ADMIN_DIR, 'login.html'));
});

router.get('/', requireAdmin, (req, res) => {
  res.sendFile(path.join(ADMIN_DIR, 'index.html'));
});

// ── 이하 API는 인증 필요 ──
router.use('/api', requireAdmin);
router.use('/api', express.json({ limit: '10mb' }));

router.get('/api/portfolio', async (req, res) => {
  try { res.json(await readPortfolio()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.get('/api/settings', async (req, res) => {
  try { res.json(await readSettings()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// 프로젝트 생성
router.post('/api/portfolio', async (req, res) => {
  try {
    const data = await readPortfolio();
    const newId = data.projects.length ? Math.max(...data.projects.map(p => p.id)) + 1 : 1;
    const project = pickProject(req.body || {}, { id: newId, order: newId });
    project.id = newId;
    data.projects.push(project);
    await writePortfolio(data);
    res.json(project);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// reorder — 반드시 :id 라우트보다 먼저 선언 (QA C-01)
router.put('/api/portfolio/reorder', async (req, res) => {
  try {
    const order = req.body && req.body.order;
    if (!Array.isArray(order)) return res.status(400).json({ error: 'invalid payload' });
    const data = await readPortfolio();
    const map = new Map(order.map((id, idx) => [Number(id), idx]));
    data.projects.forEach(p => { if (map.has(p.id)) p.order = map.get(p.id); });
    await writePortfolio(data);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 색상 일괄 저장 — 반드시 :id 라우트보다 먼저 (시네마릴 색상순 자동배치용)
router.put('/api/portfolio/colors', async (req, res) => {
  try {
    const colors = req.body && req.body.colors;
    if (!colors || typeof colors !== 'object') return res.status(400).json({ error: 'invalid payload' });
    const data = await readPortfolio();
    data.projects.forEach(p => {
      if (Object.prototype.hasOwnProperty.call(colors, p.id)) p.color = pickColor(colors[p.id]);
    });
    await writePortfolio(data);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 프로젝트 수정 (화이트리스트 픽)
router.put('/api/portfolio/:id', async (req, res) => {
  try {
    const data = await readPortfolio();
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
    const idx = data.projects.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'not found' });
    data.projects[idx] = pickProject(req.body || {}, data.projects[idx]);
    data.projects[idx].id = id;
    await writePortfolio(data);
    res.json(data.projects[idx]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/portfolio/:id', async (req, res) => {
  try {
    const data = await readPortfolio();
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
    data.projects = data.projects.filter(p => p.id !== id);
    await writePortfolio(data);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// settings — 허용 키만 병합
router.put('/api/settings', async (req, res) => {
  try {
    const cur = await readSettings();
    const patch = Object.fromEntries(
      Object.entries(req.body || {}).filter(([k]) => ALLOWED_SETTINGS.has(k))
    );
    // deck 은 자유 객체가 아니라 정해진 문자열 필드만
    if (patch.deck !== undefined) {
      const d = patch.deck && typeof patch.deck === 'object' ? patch.deck : {};
      const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
      patch.deck = {
        coverHeadline: str(d.coverHeadline, 200),
        statement: str(d.statement, 300),
        introText: str(d.introText, 2000),
        services: str(d.services, 1000),
      };
    }
    const merged = { ...cur, ...patch };
    await writeSettings(merged);
    res.json(merged);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/api/featured', async (req, res) => {
  try {
    const ids = req.body && req.body.ids;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'invalid payload' });
    const cur = await readSettings();
    cur.featuredProjectIds = ids.map(n => Number(n)).filter(n => !isNaN(n));
    await writeSettings(cur);
    res.json({ ok: true, featuredProjectIds: cur.featuredProjectIds });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'no file' });
    const type = req.file.mimetype.startsWith('video') ? 'video' : 'image';
    res.json({ url: `/uploads/${req.file.filename}`, type, size: req.file.size });
  });
});

// ── PPT 내보내기 — 현재 데이터의 스냅샷을 기업 제출용 표준 덱으로 (server/ppt/deck.js) ──
// deck 모듈은 네이티브 의존성(sharp)을 물어 lazy require — 로드 실패해도 사이트 전체는 죽지 않고
// 이 엔드포인트만 500 을 낸다.
router.get('/api/export-ppt', async (req, res) => {
  try {
    const { buildDeckBuffer } = require('../ppt/deck');
    const scope = req.query.scope === 'all' ? 'all' : 'featured';
    const [portfolio, settings] = await Promise.all([readPortfolio(), readSettings()]);
    const buf = await buildDeckBuffer({ portfolio, settings, scope });
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="Hati_Portfolio_${ymd}_${scope}.pptx"`);
    res.send(buf);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
