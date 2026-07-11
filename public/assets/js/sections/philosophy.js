export function initPhilosophy(settings) {
  const el = document.getElementById('philosophyText');
  if (!el) return;
  const raw = settings.philosophy || 'Purpose breeds density. Density breathes life.';
  const parts = raw.split(/\.\s+/).map(s => s.replace(/\.$/, ''));
  const line1 = parts[0] ? parts[0] + '.' : raw;
  const line2 = parts[1] ? parts[1] + '.' : '';
  el.innerHTML = `<span class="line1">${line1}</span>${line2 ? `<span class="line2">${line2}</span>` : ''}`;

  if (!window.gsap || !window.ScrollTrigger) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const section = document.getElementById('philosophy');
  const gsap = window.gsap;
  const ST = window.ScrollTrigger;

  // SplitType이 있으면 단어 단위 스태거, 없으면 줄 단위 페이드 폴백
  let targets;
  if (window.SplitType) {
    const split = new window.SplitType(el.querySelectorAll('.line1, .line2'), { types: 'words' });
    targets = split.words;
  } else {
    targets = el.querySelectorAll('.line1, .line2');
  }

  gsap.set(targets, { opacity: 0.15, y: 20 });
  gsap.to(targets, {
    opacity: 1,
    y: 0,
    stagger: 0.15,
    ease: 'cubic-bezier(0.45, 0.05, 0.55, 0.95)',
    scrollTrigger: {
      trigger: section,
      start: 'top top',
      end: '+=80%',
      scrub: 0.8,
      pin: true,
      pinSpacing: true,
      refreshPriority: 3,   // credits(1)보다 먼저 refresh — 안 그러면 credits 시작점이 이 핀의 스페이서(+80%)만큼 일찍 걸려 어바웃 한중간에 핀이 튄다
    },
  });
}
