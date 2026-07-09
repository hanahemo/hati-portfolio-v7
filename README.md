# Hati Portfolio — neon billboard

프라이빗 포트폴리오 사이트. 네온 옐로우(#FDFF00) / 블랙 시그니처, 소문자 모노 타이포, 라운디드 24px 카드 그리드, 스크롤 + 호버 마이크로 인터랙션.

**기술:** Node.js + Express + 순수 HTML/CSS/JS + CDN (Lenis / GSAP / SplitType)
**데이터:** 로컬 JSON(`server/data/*.json`) 또는 Supabase(선택) 자동 분기
**어드민:** `/admin` (인증 + CRUD + 드래그 정렬 + 업로드)

---

## 빠른 시작

```bash
cd src
npm install
npm start         # http://localhost:3000
```

로컬 개발:
```bash
npm run dev       # node --watch (변경 시 자동 재시작)
```

### 환경변수 (`.env`)
`.env.example` 복사 후 수정. **반드시 교체**:
```
SESSION_SECRET=<openssl rand -hex 32>
ADMIN_PASSWORD=<강력한 패스워드>
PORT=3000

# (선택) Supabase 사용 시
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_xxxxx
```

---

## 파일 구조

```
src/
├── server/
│   ├── index.js              엔트리 (세션, noindex, 캐시 헤더)
│   ├── routes/api.js         공개 API: GET /api/portfolio, /api/settings
│   ├── routes/admin.js       어드민 API: CRUD, 업로드, reorder, featured
│   ├── middleware/noindex.js X-Robots-Tag 전역 적용
│   ├── middleware/auth.js    requireAdmin 세션 검증
│   └── data/
│       ├── source.js         Supabase ↔ JSON 추상화 (atomic write)
│       ├── portfolio.json    42개 프로젝트
│       └── settings.json     hero/about/clients/featured
├── public/
│   ├── index.html            8개 섹션 한 페이지
│   ├── 404.html              네온 빌보드 404
│   ├── robots.txt            Disallow: /
│   ├── admin/                어드민 SPA (4탭: projects/featured/settings/media)
│   ├── assets/
│   │   ├── css/              tokens / base / 섹션별
│   │   ├── js/               main + sections (ESM)
│   │   └── images/           로고 · 파비콘 · OG · grain
│   └── uploads/              히어로 영상/갤러리 이미지
└── scripts/
    ├── audit-portfolio.js    데이터 감사 리포트
    ├── populate-external-links.js  media[0]→externalLink 자동 채움
    └── convert-og-image.js   OG SVG → PNG (1200×630)
```

---

## npm scripts

| 명령 | 설명 |
|---|---|
| `npm start` | 프로덕션 서버 |
| `npm run dev` | 핫 리로드 (node --watch) |
| `npm run og` | OG 이미지 재생성 (svg → png) |

---

## 어드민

- **URL:** `/admin/login` → 비밀번호 입력 → `/admin`
- **탭:**
  - projects — CRUD + 검색/카테고리 필터 + 드래그 정렬 + externalLink
  - featured — 좌(전체 토글) / 우(순서 드래그) → Selected Works 시네마
  - reel order — 히어로 시네마릴 전 작품 순서(썸네일 드래그 = `order`) + **✦ 색상순 자동 정렬**(썸네일 색상 인식 → hue 스펙트럼 배치)
  - settings — 히어로(heroVideo)·est·키컬러·어바웃·연락처·philosophy / **about gallery·client logos = 이미지 업로드 위젯**
  - projects — media는 **구글드라이브 주소 입력 행**(타입 select + URL), 첫 항목이 대표 썸네일
  - media — 드래그앤드롭 업로드 + 미리보기 + URL 복사
- **보안:** 레이트 리밋(15분/10회), timingSafeEqual, 화이트리스트 필드, `javascript:` URL 차단, 파일 확장자 화이트리스트, 네온 확인 다이얼로그

---

## 데이터 관리

### 포트폴리오 스키마 (projects[])
```ts
{
  id: number;             // 자동 할당
  category: "photo" | "graphic" | "video";
  title: string;
  description: string;
  media: { url: string; type: "image" | "video" }[];
  externalLink: string;   // http/https만 허용 (javascript: 차단)
  order: number;          // 드래그 정렬 반영
  tags: string[];
}
```

### Settings (settings.json)
- `heroTitle`, `heroSubtitle`, `heroBackground` (히어로 영상 경로)
- `aboutText`, `aboutImage`, `aboutGallery` (5장)
- `contactEmail`, `contactInstagram`, `contactPhone`
- `philosophy`, `curtainMain`, `curtainSub`, `curtainAuthor` (Gate 문구)
- `clientLogos[]` (8개, `/images/logos/*.png` 경로)
- `featuredProjectIds[]` (9개 선정)

### 데이터 감사
```bash
node scripts/audit-portfolio.js
```
리포트: description 빈 프로젝트, 중복 미디어, 잘못된 카테고리 등.
최신 감사 결과: `../docs/data-audit.md`

---

## Supabase 연동 (선택)

`.env`에 `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` 설정하고 `@supabase/supabase-js` 설치:

```bash
npm i @supabase/supabase-js
```

**테이블 스키마 (단일 `data_store`):**
```sql
create table data_store (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz default now()
);
-- RLS 활성화, service_role만 읽기/쓰기 허용
alter table data_store enable row level security;
create policy "service-only" on data_store
  for all using (auth.role() = 'service_role');
```

**초기 마이그레이션 (1회):**
```sql
insert into data_store (key, value) values ('portfolio', '...(portfolio.json 내용)...');
insert into data_store (key, value) values ('settings',  '...(settings.json 내용)...');
```

env + 모듈 둘 다 없으면 로컬 JSON으로 자동 폴백. 회귀 위험 없음.

---

## 배포 가이드 (Railway + GitHub 연결용)

### 1. GitHub 리포 생성
```bash
cd /Volumes/박성건_SSD_01/260411_portfolio\ page
git init
git add src/ docs/ design/ strategy/ research/ CLAUDE.md
git commit -m "initial — hati portfolio neon billboard"
git remote add origin <your-repo-url>
git push -u origin main
```

**.gitignore** (프로젝트 루트에 생성):
```
src/node_modules/
src/.env
src/public/uploads/*.tmp
.DS_Store
```

### 2. Railway 설정
- **New Project → Deploy from GitHub** → 리포 선택
- **Root Directory:** `src` (중요 — package.json이 있는 곳)
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Variables (반드시):**
  - `SESSION_SECRET` (openssl로 강력하게)
  - `ADMIN_PASSWORD`
  - `NODE_ENV=production` (쿠키 secure 플래그 활성)
- Supabase 쓸 거면: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, 그리고 `@supabase/supabase-js`를 `dependencies`로 이동

### 3. 도메인 연결
- Railway → Settings → Domains → Custom Domain
- DNS에 CNAME 추가 (`hati.studio → your-project.up.railway.app`)
- HTTPS는 자동 (Let's Encrypt)
- **프라이빗 주의:** robots.txt + meta noindex + X-Robots-Tag 3중 보호가 기본 동작. 구글/빙에 URL만 알려주지 않으면 됩니다.

### 4. 업로드 파일 주의
Railway는 재배포 시 파일시스템 초기화됨. `/public/uploads/`의 어드민 업로드 파일이 사라집니다.
→ **해결**: 어드민에서 중요한 파일은 repo에 포함시키거나 S3/Supabase Storage로 옮기세요 (Phase 4 유예).

---

## 체크리스트

**릴리스 전 필수:**
- [ ] `.env` 실값 세팅 (SESSION_SECRET, ADMIN_PASSWORD)
- [ ] 어드민에서 description 빈 프로젝트 채움 (18개, `../docs/data-audit.md`)
- [ ] Drive 공유 권한 "링크 있는 사람에게 공개" 확인 (썸네일 API 의존)
- [ ] 브라우저에서 /, /#photo, /#graphic, /#video, /admin/login 동선 확인
- [ ] 모바일(< 768px)에서 카드/마퀴 동작 확인

**Phase 4 유예:**
- Supabase Storage로 업로드 마이그레이션
- 어드민 이미지 최적화 (sharp webp 변환)
- 로그/모니터링(Axiom, LogRocket 등)

---

## 참고

- 전략: `../strategy/plan-v5.1.md`
- 디자인: `../design/visual-direction-v5.1.md`
- QA: `../docs/qa-implementation-v5.1.md`, `qa-phase2.md`, `qa-phase3.md`, `a11y-audit.md`
- 데이터 감사: `../docs/data-audit.md`
