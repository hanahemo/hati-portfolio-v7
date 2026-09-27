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
  if (author && settings.curtainAuthor) {
    // 브랜드 마크 통일 — 나브 Hati® 기준. 저장된 값의 꼬리 ®는 벗기고 다시 붙여 중복 방지.
    const a = String(settings.curtainAuthor).replace(/\s*®\s*$/, '').trim();
    author.textContent = `© ${a}® — Private Room`;
  }

  // 중앙 이름 — 어드민 설정: gateLogo(이미지) 우선 → gateTitle(텍스트) → 기본 로고타입 'Hati®'
  const titleEl = gate.querySelector('.gate__title');
  if (titleEl) {
    if (settings.gateLogo) {
      const img = document.createElement('img');
      img.className = 'gate__logo';
      img.src = settings.gateLogo;
      img.alt = 'Hati®';
      img.decoding = 'async';
      titleEl.textContent = '';
      titleEl.appendChild(img);
    } else {
      // 저장값이 브랜드명(대소문자·® 무관)이면 통일 로고타입으로, 커스텀 텍스트면 그대로.
      const raw = String(settings.gateTitle || '').trim();
      if (!raw || /^hati\s*®?$/i.test(raw)) {
        titleEl.innerHTML = 'Hati<sup class="gate__sup">®</sup>';
      } else {
        titleEl.textContent = raw;
      }
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
  const ticket = document.getElementById('gateTicket');
  let entering = false;
  const enter = () => {
    if (entering) return;
    entering = true;
    // 절취 — 본권 반동·도장·스텁 낙하가 끝난 뒤(≈0.7s) 커튼이 걷힘. 300ms였을 땐 뜯기는 게 보이기도 전에 화면이 올라갔다
    const reducedNow = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (ticket && !reducedNow && !gate.classList.contains('is-hidden')) {
      gate.classList.add('is-torn');
      setTimeout(doEnter, 720);
    } else {
      doEnter();
    }
  };
  const doEnter = () => {
    // zoom-through: 티켓이 커지며 사라지는 동안(0.9s) 아래 히어로가 드러난다. 끝나면 게이트를 완전히 치운다
    gate.classList.add('is-entering');
    const reducedNow = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => gate.classList.add('is-hidden'), reducedNow ? 320 : 950);
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
  ticket?.addEventListener('click', enter);
  ticket?.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enter(); } });

  // Enter/Space로도 진입
  (btn || ticket)?.focus?.({ preventScroll: true });

  // ── 워드마크 키네틱 등장 (첫 방문, 로더 종료 시점) ──
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const alreadyIn = !!sessionStorage.getItem('hati:entered');

  // 발권 — 관람번호는 로컬 방문 횟수. 백엔드 없이도 '내 티켓'이라는 감각을 만든다.
  const meta = document.getElementById('gateTicketMeta');
  if (meta && !alreadyIn) {
    let n = 1;
    try {
      n = parseInt(localStorage.getItem('hati:ticketNo') || '0', 10) + 1;
      localStorage.setItem('hati:ticketNo', String(n));
    } catch (_) {}
    const d = new Date();
    const dd = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    meta.textContent = `№ ${String(n).padStart(4, '0')} — ${dd}`;
  }
  if (!alreadyIn && window.gsap && !reduced) {
    // 워드마크 — 마스크 아래에서 글자가 하나씩 솟는다 (로고 이미지일 땐 통째로 페이드업)
    const titleNode = gate.querySelector('.gate__title');
    let titleChars = null;
    if (titleNode && window.SplitType && !titleNode.querySelector('img')) {
      try {
        titleChars = new window.SplitType(titleNode, { types: 'chars' }).chars;
        titleNode.style.clipPath = 'inset(-0.2em 0 0 0)';   // 아래만 마스크 — 글자가 베이스라인 밑에서 올라온다
        window.gsap.set(titleChars, { yPercent: 115 });
      } catch (_) { titleChars = null; }
    }
    const bits = [
      titleChars ? null : titleNode,
      gate.querySelector('.gate__sub'),
      btn,
    ].filter(Boolean);
    window.gsap.set(bits, { opacity: 0, y: 34 });
    // 발권 — 티켓은 슬롯에서 뽑혀 나오듯 위→아래로 드러나고, 번호가 촤르륵 돌다가 내 번호에 멎는다
    if (ticket) window.gsap.set(ticket, { clipPath: 'inset(0 0 100% 0)', y: -16 });
    const finalMeta = meta ? meta.textContent : '';
    let played = false;
    const play = () => {
      if (played) return;
      played = true;
      if (titleChars) window.gsap.to(titleChars, { yPercent: 0, duration: 1.0, ease: 'power4.out', stagger: 0.06 });
      window.gsap.to(bits, {
        opacity: 1, y: 0, duration: 1.05, ease: 'power3.out', stagger: 0.12, delay: titleChars ? 0.25 : 0,
        clearProps: 'transform',
      });
      if (ticket) {
        window.gsap.to(ticket, { clipPath: 'inset(0 0 0% 0)', y: 0, duration: 0.75, ease: 'power2.out', delay: 0.35, clearProps: 'clipPath,transform' });
        if (meta && /№ \d{4}/.test(finalMeta)) {
          const t0 = performance.now(), DUR = 620;
          const tick = () => {
            const k = (performance.now() - t0) / DUR;
            if (k >= 1) { meta.textContent = finalMeta; return; }
            meta.textContent = finalMeta.replace(/№ \d{4}/, `№ ${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`);
            setTimeout(tick, 42);
          };
          setTimeout(tick, 480);   // 티켓이 반쯤 나왔을 때부터 번호가 돈다
        }
      }
    };
    window.addEventListener('hati:loaded', play, { once: true });
    setTimeout(play, 3500);   // 로더가 이벤트를 못 쏜 경우 안전 폴백
  }

  // ── 자동 진입 — 클릭 없이 잠시 후 문 열리듯 자동으로 열림(첫 방문). ENTER는 즉시 스킵용. ──
  if (!alreadyIn) {
    const delay = reduced ? 500 : 2500;   // 발권(≈1.1s)이 끝나고 티켓을 한 박자 본 뒤 자동 절취
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
