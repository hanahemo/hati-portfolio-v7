// Hati Portfolio — Phase 1 서버 엔트리
// 프라이빗 사이트: noindex 헤더 + robots.txt / API / 정적 파일 서빙 / 어드민 스캐폴딩
try { require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') }); } catch (_) { /* dotenv 선택 */ }

const express = require('express');
const session = require('express-session');
const path = require('path');

const noindex = require('./middleware/noindex');
const apiRouter = require('./routes/api');
const adminRouter = require('./routes/admin');
const dataSource = require('./data/source');

const app = express();
const PORT = process.env.PORT || 3000;

// 전역: 검색 차단 헤더
app.use(noindex);

app.use(express.json({ limit: '10mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'hati-phase1-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production'
  }
}));

// API
app.use('/api', apiRouter);

// admin (Phase 1 스캐폴딩)
app.use('/admin', adminRouter);

// robots.txt
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send('User-agent: *\nDisallow: /\n');
});

// 정적 파일 (X-Robots-Tag는 전역 noindex 미들웨어가 담당)
// 캐시 정책:
//   - /uploads: 30일 (이미지/영상, 어드민에서 교체 시 파일명 자체가 타임스탬프 포함)
//   - /assets:  no-cache (버전 해시 없는 환경 — 매 요청 ETag 재검증, 변경 없으면 304)
//   - 기타:     캐시 없음
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use('/uploads', express.static(path.join(PUBLIC_DIR, 'uploads'), {
  maxAge: 30 * 24 * 60 * 60 * 1000,
  immutable: false,
  etag: true
}));
app.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets'), {
  etag: true,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache')
}));

// ── 테마 라우팅 — studio(새 사이트) / cereal(시리얼) ──
// / = 어드민 기본 테마(defaultTheme, 기본 studio). 홈은 항상 기본 테마로 열림(쿠키 지속 없음).
// /studio·/cereal = 해당 테마 직접 서빙(양쪽 전환 버튼이 여기로 이동).
const sendTheme = (res, theme) =>
  res.sendFile(path.join(PUBLIC_DIR, theme === 'cereal' ? 'cereal.html' : 'index.html'));
app.get('/', async (req, res) => {
  let theme = 'studio';
  try { const s = await dataSource.readSettings(); if (s && s.defaultTheme === 'cereal') theme = 'cereal'; }
  catch (_) {}
  sendTheme(res, theme);
});
app.get('/studio', (req, res) => sendTheme(res, 'studio'));
app.get('/cereal', (req, res) => sendTheme(res, 'cereal'));

app.use(express.static(PUBLIC_DIR));

// 404 폴백
app.use((req, res) => {
  res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
});

app.listen(PORT, () => {
  console.log(`[hati] server running — http://localhost:${PORT}`);
});
