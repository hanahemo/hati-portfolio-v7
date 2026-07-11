// End Credits — 시사회 피날레. 데이터(직군·클라이언트·작품 수)로 크레딧 롤 생성, 스크롤이 필름을 감는다.
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function initCredits(portfolio, settings) {
  const section = document.getElementById('credits');
  const roll = document.getElementById('creditsRoll');
  const finale = document.getElementById('creditsFinale');
  if (!section || !roll || !finale) return;

  const projects = portfolio?.projects || [];
  const clients = [...new Set(projects.map(p => String(p.client || '').trim()).filter(Boolean))];
  const years = projects.map(p => parseInt(p.year, 10)).filter(Number.isFinite);
  const est = String(settings.est || '').trim();
  const span = `${est || (years.length ? Math.min(...years) : '')}—${new Date().getFullYear()}`;

  const row = (role, name) => `<div class="credits__row"><span class="credits__role">${escapeHtml(role)}</span><span class="credits__name">${escapeHtml(name)}</span></div>`;
  const parts = [];
  parts.push('<div class="credits__head">End Credits</div>');
  parts.push(row('Directed & Produced by', 'Hati'));
  parts.push(row('Photography', 'Hati'));
  parts.push(row('Film & Video', 'Hati'));
  parts.push(row('Graphic Design', 'Hati'));
  parts.push(row('Generative AI', 'Hati'));
  if (clients.length) {
    // 어드민에서 프로젝트 client 필드가 채워지면 자동으로 등장하는 블록
    parts.push('<div class="credits__head">With</div>');
    clients.forEach((c, i) => parts.push(row(i === 0 ? 'Clients' : '', c)));
  }
  const cats = { video: 0, photo: 0, graphic: 0 };
  projects.forEach(p => { if (cats[p.category] != null) cats[p.category]++; });
  parts.push('<div class="credits__head">Filmography</div>');
  parts.push(row('Film & Music Video', `${cats.video} works`));
  parts.push(row('Photography', `${cats.photo} works`));
  parts.push(row('Graphic', `${cats.graphic} works`));
  parts.push(row('Total', `${projects.length} · ${span}`));
  parts.push('<div class="credits__head">Special Thanks</div>');
  parts.push('<div class="credits__thanks">You, for watching.</div>');
  roll.innerHTML = parts.join('');

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!window.gsap || !window.ScrollTrigger || reduced) {
    section.classList.add('credits--static');
    return;
  }

  const gsap = window.gsap;
  // 롤 이동량 — 화면 아래(100vh)에서 출발해 완전히 위로 빠져나갈 때까지
  const travel = () => -(roll.scrollHeight + window.innerHeight);
  gsap.timeline({
    scrollTrigger: {
      trigger: section,
      start: 'top top',
      end: '+=140%',                 // 크레딧 러닝타임
      scrub: 0.6,
      pin: true,                     // sticky는 Lenis/overflow 환경에서 안 붙는다 — 사이트 공통 문법(GSAP pin) 사용
      pinSpacing: true,
      invalidateOnRefresh: true,
      refreshPriority: 1,            // 핀 refresh 순서 = DOM 순서 (hero 12 > actBg 5 > credits 1)
    }
  })
    .fromTo(roll, { y: 0 }, { y: travel, ease: 'none', duration: 0.78 }, 0)
    .fromTo(finale, { opacity: 0 }, { opacity: 1, ease: 'none', duration: 0.08 }, 0.8)
    .to(finale, { opacity: 1, ease: 'none', duration: 0.12 }, 0.88);   // 홀드 — 피날레가 잠시 무대를 지킨다
}
