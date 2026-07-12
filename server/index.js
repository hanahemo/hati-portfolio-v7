// Hati Portfolio — Phase 1 서버 엔트리
// 프라이빗 사이트: noindex 헤더 + robots.txt / API / 정적 파일 서빙 / 어드민 스캐폴딩
try { require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') }); } catch (_) { /* dotenv 선택 */ }

const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const noindex = require('./middleware/noindex');
const apiRouter = require('./routes/api');
const adminRouter = require('./routes/admin');
const dataSource = require('./data/source');
const persist = require('./persist');   // 볼륨 경로(데이터/업로드) 해석 + 시드

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

// On-demand 썸네일 — /uploads/<file>?w=<폭> 이면 원본을 그 폭의 WebP로 줄여 내려준다.
// 폰 카메라 원본(3~6MB)을 74~144px로 쓰던 크레딧/어바웃이 원본 전체를 받아 모바일이 버벅이던 문제 해결.
// 결과물은 볼륨의 .cache 에 저장(폭별 불변) → 재요청·재배포에도 재계산 없음. ?w 없으면 아래 static으로 폴백.
const RESIZE_CACHE = path.join(persist.UPLOADS_DIR, '.cache');
try { fs.mkdirSync(RESIZE_CACHE, { recursive: true }); } catch (_) {}
app.get('/uploads/:file', async (req, res, next) => {
  const w = parseInt(req.query.w, 10);
  if (!Number.isFinite(w)) return next();                         // ?w 없음 → 원본 static
  const width = Math.min(1600, Math.max(48, w));
  const src = path.join(persist.UPLOADS_DIR, req.params.file);
  if (!src.startsWith(persist.UPLOADS_DIR + path.sep)) return next();   // 경로 이탈 차단
  const cached = path.join(RESIZE_CACHE, `${req.params.file}.w${width}.webp`);
  res.type('image/webp');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');  // 폭별 파생물은 불변
  if (fs.existsSync(cached)) return res.sendFile(cached);
  try {
    const buf = await sharp(src).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
    fs.writeFile(cached, buf, () => {});                          // 캐시에 비동기 기록
    return res.send(buf);
  } catch (_) { return next(); }                                  // 이미지 아님/실패 → 원본 폴백
});
app.use('/uploads', express.static(persist.UPLOADS_DIR, {
  maxAge: 30 * 24 * 60 * 60 * 1000,
  immutable: false,
  etag: true
}));
app.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets'), {
  etag: true,
  setHeaders: (res, filePath) => {
    // 버전 해시 없는 환경 — JS/CSS는 캐시 금지.
    // no-cache(재검증)는 모바일 크롬이 bfcache/디스크캐시로 재검증을 건너뛰고 옛 코드를 물고 있는 사례가 있어,
    // 재배포 후 즉시 최신을 강제하려면 no-store 가 확실하다. 이미지/폰트/그레인 등 안정 에셋은 계속 캐시.
    if (/\.(?:js|mjs|css)$/i.test(filePath)) res.setHeader('Cache-Control', 'no-store');
    else res.setHeader('Cache-Control', 'public, max-age=86400');
  }
}));

// ── 테마 라우팅 — studio(새 사이트) / cereal(시리얼) ──
// / = 어드민 기본 테마(defaultTheme, 기본 studio). 홈은 항상 기본 테마로 열림(쿠키 지속 없음).
// /studio·/cereal = 해당 테마 직접 서빙(양쪽 전환 버튼이 여기로 이동).
const sendTheme = (res, theme) => {
  res.setHeader('Cache-Control', 'no-store');   // 엔트리 HTML은 항상 새로 — 최신 에셋 참조를 확실히 물게
  res.sendFile(path.join(PUBLIC_DIR, theme === 'cereal' ? 'cereal.html' : 'index.html'));
};
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
