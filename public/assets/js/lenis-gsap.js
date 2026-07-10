// Lenis + GSAP ScrollTrigger 연동
// CDN으로 로드된 window.Lenis, window.gsap, window.ScrollTrigger 사용
export function initScroll() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!window.Lenis || !window.gsap) return null;

  const lenis = new window.Lenis({
    lerp: reduce ? 1 : 0.08,
    smoothWheel: !reduce,
  });

  // Lenis 생성자가 scrollRestoration을 'auto'로 (비동기로) 되돌리므로, 초기화가 끝난 뒤
  // 여러 시점에 'manual'을 다시 박아 확실히 이기게 함. (안 하면 새로고침 시 브라우저가
  // 마지막 스크롤 위치를 복원 → 마지막 섹션에서 시작됨)
  const pinManual = () => { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; };
  pinManual();
  requestAnimationFrame(pinManual);
  window.addEventListener('load', () => { pinManual(); lenis.scrollTo(0, { immediate: true }); });
  // 결정적 보장: 브라우저는 '언로드 시점'의 scrollRestoration 값으로 복원 여부를 정하므로,
  // 페이지를 떠나기 직전에 manual을 강제하면 Lenis가 중간에 auto로 되돌려도 새로고침 시 복원 안 됨.
  window.addEventListener('pagehide', pinManual);
  window.addEventListener('beforeunload', pinManual);
  lenis.scrollTo(0, { immediate: true });

  const { gsap } = window;
  const ST = window.ScrollTrigger;

  if (ST) {
    gsap.registerPlugin(ST);
    lenis.on('scroll', ST.update);
  }
  // GSAP Flip 플러그인 등록 (All Works 필터 전환용)
  if (window.Flip) gsap.registerPlugin(window.Flip);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  return lenis;
}
