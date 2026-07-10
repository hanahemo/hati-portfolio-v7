// Hati Portfolio — main entry (v7)
import { loadData } from './data.js';
import { initCursor } from './cursor.js';
import { initScroll } from './lenis-gsap.js';
import { initGate } from './sections/gate.js';
import { initHero } from './sections/hero.js';
import { initAllWorks, safeThumb } from './sections/cards.js';
import { initSelected } from './sections/selected.js';
import { initPhilosophy } from './sections/philosophy.js';
import { initClients } from './sections/clients.js';
import { initAbout } from './sections/about.js';
import { initContact } from './sections/contact.js';
import { initProjectModal } from './project-modal.js';

// 이전 스크롤 위치 기억 금지 — 새로고침/뒤로가기 시에도 항상 최상단(타이틀)에서 시작
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

// 게이트/히어로 진입 상태 결정 (gate.js·hero.js가 sessionStorage 'hati:entered'를 읽음).
// 테마 전환(studio↔cereal)으로 넘어온 경우에만 URL에 ?nogate=1이 붙어 게이트를 스킵.
// 새 방문·새로고침엔 파라미터가 없어 항상 '처음부터'(게이트 → 인트로) 시작.
try {
  const params = new URLSearchParams(location.search);
  if (params.has('nogate')) {
    sessionStorage.setItem('hati:entered', '1');
    params.delete('nogate');                       // 새로고침 시 다시 게이트 뜨도록 파라미터 제거
    const qs = params.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  } else {
    sessionStorage.removeItem('hati:entered');
  }
} catch (_) {}

