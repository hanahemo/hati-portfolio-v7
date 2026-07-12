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

  // 워드 분해 — 데스크탑·모바일 공용 (글자가 서서히 차오르는 리빌)
  let targets;
  if (window.SplitType) {
    const split = new window.SplitType(el.querySelectorAll('.line1, .line2'), { types: 'words' });
    targets = split.words;
  } else {
    targets = el.querySelectorAll('.line1, .line2');
  }

  // 모바일 — 핀+스크럽은 터치 스크롤에서 덜커덩거린다.
  // 같은 워드 리빌을 '시간 기반'으로: 섹션 진입 시 단어가 순서대로 차오름. 핀 없음 = 매끄러운 스크롤 + 중앙정렬 유지.
  if (window.innerWidth < 768) {
    gsap.set(targets, { opacity: 0.12, y: 14 });
    gsap.to(targets, {
      opacity: 1, y: 0, stagger: 0.07, duration: 0.55, ease: 'power2.out',
      scrollTrigger: { trigger: section, start: 'top 62%' }
    });
    return;
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
