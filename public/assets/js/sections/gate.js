export function initGate(settings, lenis) {
  const gate = document.getElementById('gate');
  const main = document.getElementById('main');
  if (!gate) return;

  // 진입 상태(alreadyIn)는 main.js가 URL ?nogate 파라미터로 sessionStorage에 미리 세팅함.
  // (새 방문·새로고침 → 게이트 표시 / 테마 전환 → 스킵)
  const sub = gate.querySelector('.gate__sub');
  if (sub && settings.curtainSub) sub.textContent = settings.curtainSub;
  const label = gate.querySelector('.gate__label');
  if (label && settings.curtainMain) label.textContent = settings.curtainMain;
  const author = gate.querySelector('.gate__foot');
  if (author && settings.curtainAuthor) author.textContent = `© ${settings.curtainAuthor} — Private Room`;

  // 중앙 이름 — 어드민 설정: gateLogo(이미지) 우선 → gateTitle(텍스트) → 기본 'HATI'
  const titleEl = gate.querySelector('.gate__title');
  if (titleEl) {
    if (settings.gateLogo) {
      const img = document.createElement('img');
      img.className = 'gate__logo';
      img.src = settings.gateLogo;
      img.alt = settings.gateTitle || 'HATI';
      img.decoding = 'async';
      titleEl.textContent = '';
      titleEl.appendChild(img);
    } else {
      titleEl.textContent = settings.gateTitle || 'HATI';
    }
  }

  const hud = document.getElementById('hud');

  // 접근성: gate 활성 동안 메인 컨텐츠 차단
  const lockMain = () => {
    if (!main) return;
    main.setAttribute('inert', '');
    main.setAttribute('aria-hidden', 'true');
  };
  const unlockMain = () => {
    if (!main) return;
    main.removeAttribute('inert');
    main.removeAttribute('aria-hidden');
  };

  lockMain();

  const btn = document.getElementById('gateEnter');
  const enter = () => {
    gate.classList.add('is-hidden');
    sessionStorage.setItem('hati:entered', '1');
    unlockMain();
    hud?.classList.add('is-on');
    // 진입 순간 항상 최상단에서 시작 + 잠갔던 스크롤 재개
    window.scrollTo(0, 0);
    lenis?.scrollTo(0, { immediate: true });
    lenis?.start();
    // 히어로 리빌 등 진입 시점 연출 트리거
    window.dispatchEvent(new CustomEvent('hati:entered'));
    // 첫 포커스는 main으로
    main?.querySelector('h1, [tabindex], a, button')?.focus?.({ preventScroll: true });
  };
  btn?.addEventListener('click', enter);

  // Enter/Space로도 진입
  btn?.focus?.({ preventScroll: true });

  // ── 워드마크 키네틱 등장 (첫 방문, 로더 종료 시점) ──
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const alreadyIn = !!sessionStorage.getItem('hati:entered');
  if (!alreadyIn && window.gsap && !reduced) {
    const bits = [
      gate.querySelector('.gate__title'),
      gate.querySelector('.gate__sub'),
      btn,
    ].filter(Boolean);
    window.gsap.set(bits, { opacity: 0, y: 34 });
    let played = false;
    const play = () => {
      if (played) return;
      played = true;
      window.gsap.to(bits, {
        opacity: 1, y: 0, duration: 1.05, ease: 'power3.out', stagger: 0.12,
        clearProps: 'transform',
      });
    };
    window.addEventListener('hati:loaded', play, { once: true });
    setTimeout(play, 3500);   // 로더가 이벤트를 못 쏜 경우 안전 폴백
  }

  // ── 자동 진입 — 클릭 없이 잠시 후 문 열리듯 자동으로 열림(첫 방문). ENTER는 즉시 스킵용. ──
  if (!alreadyIn) {
    const delay = reduced ? 500 : 2000;   // 게이트를 잠깐 보여준 뒤 자동으로 열림
    let armed = false;
    const arm = () => {
      if (armed) return; armed = true;
      setTimeout(() => { if (!gate.classList.contains('is-hidden')) enter(); }, delay);
    };
    window.addEventListener('hati:loaded', arm, { once: true });
    setTimeout(arm, 3800);   // 로더 이벤트 누락 대비 폴백
  }

  // 포커스 트랩 (gate 내부에서 Tab 순환)
  gate.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const focusables = gate.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])');
    if (!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // 이미 진입한 경우 즉시 숨김 + 잠갔던 스크롤 재개
  if (alreadyIn) {
    gate.classList.add('is-hidden');
    unlockMain();
    hud?.classList.add('is-on');
    lenis?.start();
  }
}