// ── 시네마틱 프리로더 — 썸네일 실로딩과 동기화된 % 카운터 (elva 문법) ──
function runLoader() {
  const loader = document.getElementById('loader');
  const pct = document.getElementById('loaderPct');
  if (!loader || !pct) return { setProgress: () => {}, finish: () => {} };

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MIN_MS = reduced ? 0 : 1100;
  const start = performance.now();
  let display = 0;
  let target = 6;            // 시작 직후 살짝 진행
  let real = 0;              // 실제 로드 진행 (0..1)
  let done = false;

  requestAnimationFrame(() => loader.classList.add('is-ready'));

  const tick = () => {
    target = Math.max(target, 6 + real * 88);   // 실진행 기반 (최대 94, finish 시 100)
    display += (target - display) * 0.09;
    pct.textContent = `${String(Math.round(display)).padStart(3, '0')}%`;
    if (done && display > 99.2) { dismiss(); return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  const dismiss = () => {
    if (!loader.isConnected) return;
    pct.textContent = '100%';
    loader.classList.add('is-done');
    window.dispatchEvent(new CustomEvent('hati:loaded'));   // 게이트 워드마크 등장 트리거
    setTimeout(() => loader.remove(), 900);
  };

  return {
    setProgress(frac) { real = Math.max(real, Math.min(1, frac)); },
    finish() {
      const wait = Math.max(0, MIN_MS - (performance.now() - start));
      setTimeout(() => { real = 1; target = 100; done = true; }, wait);
      // rAF가 스로틀된 탭(백그라운드 등)에서도 로더가 반드시 닫히도록 하드 폴백
      setTimeout(dismiss, wait + 2000);
    }
  };
}

// ── 웍스 롤 썸네일 프리로드 — 로더 %와 동기화, 롤 팝인 방지 ──
function preloadThumbs(projects, onProgress, timeoutMs = 8000) {
  const urls = projects
    .map(p => safeThumb(p, 600))
    .filter(Boolean);
  if (!urls.length) return Promise.resolve();
  let loaded = 0;
  const bump = () => onProgress(++loaded / urls.length);
  const all = Promise.all(urls.map(u => new Promise(res => {
    const img = new Image();
    img.onload = img.onerror = () => { bump(); res(); };
    img.src = u;
  })));
  // 느린 회선 가드 — 일정 시간 후엔 그냥 진행
  return Promise.race([all, new Promise(r => setTimeout(r, timeoutMs))]);
}

(async function boot() {
  const loader = runLoader();

  // 스크롤 엔진 먼저 기동 (Lenis 인스턴스 보관 — 최상단 리셋용)
  const lenis = initScroll();
  if (lenis) window.__lenis = lenis;
  const toTop = () => {
    window.scrollTo(0, 0);
    if (lenis && lenis.scrollTo) lenis.scrollTo(0, { immediate: true });
  };
  toTop();
  // 게이트/로더가 떠 있는 동안 스크롤 잠금 — 진입(gate.js) 또는 이미-진입 시 재개
  lenis?.stop();

  const { portfolio, settings } = await loadData();

  // 키컬러 — 어드민 settings 연동 (유효한 hex만 적용, 아니면 tokens.css 기본값)
  const HEX = /^#[0-9a-fA-F]{6}$/;
  if (HEX.test(settings.keyColorA || '')) document.documentElement.style.setProperty('--key-a', settings.keyColorA);
  if (HEX.test(settings.keyColorB || '')) document.documentElement.style.setProperty('--key-b', settings.keyColorB);

  // ── Stats 크레덴셜 밴드 (monolog 참고) — 데이터에서 산출 ──
  const statsRow = document.getElementById('statsRow');
  if (statsRow) {
    const projects = portfolio.projects || [];
    const works = projects.length;
    const clients = (settings.clientLogos || []).filter(l => l && l.url).length;
    const disciplines = 4;   // Photo · Graphic · Video · Generative AI (브랜드 정체성)
    const est = String(settings.est || '2024');
    const pad = n => String(n).padStart(2, '0');
    const items = [
      { num: pad(works), label: 'Selected Works' },
      { num: pad(clients), sup: '+', label: 'Clients' },
      { num: pad(disciplines), label: 'Disciplines' },
      { num: est, label: 'Est. Seoul' },
    ];
    statsRow.innerHTML = items.map(s => `
      <div class="stat">
        <dt class="stat__label">${s.label}</dt>
        <dd class="stat__num">${s.num}${s.sup ? `<span class="stat__sup">${s.sup}</span>` : ''}</dd>
      </div>`).join('');
  }

  initGate(settings, lenis);
  initHero(settings, portfolio);
  initSelected(portfolio, settings);
  initAllWorks(portfolio);
  initPhilosophy(settings);
  initClients(settings);
  initAbout(settings);
  initContact(settings);
  initProjectModal({ portfolio, settings, lenis });

  // 커서는 DOM이 모두 그려진 뒤
  initCursor();

  // HUD 내비 — 네이티브 해시 점프 대신 Lenis 스무스 스크롤 (해시 변경이 All Works 필터를 리셋하던 부작용 제거)
  const hud = document.getElementById('hud');
  hud?.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const sel = a.getAttribute('href');
    const target = sel === '#main' ? document.body : document.querySelector(sel);
    if (target && lenis?.scrollTo) {
      e.preventDefault();
      lenis.scrollTo(sel === '#main' ? 0 : target, { offset: 0 });
    }
  });

  // 롤(Selected Works) 썸네일 + 폰트까지 준비되면 로더 종료 (실패해도 진행)
  try {
    const byId = new Map((portfolio.projects || []).map(p => [p.id, p]));
    const featured = (settings.featuredProjectIds || []).map(id => byId.get(id)).filter(Boolean);
    await Promise.all([
      preloadThumbs(featured, f => loader.setProgress(f)),
      Promise.race([document.fonts?.ready, new Promise(r => setTimeout(r, 2500))])
    ]);
  } catch (_) {}
  loader.finish();

  // 레이아웃/폰트 안정화 후 한 번 더 최상단 고정 (프리로드 중 발생한 스크롤 방지)
  toTop();

  // 섹션 리빌 — 스크롤 진입 시 페이드 인.
  // 핀(#philosophy)·자체 모션 보유(#works=인덱스 배치 리빌, #about=스태거) 섹션은 제외 —
  // 핀 대상에 opacity/transform from을 걸면 GSAP 안티패턴(핀 흔들림) + 중복 트리거가 됨.
  if (window.gsap && window.ScrollTrigger && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.ScrollTrigger.config({ ignoreMobileResize: true });   // 모바일 URL바 토글로 인한 리핀 튐 방지

    // ── 2막 진입 (Selected→Index) — Selected '마지막 프레임 그 자체'가 제자리에서 확대되어 배경이 됨 ──
    // 별도 창을 새로 띄우지 않는다: 시네마 마지막 프레임이 중앙 포커스(scale 1)가 된 그 순간의
    // 실제 사각형(위치·크기·크롭, selected.js가 window.__cinemaEnd에 기록)에서 시작해 그대로 확대.
    // 핀 없이 selected 해제 시점(마지막 프레임 중앙)부터 스크럽 → 드리프트 공백 없이 이어짐.
    const actBg = document.getElementById('actBg');
    const actBgFrame = document.getElementById('actBgFrame');
    const actBgImg = document.getElementById('actBgImg');
    const actBgGrain = document.getElementById('actBgGrain');
    const actBgScrim = document.getElementById('actBgScrim');
    const cinemaTrack = document.getElementById('cinemaTrack');   // 인수인계 순간 숨겨서 고스트(원본↔복사본 이중노출) 제거
    if (actBg && actBgFrame && actBgImg && document.getElementById('bleed') && document.getElementById('selected')) {
      const byId = new Map((portfolio.projects || []).map(p => [p.id, p]));
      const feats = (settings.featuredProjectIds || []).map(id => byId.get(id)).filter(Boolean);
      const last = feats[feats.length - 1] || (portfolio.projects || [])[0];

      let coverScale = 4;   // 뷰포트를 완전히 덮는 배율 (layout()에서 갱신)
      const layout = () => {
        const vw = window.innerWidth, vh = window.innerHeight;
        const end = window.__cinemaEnd;
        let W, H, cx, cy;
        if (end && end.W) { W = end.W; H = end.H; cx = end.cx; cy = end.cy; }
        else { W = Math.min(vw * 0.78, 1200, Math.max(360, (vh - 190) * 16 / 9)); H = W * 9 / 16; cx = vw / 2; cy = vh / 2; }
        actBgFrame.style.width = W + 'px';
        actBgFrame.style.height = H + 'px';
        actBgFrame.style.left = (cx - W / 2) + 'px';
        actBgFrame.style.top = (cy - H / 2) + 'px';
        coverScale = Math.max(vw / W, vh / H) * 1.18;   // +여유 → 확대 시 코너까지 화면 밖
        const src = (end && end.src) || (last ? safeThumb(last, 1400) : '');   // 시네마와 동일 소스(캐시됨 → 팝 없음)
        if (src && actBgImg.getAttribute('src') !== src) actBgImg.src = src;
      };
      layout();

      window.gsap.timeline({
        scrollTrigger: {
          trigger: '#selected', start: 'bottom bottom',   // = 마지막 프레임이 중앙에 온 순간
          endTrigger: '#bleed', end: 'bottom top',
          scrub: 0.5, invalidateOnRefresh: true, refreshPriority: 5,
          onRefreshInit: layout,
          // 인수인계 시작 = 마지막 프레임이 중앙(scale 1). 그 순간 복사본이 동일 좌표·동일 이미지로
          // 자리를 이어받으므로, 실제 시네마 트랙을 숨겨 원본이 위로 흘러가며 겹쳐 보이는(고스트) 걸 막는다.
          onEnter: () => { layout(); window.gsap.set(actBg, { opacity: 1 }); cinemaTrack?.classList.add('is-handed-off'); },
          onEnterBack: () => { window.gsap.set(actBg, { opacity: 1 }); cinemaTrack?.classList.add('is-handed-off'); },
          onLeaveBack: () => { window.gsap.set(actBg, { opacity: 0 }); cinemaTrack?.classList.remove('is-handed-off'); },   // 위로 되돌아가면 다시 1막 다크 + 시네마 복원
        }
      })
        // 마지막 프레임(scale 1) → 그대로 확대 + 블러 심화 + 그레인 + 밝은 스크림 = 2막 프로스티드 배경
        .fromTo(actBgFrame, { scale: 1 }, { scale: () => coverScale, ease: 'power1.in', duration: 1 }, 0)
        .fromTo(actBgImg, { filter: 'blur(0px)' }, { filter: 'blur(62px)', ease: 'power1.inOut', duration: 1 }, 0)
        .fromTo(actBgGrain, { opacity: 0 }, { opacity: 0.5, ease: 'none', duration: 0.7 }, 0.12)
        .fromTo(actBgScrim, { opacity: 0 }, { opacity: 1, ease: 'none', duration: 0.62 }, 0.42);
    }

    document.querySelectorAll('.section:not(#philosophy):not(#works):not(#about)').forEach(sec => {
      window.gsap.from(sec, {
        opacity: 0, y: 32, duration: 1, ease: 'power2.out',
        scrollTrigger: { trigger: sec, start: 'top 88%' }
      });
    });

    // 핀(hero·selected·bleed·philosophy)이 서로 다른 시점에 생성돼 뒤 핀이 앞 핀 좌표를 밀면 stale됨
    // (bleed 핀이 philosophy보다 나중 생성 → philosophy start가 bleed 스페이서만큼 어긋나 목록 위에 겹침).
    // 모든 트리거 생성 후 한 번 refresh로 순서대로 재계산. 이미지 로드 후에도 한 번 더.
    requestAnimationFrame(() => window.ScrollTrigger.refresh());
    window.addEventListener('load', () => window.ScrollTrigger.refresh(), { once: true });

    // 초기 레이지 이미지/폰트 리플로우로 문서 높이가 변하면 트리거 좌표가 낡음 → 디바운스 리프레시.
    // 단, 이건 로드 직후 잠깐만 필요 — 계속 두면 모바일 URL바/이미지 디코드마다 리핀이 튄다.
    let refreshT = null;
    const ro = new ResizeObserver(() => {
      clearTimeout(refreshT);
      refreshT = setTimeout(() => window.ScrollTrigger.refresh(), 250);
    });
    ro.observe(document.body);
    // 레이아웃 안정 후 옵저버 해제 → 이후엔 실제 폭 변화(리사이즈/방향전환)에만 refresh
    let lastW = window.innerWidth;
    setTimeout(() => {
      ro.disconnect();
      let rT = null;
      window.addEventListener('resize', () => {
        if (window.innerWidth === lastW) return;   // 세로만 변한 경우(URL바 등) 무시
        lastW = window.innerWidth;
        clearTimeout(rT);
        rT = setTimeout(() => window.ScrollTrigger.refresh(), 200);
      });
    }, 4200);
  }
})();
