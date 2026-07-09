// Lenis + GSAP ScrollTrigger 연동
// CDN으로 로드된 window.Lenis, window.gsap, window.ScrollTrigger 사용
export function initScroll() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!window.Lenis || !window.gsap) return null;

  const lenis = new window.Lenis({
    lerp: reduce ? 1 : 0.08,
    smoothWheel: !reduce,
  });

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
