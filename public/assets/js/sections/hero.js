// Hero v7.4 — 스테이트먼트 타이포 → 스크롤 웍스 롤 (aristide 필름스트립 물결)
// 전 작품(42)을 얇은 세로 스트립으로. 포커스 지점이 물결처럼 넓어지고 컬러가 되며,
// 스크롤에 따라 그 봉우리가 전 작품을 훑고 지나간다. GPU 변환(scaleX+translateX)만 사용.
import { pickThumb, safeThumb, driveThumbFallback } from './cards.js';

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export function initHero(settings, portfolio) {
  const hero = document.getElementById('hero');
  if (!hero) return;

  const eyebrow = document.getElementById('heroEyebrow');
  if (eyebrow) {
    const title = String(settings.heroTitle || '').trim() || 'Hati';
    eyebrow.textContent = `${title}® — Visual Creative Studio`;
  }
  const metaRoles = hero.querySelector('.hero__meta-roles');
  const subtitle = String(settings.heroSubtitle || '').trim();
  if (metaRoles && subtitle) metaRoles.textContent = subtitle;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lines = hero.querySelectorAll('.hero__line-inner');
  const foot = hero.querySelector('.hero__foot');

  // ── 롤 빌드 — 전 작품, 색상순 자동 배치 ──
  // 저장된 대표 색상(color:{h,s,l})으로 정렬: 저채도(그레이) 먼저(밝기순) → 컬러는 hue 스펙트럼 → 색상 없으면 끝(order).
  // 색상은 어드민이 업로드/저장 시 썸네일에서 자동 감지해 저장. 수동 order는 폴백용.
  const strip = document.getElementById('heroStrip');
  const ticksWrap = document.getElementById('heroTicks');
  const roll = document.getElementById('heroRoll');
  // 인트로 영상 색(주황 ~46°)을 기점으로 hue를 '내려가며' 회전 → 주황→빨강-주황→빨강→(반대로 돌아)보라→파랑→초록→노랑.
  // 따뜻한 색(빨강/브라운)이 주황 영상 바로 다음에 오도록. 같은 hue는 밝기순(주황→브라운 자연 연결). 그레이→무채색은 뒤로.
  const ANCHOR = Number.isFinite(+settings.reelAnchorHue) ? +settings.reelAnchorHue : 46;
  const colorRank = (p) => {
    const c = p.color;
    if (!c || typeof c !== 'object') return [3, (p.order ?? 0), p.id];
    if ((c.s ?? 0) < 0.12) return [2, (c.l ?? 0), 0];
    const hueRot = ((ANCHOR - (c.h ?? 0)) % 360 + 360) % 360;   // 내려가는 방향(주황→빨강)
    return [0, hueRot, (c.l ?? 0)];
  };
  const projects = (portfolio?.projects || [])
    .slice()
    .sort((a, b) => {
      const A = colorRank(a), B = colorRank(b);
      return (A[0] - B[0]) || (A[1] - B[1]) || (A[2] - B[2]) || (a.id - b.id);
    });

  const THUMB_W = window.innerWidth < 768 ? 400 : 600;   // 모바일 과대샘플 방지
  let MAXW = 120, MINW = 20, GAP = 6, SLATH = 560;
  const sizeConsts = () => {
    // aristidebenoist 레퍼런스 비율 — 얇고 촘촘한 세로 슬랫(더 많이 보임) + 넉넉한 상하 여백
    MAXW = window.innerWidth < 768
      ? Math.min(96, Math.round(window.innerWidth * 0.13))
      : Math.min(132, Math.round(window.innerWidth * 0.072));   // 포커스 슬랫 폭 (기존 14% → 7.2%)
    MINW = Math.max(15, Math.round(window.innerWidth * 0.02));
    GAP = 6;
    // 중앙 기준 높이(테이퍼는 프레임 루프의 scaleY가 담당) — 상하 여백 확보 위해 축소(78%→64%)
    SLATH = window.innerWidth < 768
      ? Math.round(Math.min(window.innerHeight * 0.42, 320))
      : Math.round(Math.min(window.innerHeight * 0.64, window.innerHeight - 230));
  };
  sizeConsts();

  const slats = [];
  if (strip && projects.length) {
    const frag = document.createDocumentFragment();
    projects.forEach(p => {
      const thumb = safeThumb(p, THUMB_W);
      const fb = driveThumbFallback(pickThumb(p));
      const a = document.createElement('a');
      a.className = 'hero__slat';
      a.href = `#project/${p.id}`;
      a.tabIndex = -1;                 // 롤은 시각적 티저 — AT/키보드 내비게이션은 All Works 인덱스가 담당
      a.dataset.cursor = 'view';
      a.style.width = MAXW + 'px';
      a.innerHTML = thumb
        ? `<img src="${escapeHtml(thumb)}" data-fb="${escapeHtml(fb)}" alt="" decoding="async" onerror="if(this.dataset.fb&&this.src!==this.dataset.fb){this.src=this.dataset.fb}else{this.remove()}">`
        : '';
      a.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.openProjectDetail) window.openProjectDetail(p.id);
      });
      frag.appendChild(a);
      slats.push(a);
    });
    strip.appendChild(frag);
    roll?.setAttribute('aria-hidden', 'true');   // 42개 슬랫이 스크린리더/탭 순서를 오염시키지 않도록

    if (ticksWrap) {
      projects.forEach(() => {
        const t = document.createElement('span');
        t.className = 'hero__tick';
        ticksWrap.appendChild(t);
      });
    }
  }
  const ticks = ticksWrap ? [...ticksWrap.children] : [];

  // ── 진입 리빌 (게이트 통과 시점) ──
  const lineMasks = hero.querySelectorAll('.hero__line');
  const clearClip = () => lineMasks.forEach(l => { l.style.overflow = 'visible'; });
  let played = false;
  const reveal = () => {
    if (played) return;
    played = true;
    if (reduced || !window.gsap) { clearClip(); return; }
    window.gsap.from(lines, {
      yPercent: 110, duration: 1.1, ease: 'power4.out', stagger: 0.12, delay: 0.1,
      onComplete: clearClip
    });
    window.gsap.from([eyebrow, hero.querySelector('.hero__meta'), foot].filter(Boolean), {
      opacity: 0, y: 12, duration: 0.8, ease: 'power2.out', stagger: 0.1, delay: 0.5
    });
  };
  if (sessionStorage.getItem('hati:entered')) reveal();
  else window.addEventListener('hati:entered', reveal, { once: true });

  // ── 폴백: reduced-motion / GSAP 부재 / 터치 → 정적 가로 스크롤 ──
  // 터치에선 42-슬랫 프레임 루프+320% 핀이 무겁고 물결이 뭉개지므로 정적 필름스트립으로.
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const canScrub = fine && !reduced && window.gsap && window.ScrollTrigger && strip && projects.length;
  if (!canScrub) {
    hero.classList.add('hero--static');
    slats.forEach(a => { a.style.width = ''; }); // CSS 정적 폭 사용
    return;
  }

  const gsap = window.gsap;
  const inner = hero.querySelector('.hero__inner');
  const pinEl = hero.querySelector('.hero__pin');
  let pinH = (pinEl && pinEl.getBoundingClientRect().height) || window.innerHeight;   // 영상 슬롯 수직정렬·풀블리드 높이용 (refresh에서 갱신)
  // media(=slot0)는 .hero__pin(grid+padding)의 컨텐츠박스 기준 배치 → left/top:0이 뷰포트 0이 아닌 padding만큼 안쪽.
  // 풀블리드(h=0) 시 이 오프셋을 상쇄해 뷰포트 0,0부터 덮게 함(슬롯 정렬 h=1은 슬랫과 동일 오프셋이라 그대로 정합).
  let offX = 0, offY = 0;
  const measureOff = () => {
    if (!pinEl) return;
    const cs = getComputedStyle(pinEl);
    offX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.borderLeftWidth) || 0);
    offY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.borderTopWidth) || 0);
  };
  measureOff();
  const N = slats.length;
  const imgs = slats.map(s => s.querySelector('img'));

  // ── 시네마틱 영상 인트로 (rideradian.com) — 스크롤로 재생 위치를 스크럽 ──
  // 자동재생/루프 대신 스크롤 진행도를 video.currentTime에 매핑 → 스크롤 다운=정방향, 업=되감기.
  const media = document.getElementById('heroMedia');
  const video = document.getElementById('heroVideo');
  const veil = document.getElementById('heroVeil');
  const scrim = hero.querySelector('.hero__scrim');
  const glow = document.getElementById('heroGlow');   // 색상 여정 앰비언트 글로우
  // media를 프레임 루프가 layout(left/top/width/height)으로 배치 → wave slot 0(영상 슬랫)로 흐름.
  // z-index 2로 릴 위 노출. inset/음수마진 대신 명시적 지오메트리 사용.
  // 풀블리드 구간은 CSS(inset:0 + 음수마진)에 맡긴다 — 지오메트리를 JS 인라인 px로 박지 않아
  // 리사이즈/스크롤 이탈 후에도 스테일 여백 없이 항상 뷰포트를 덮음. z-index/힌트만 인라인.
  // margin/right/bottom(=CSS 상쇄) 오버라이드는 축소 핸드오프(h>0) 시점에만 프레임 루프가 건다.
  if (media) { media.style.zIndex = '2'; media.style.willChange = 'left, top, width, height'; media._bleed = 1; }
  let vidDur = 0, vidReady = false;
  if (video) {
    video.loop = false;
    video.muted = true;
    video.preload = 'auto';
    if (!video.getAttribute('src') && !video.querySelector('source')) {
      video.src = settings.heroVideo || '/uploads/hero_cerial.mp4';
    }
    const markDur = () => { if (Number.isFinite(video.duration) && video.duration > 0) vidDur = video.duration; };
    video.addEventListener('loadedmetadata', markDur);
    // 디코딩 프라임 — 최초 재생→즉시 정지로 시킹 가능 상태 확보(일부 브라우저는 첫 seek 전 디코드 필요)
    const prime = () => {
      markDur();
      const pr = video.play?.();
      if (pr && pr.then) pr.then(() => { video.pause(); vidReady = true; }).catch(() => { vidReady = true; });
      else vidReady = true;
    };
    if (video.readyState >= 1) prime();
    else video.addEventListener('loadedmetadata', prime, { once: true });
    video.load();
  }

  roll.setAttribute('inert', '');
  roll.classList.add('hero__roll--dyn');
  strip.style.height = SLATH + 'px';

  // ── 직군 리엘 — 'Director of [단어]', 영상 스크럽 진행(vid.t)에 따라 단어가 순서대로 교체 ──
  const discEl = document.getElementById('heroDisc');
  const DISCS = ['Visual Creative', 'Photography', 'Graphic', 'Video', 'Generative AI'];
  let discNodes = [], discW = [], discIdx = -1;
  const setDisc = (i) => {
    i = Math.max(0, Math.min(DISCS.length - 1, i | 0));
    if (i === discIdx || !discNodes[i]) return;
    discNodes.forEach((s, k) => { s.classList.toggle('is-active', k === i); s.classList.toggle('is-out', k < i); });
    if (discW[i]) discEl.style.setProperty('--disc-w', discW[i] + 'px');
    discIdx = i;
  };
  const measureDisc = () => {
    if (!discEl) return;
    discW = discNodes.map(s => {
      const tr = s.style.transition;
      s.style.transition = 'none'; s.style.opacity = '1'; s.style.transform = 'none';
      const w = Math.ceil(s.offsetWidth);
      s.style.transition = tr; s.style.opacity = ''; s.style.transform = '';
      return w;
    });
    if (discIdx >= 0 && discW[discIdx]) discEl.style.setProperty('--disc-w', discW[discIdx] + 'px');
  };
  if (discEl) {
    discEl.innerHTML = '';   // HTML 기본 단어 제거 후 5개로 채움(리엘)
    discNodes = DISCS.map(w => { const s = document.createElement('span'); s.className = 'hero__disc-word'; s.textContent = w; discEl.appendChild(s); return s; });
    measureDisc();
    setDisc(0);
    window.ScrollTrigger.addEventListener('refresh', measureDisc);
  }

  // 타임라인(총 1.0): [0→VID] 영상 스크럽 · [VID→VID+SHR] 영상 '크기' 축소 핸드오프 · [VID+SHR→1] 롤 스윕
  const VID = 0.34;   // 영상 스크럽 구간
  const SHR = 0.16;   // 영상 축소 핸드오프 구간
  const vid = { t: 0 };          // 0..1 스크럽 진행(gsap scrub 스무딩) → currentTime 매핑
  const prox = { p: 0 };         // 롤 스윕 진행 0..1
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: hero,
      start: 'top top',
      end: '+=600%',            // 영상 스크럽(~200%) + 축소(~100%) + 42개 롤 스윕(~300%)
      scrub: 0.6,
      pin: '.hero__pin',
      pinSpacing: true,
      invalidateOnRefresh: true,
      refreshPriority: 12,   // 핀 refresh 순서 = DOM 순서(hero>selected>bleed>philosophy)로 좌표 정합
      onToggle(self) { self.isActive ? startFrames() : stopFrames(); },
      onUpdate() {
        const live = prox.p > 0.06;
        roll.classList.toggle('is-live', live);
        if (live) roll.removeAttribute('inert'); else roll.setAttribute('inert', '');
      }
    }
  });
  // 영상 스크럽 구간: currentTime 프록시 (줌 없음 — 스크럽 자체가 모션)
  tl.to(vid, { t: 1, ease: 'none', duration: VID }, 0);
  // 핸드오프 진행 hand.h(0→1) — 프레임 루프가 media(=릴 slot 0)를 full-bleed↔wave 슬랫으로 모프.
  // 영상이 시네마롤 슬랫(세로 사각형)으로 줄어들어 릴 '가장 왼쪽 첫 조각'으로 붙고, 이후 다른 슬랫과
  // '동일하게' wave를 타고 흐른다(프레임 루프가 slot 0을 layout으로 배치 → object-fit 재크롭, 왜곡 없음).
  const hand = { h: 0 };
  tl.to(hand, { h: 1, ease: 'power2.inOut', duration: SHR }, VID);
  if (scrim) tl.to(scrim, { opacity: 0, ease: 'power1.in', duration: SHR * 0.7 }, VID);
  tl.to(inner, { opacity: 0, y: -60, scale: 0.98, ease: 'power1.in', duration: 0.10 }, VID - 0.04);
  tl.to(roll, { opacity: 1, ease: 'none', duration: SHR * 0.55 }, VID + SHR * 0.45)
    .to(ticksWrap, { opacity: 1, ease: 'none', duration: SHR * 0.55 }, VID + SHR * 0.45)
    .to(prox, { p: 1, ease: 'none', duration: 1 - (VID + SHR) }, VID + SHR);

  const st = tl.scrollTrigger;
  window.ScrollTrigger.addEventListener('refresh', () => { sizeConsts(); pinH = (pinEl && pinEl.getBoundingClientRect().height) || window.innerHeight; measureOff(); slats.forEach(a => a.style.width = MAXW + 'px'); strip.style.height = SLATH + 'px'; });

  // 릴은 '스크롤 전용' — 마우스 호버로 포커스를 끌지 않는다.
  // (호버 focus-pull은 스크롤 없이도 릴을 재정렬시키고, 스크롤 중 포인터가 얹히면 focus가
  //  슬랫마다 튀어 '드르르륵' 버벅임을 만들어 제거함. 클릭 진입/커서 'view' 라벨은 유지.)

  // 물결 프레임 루프 — 얇은 스트립이 사인파처럼 부풀었다 가라앉음 + 완만한 중앙 포커스
  // wave 슬롯: 0 = 영상(media, 리딩 조각), 1..N = 프로젝트 슬랫(slats[i-1])
  const NW = N + 1;
  const smoothstep = (t) => t * t * (3 - 2 * t);
  const V_MAX = 4200;
  const TWO_PI = Math.PI * 2;
  const FREQ = 0.82;     // 크레스트 간격 (rad/슬랫)
  const CYCLES = 5;      // 스크롤 동안 파동이 흐르는 사이클 수
  const HY_MIN = 0.52;   // 가장자리 높이 비율 — 중앙 tall(1.0)→가장자리 short(테이퍼 실루엣, aristide)
  let vSmooth = 0;
  const widths = new Float64Array(NW);
  const lefts = new Float64Array(NW);
  const wide = new Float64Array(NW);
  const hgt = new Float64Array(NW);   // 슬롯별 높이 스케일(포커스 기반 테이퍼)

  const frame = () => {
    // 영상 스크럽 — 스무딩된 vid.t를 currentTime에 매핑 (rideradian 문법)
    if (video && vidReady && vidDur > 0) {
      const tt = Math.min(vidDur - 0.05, Math.max(0, vid.t * vidDur));
      if (!video.seeking && Math.abs((video.currentTime || 0) - tt) > 0.033) {
        try { video.currentTime = tt; } catch (_) {}
      }
    }
    // 직군 리엘 — 스크럽 진행에 따라 단어 교체 (Visual Creative → … → Generative AI)
    if (discEl) setDisc(vid.t * DISCS.length);

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const vc = vw / 2;
    const v = Math.min(Math.abs(st.getVelocity() || 0), V_MAX);
    vSmooth += (v - vSmooth) * (v > vSmooth ? 0.16 : 0.06);
    const speed = vSmooth / V_MAX;

    let focus = Math.max(0, Math.min(1, prox.p)) * (NW - 1);   // 스크롤 전용 포커스
    // 중앙 포커스 반경 — 속도 ↑ 시 넓게(더 완만)
    const cSig = 2.2 + speed * 2.4;
    const phase = prox.p * TWO_PI * CYCLES;
    // 벨로시티 줌 (Hati 지시 방향) — 빠름: 진폭 큼(중앙 크게, 크기차이 큼) /
    //   느림/정지: 진폭 작음(균일 리본, 크기차이 작음). vSmooth 비대칭 lerp(감쇠 느림)로 빠른 스크롤 뒤 대비가 잠깐 유지되다 가라앉음.
    const AMP_REST = 0.34;                             // 정지 시 진폭(작은 크기차이)
    const amp = AMP_REST + (1 - AMP_REST) * speed;     // 빠를수록 진폭↑(큰 크기차이)
    const FLAT = 0.30;                 // 균일 상태 기준 크기

    let x = 0;
    for (let i = 0; i < NW; i++) {
      const sine = 0.5 + 0.5 * Math.sin(i * FREQ - phase);     // 흐르는 파동 0..1
      const dd = (i - focus) / cSig;
      const center = Math.exp(-dd * dd);                        // 중앙 봉우리 (항상 최대)
      // 중앙은 확실한 포커스, 주변엔 사인 크레스트가 물결처럼 — 둘 중 큰 값
      let tf = Math.max(center, 0.78 * sine * (0.35 + 0.65 * center) + 0.14 * sine);
      if (tf > 1) tf = 1;
      // 포커스 진폭을 속도로 스케일 — 빠르면 FLAT로 수렴(균일), 느리면 tf 그대로(대비 큼)
      const t = FLAT + (tf - FLAT) * amp;
      const cH = FLAT + (center - FLAT) * amp;                  // 높이 테이퍼도 동일 진폭 스케일
      wide[i] = t;
      widths[i] = MINW + (MAXW - MINW) * t;
      // 높이 테이퍼는 포커스 봉우리(center)만 따름 — 사인 흔들림 배제해 위아래 곡선 실루엣이 매끈
      hgt[i] = HY_MIN + (1 - HY_MIN) * cH;
      lefts[i] = x;
      x += widths[i] + GAP;
    }
    // 포커스 슬랫 중심이 뷰포트 중앙에 오도록 원점 이동
    const fi = Math.min(NW - 1, Math.floor(focus));
    const fj = Math.min(NW - 1, fi + 1);
    const ff = focus - fi;
    const focusCenter = (lefts[fi] + widths[fi] / 2) * (1 - ff) + (lefts[fj] + widths[fj] / 2) * ff;
    // 시작(prox.p≈0)엔 slot0(영상)을 좌측 정렬 → 스크롤 진행 시 중앙 포커스로 블렌드
    const pad = Math.round(vw * 0.03);
    const cb = smoothstep(Math.max(0, Math.min(1, prox.p / 0.14)));
    const originLeft = pad - lefts[0];                 // slot0 왼쪽 정렬 (lefts[0]=0 → pad)
    const originX = originLeft + ((vc - focusCenter) - originLeft) * cb;

    const stripTop = Math.max(0, (pinH - SLATH) / 2);   // 프로젝트 슬랫과 동일한 수직정렬(핀 기준)
    const h = Math.max(0, Math.min(1, hand.h));

    // slot 0 = 영상(media) — full-bleed ↔ wave 슬롯0 을 layout으로 모프 (object-fit 재크롭, 왜곡 없음)
    if (media) {
      const tL = originX + lefts[0], tW = widths[0];
      if (h > 0.99 && tL + tW < -60) {                // 좌로 완전히 exit → 숨김 + 레이아웃 스킵
        if (media._vis !== 0) { media.style.visibility = 'hidden'; media._vis = 0; }
      } else {
        if (media._vis !== 1) { media.style.visibility = ''; media._vis = 1; }
        if (h <= 0.0015) {
          // 풀블리드 구간(영상 스크럽) — 지오메트리를 CSS(inset:0 + 음수마진)에 되돌려 항상 뷰포트를 정확히 덮는다.
          // JS 인라인 px는 리사이즈/스크롤 이탈 후 스테일 → 우/하단 여백의 원인이었음.
          if (media._bleed !== 1) {
            media.style.left = ''; media.style.top = ''; media.style.width = ''; media.style.height = '';
            media.style.right = ''; media.style.bottom = ''; media.style.margin = '';
            media._bleed = 1;
          }
        } else {
          // 축소 핸드오프(h>0) — slot 0(영상 슬랫)으로 모프. 명시 지오메트리 사용(CSS 상쇄 오버라이드 필요).
          if (media._bleed !== 0) {
            media.style.margin = '0'; media.style.right = 'auto'; media.style.bottom = 'auto';
            media._bleed = 0;
          }
          // 영상 슬롯도 프로젝트 슬랫과 동일한 높이 테이퍼 적용(중앙정렬 유지 위해 top 보정)
          const sy0 = hgt[0];
          const slotH = SLATH * sy0;
          const slotTop = stripTop + SLATH * (1 - sy0) / 2;
          // h→0: 풀블리드 근접 · h=1: 슬롯 위치(슬랫과 동일 오프셋이라 그대로)
          const L = tL * h - offX * (1 - h), T = slotTop * h - offY * (1 - h);
          const W = vw + (tW - vw) * h, H = pinH + (slotH - pinH) * h;
          media.style.left = L.toFixed(1) + 'px';
          media.style.top = T.toFixed(1) + 'px';
          media.style.width = W.toFixed(1) + 'px';
          media.style.height = H.toFixed(1) + 'px';
        }
      }
    }

    // slots 1..NW-1 = 프로젝트 슬랫 (scaleX transform — 컴포지터 경유)
    for (let i = 1; i < NW; i++) {
      const el = slats[i - 1];
      const s = widths[i] / MAXW;                // scaleX (얇을수록 압축)
      const tx = originX + lefts[i];
      // 화면 밖(양옆) 슬랫은 그리기 스킵으로 페인트 절약
      if (tx > vw + 40 || tx + widths[i] < -40) {
        if (el._vis !== 0) { el.style.visibility = 'hidden'; el._vis = 0; }
        continue;
      }
      if (el._vis !== 1) { el.style.visibility = ''; el._vis = 1; }
      // scaleX=폭 물결, scaleY=중앙 tall→가장자리 short 테이퍼 (origin left-center → 상하 대칭)
      el.style.transform = `translate3d(${tx.toFixed(2)}px,0,0) scaleX(${s.toFixed(4)}) scaleY(${hgt[i].toFixed(4)})`;
      const im = imgs[i - 1];
      if (im) {
        // filter는 리페인트 비용 → 16단계 양자화, 버킷 바뀔 때만 갱신
        const b = (wide[i] * 15) | 0;
        if (el._fb !== b) {
          el._fb = b;
          const t = b / 15;
          im.style.filter = `grayscale(${(1 - t).toFixed(2)}) brightness(${(0.5 + 0.5 * t).toFixed(2)})`;
        }
      }
    }
    // 활성 틱 — 프로젝트 인덱스 = round(focus) - 1 (slot0=영상은 틱 없음)
    const fa = Math.round(focus) - 1;
    for (let k = 0; k < ticks.length; k++) ticks[k].classList.toggle('is-on', k === fa);

    // 색상 여정 앰비언트 글로우 — 포커스 작품 색을 따라감 (롤 구간만 노출)
    if (glow) {
      const fp = Math.round(focus);
      const proj = fp >= 1 ? projects[fp - 1] : null;   // slot0=영상 → 앵커 색
      const col = (proj && proj.color) ? proj.color : { h: ANCHOR, s: 0.5 };
      const hb = ((col.h || 0) / 5) | 0;                // hue 5° 양자화 — 잦은 스타일 재설정 방지
      if (glow._hb !== hb) {
        glow._hb = hb;
        const sPct = Math.max(58, Math.min(92, Math.round((col.s || 0.4) * 155)));   // 색 더 진하게(Hati)
        glow.style.backgroundColor = `hsl(${Math.round(col.h || ANCHOR)}, ${sPct}%, 58%)`;
      }
      const op = prox.p > 0.015 ? 0.38 : 0;             // 더 밝게(Hati) · 롤 시작과 함께 · 인트로/정적엔 0
      if (glow._op !== op) { glow._op = op; glow.style.opacity = String(op); }
    }
  };

  let framesOn = false;
  function startFrames() { if (!framesOn) { framesOn = true; gsap.ticker.add(frame); } }
  function stopFrames() { if (framesOn) { framesOn = false; gsap.ticker.remove(frame); frame(); } }
  frame();
}
