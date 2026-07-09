// 커스텀 커서 — 데스크탑 전용 (hover:none 시 비활성)
export function initCursor() {
  if (!window.matchMedia('(hover: hover)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const cursor = document.createElement('div');
  cursor.className = 'cursor';
  cursor.innerHTML = '<span class="cursor__text"></span>';
  document.body.appendChild(cursor);

  const ring = document.createElement('div');
  ring.className = 'cursor-ring';
  document.body.appendChild(ring);

  document.body.classList.add('has-cursor');

  const text = cursor.querySelector('.cursor__text');
  let tx = 0, ty = 0, cx = 0, cy = 0;

  window.addEventListener('mousemove', (e) => {
    tx = e.clientX; ty = e.clientY;
  });

  function raf() {
    cx += (tx - cx) * 0.22;
    cy += (ty - cy) * 0.22;
    cursor.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
    ring.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
    requestAnimationFrame(raf);
  }
  raf();

  // click ripple
  window.addEventListener('mousedown', () => {
    cursor.classList.add('is-down');
    ring.classList.remove('is-ping');
    // reflow for animation restart
    void ring.offsetWidth;
    ring.classList.add('is-ping');
  });
  window.addEventListener('mouseup', () => cursor.classList.remove('is-down'));

  // hover 라벨 — 이벤트 위임 (필터 재렌더 등 동적 콘텐츠도 자동 대응, 상시 옵저버 불필요)
  let hoverEl = null;
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    const t = e.target.closest('a, button, [data-cursor], .card');
    if (!t || t === hoverEl) return;
    hoverEl = t;
    cursor.classList.add('is-hover');
    text.textContent = t.dataset.cursor || (t.classList.contains('card') ? 'view' : 'click');
  });
  document.addEventListener('pointerout', (e) => {
    if (!hoverEl) return;
    if (e.relatedTarget && hoverEl.contains(e.relatedTarget)) return;   // 여전히 같은 타깃 내부면 유지
    hoverEl = null;
    cursor.classList.remove('is-hover');
    text.textContent = '';
  });
}
