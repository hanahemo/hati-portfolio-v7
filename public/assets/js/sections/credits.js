// End Credits — 시사회 피날레. 데이터(직군·클라이언트·작품 수)로 크레딧 롤 생성, 스크롤이 필름을 감는다.
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function initCredits(portfolio, settings) {
  const section = document.getElementById('credits');
  const roll = document.getElementById('creditsRoll');
  const finale = document.getElementById('creditsFinale');
  if (!section || !roll || !finale) return;
  const stage = section.querySelector('.credits__stage');

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

  // 부유 스틸 — 어바웃 갤러리 사진이 크레딧 사이를 뎁스를 갖고 흘러간다 (디즈니 엔딩크레딧 문법)
  // 깊이별 속도: near(가깝고 큼, 빠름) > mid > far(작고 흐림, 느림). 롤 구간(0~0.78) 안에서만 살고 피날레 전에 퇴장.
  // 모바일은 화면이 좁아 스틸을 작게 + 텍스트 뒤 배경으로(디즈니처럼 크레딧 뒤로 장면이 흐름) — CSS 미디어쿼리가 z-index/명도 처리.
  const isMobile = window.innerWidth < 768;
  const SLOTS = isMobile ? [
    { x: '6%',  w: 108, depth: 'mid',  speed: 0.60, at: 0.00 },
    { x: '64%', w: 96,  depth: 'far',  speed: 0.42, at: 0.10 },
    { x: '56%', w: 116, depth: 'near', speed: 0.72, at: 0.22 },
    { x: '8%',  w: 92,  depth: 'far',  speed: 0.46, at: 0.34 },
    { x: '60%', w: 104, depth: 'mid',  speed: 0.66, at: 0.46 },
    { x: '10%', w: 100, depth: 'near', speed: 0.58, at: 0.56 },
    { x: '58%', w: 98,  depth: 'far',  speed: 0.44, at: 0.66 },
    { x: '7%',  w: 110, depth: 'mid',  speed: 0.62, at: 0.74 },
  ] : [
    { x: '6%',  w: 280, depth: 'near', speed: 0.85, at: 0.00 },
    { x: '76%', w: 220, depth: 'far',  speed: 0.40, at: 0.08 },
    { x: '73%', w: 300, depth: 'mid',  speed: 0.62, at: 0.18 },
    { x: '8%',  w: 200, depth: 'far',  speed: 0.45, at: 0.28 },
    { x: '70%', w: 260, depth: 'near', speed: 0.90, at: 0.38 },
    { x: '10%', w: 240, depth: 'mid',  speed: 0.58, at: 0.46 },
    { x: '75%', w: 210, depth: 'far',  speed: 0.42, at: 0.54 },
    { x: '5%',  w: 300, depth: 'near', speed: 0.88, at: 0.62 },
    { x: '72%', w: 230, depth: 'mid',  speed: 0.60, at: 0.70 },
    { x: '9%',  w: 215, depth: 'far',  speed: 0.44, at: 0.76 },
  ];
  // 어드민에서 추가한 현장 스틸 전부를 흘린다 — 슬롯 수로 자르지 않는다(예전 slice가 11번째부터 삭제하던 버그).
  // 슬롯(위치·깊이·속도)은 순환 재사용하고, 등장 시점 at은 전체 장수에 걸쳐 고르게 재분배해 롤 구간 안에 흩뿌린다.
  const photos = settings.aboutGallery || [];
  const N = photos.length;
  const stills = photos.map((url, i) => {
    const tpl = SLOTS[i % SLOTS.length];
    const slot = { ...tpl, at: N > 1 ? (i / N) * 0.68 : 0 };   // 0.68 상한 → dur ≥ 0.10, 장수 무관 마지막 장까지 렌더
    const fig = document.createElement('figure');
    fig.className = `credits__still credits__still--${slot.depth}`;
    fig.style.left = slot.x;
    fig.style.width = slot.w + 'px';
    fig.style.top = '100%';
    fig.innerHTML = `<img src="${url}" alt="" loading="lazy" onerror="this.parentNode.remove()">`;
    stage.insertBefore(fig, finale);
    return { fig, slot };
  });

  // ── 모바일: 핀 없는 일반 흐름 — 실기기에서 빠른 플릭이 핀 구간을 한 번에 통과하면
  //    scrub이 못 따라와 검은 화면만 보인다(재현: 헤드리스 느린 스크롤에선 정상).
  //    크레딧은 자연 스크롤로 항상 보이게 하고, 리빌만 얹는다. 스틸은 섹션 높이 %로 정적 산포. ──
  if (isMobile) {
    section.classList.add('credits--flow');
    // 가시성 원칙: 모바일 크레딧은 어떤 애니메이션에도 인질 잡히지 않는다.
    // opacity 숨김 리빌 금지(실기기에서 트리거 미발화 시 콘텐츠가 영영 투명 — 실제 발생했던 버그).
    // 장식은 transform 패럴랙스만 — 실패해도 콘텐츠는 그대로 보인다.
    const M = Math.max(1, stills.length);
    const vw = window.innerWidth;
    // 깊이 체계 — near(가깝게: 크고 선명·빠름) / mid / far(멀게: 작고 흐림·느림).
    // 크기·이동량·프레임 물림을 깊이로 벌려 공간감과 패럴랙스를 살린다. (블러/명도는 CSS 깊이 클래스가 담당)
    const DW = { near: 144, mid: 104, far: 74 };      // 폭(px) — 가까울수록 큼
    const INSET = { near: -22, mid: 8, far: 24 };     // near는 프레임 밖으로 흘려 '가까이 지나가는' 크롭
    const TRAVEL = { near: -215, mid: -120, far: -52 }; // 스크롤당 이동량 — 가까울수록 많이(=빠르게) 흐른다
    stills.forEach(({ fig, slot }, i) => {
      const d = slot.depth in DW ? slot.depth : 'mid';
      const w = DW[d];
      fig.style.width = w + 'px';
      fig.style.top = (3 + (i / M) * 92).toFixed(1) + '%';    // 세로 균등 분산 — 겹쳐 쌓임 방지
      fig.style.left = (i % 2 === 0 ? INSET[d] : vw - w - INSET[d]) + 'px';  // 좌우 교차
      gsap.to(fig, {
        y: TRAVEL[d], ease: 'none',
        scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: 0.6 }
      });
    });
    return;
  }
  // 롤 이동량 — 화면 아래(100vh)에서 출발해 완전히 위로 빠져나갈 때까지
  const travel = () => -(roll.scrollHeight + window.innerHeight);
  const tl = gsap.timeline({
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
    .to(finale, { opacity: 1, ease: 'none', duration: 0.12 }, 0.88)    // 홀드 — 피날레가 잠시 무대를 지킨다
    .add(() => {}, 1);
  // 스틸 패럴랙스 — 각자 등장 시점(at)부터 롤 종료(0.78)까지, 깊이 속도만큼만 이동
  stills.forEach(({ fig, slot }) => {
    const dur = 0.78 - slot.at;
    if (dur <= 0.05) return;
    tl.fromTo(fig,
      { y: 0 },
      { y: () => -(window.innerHeight + slot.w * 1.6) * slot.speed - window.innerHeight * 0.2, ease: 'none', duration: dur },
      slot.at);
    tl.to(fig, { opacity: 0, ease: 'none', duration: 0.05 }, Math.max(slot.at, 0.73));
  });
}
