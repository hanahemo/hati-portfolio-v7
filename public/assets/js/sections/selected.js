// Selected Works — 가로 시네마. 섹션 핀 + 스크롤이 9개 풀블리드 프레임을 옆으로 밀며 흐름.
// 중앙에 온 프레임이 컬러로 개화. reduced-motion / GSAP 부재 시 가로 드래그 스크롤 폴백.
import { pickThumb, safeThumb, driveThumbFallback } from './cards.js';

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
const frameThumb = (p, w) => safeThumb(p, w);   // 로컬 영상 제외 + Drive/YouTube 포스터 해결(공유 헬퍼)

export function initSelected(portfolio, settings) {
  const section = document.getElementById('selected');
  const track = document.getElementById('cinemaTrack');
  const ticksWrap = document.getElementById('cinemaTicks');
  const posEl = document.getElementById('cinemaPos');
  const countEl = document.getElementById('selectedCount');
  if (!section || !track) return;

  const byId = new Map((portfolio.projects || []).map(p => [p.id, p]));
  const items = (settings.featuredProjectIds || []).map(id => byId.get(id)).filter(Boolean);
  if (countEl) countEl.textContent = String(items.length).padStart(2, '0');
  if (!items.length) { section.hidden = true; return; }

  track.innerHTML = items.map((p, i) => {
    const thumb = frameThumb(p, 1400);
    const num = String(i + 1).padStart(2, '0');
    return `
      <a class="cframe" href="#project/${p.id}" data-id="${p.id}" data-cursor="view" aria-label="${escapeHtml(p.title)} — ${escapeHtml(p.category)}">
        <div class="cframe__media">${thumb ? `<img src="${escapeHtml(thumb)}" data-fb="${escapeHtml(driveThumbFallback(pickThumb(p)))}" alt="" decoding="async" onerror="if(this.dataset.fb&&this.src!==this.dataset.fb){this.src=this.dataset.fb}else{this.style.visibility='hidden'}">` : ''}</div>
        <span class="cframe__n">${num} — ${escapeHtml(p.category)}</span>
        <span class="cframe__title">${escapeHtml(p.title || '(untitled)')}</span>
        <span class="cframe__view">View Project <span aria-hidden="true">→</span></span>
      </a>`;
  }).join('');

  const frames = [...track.children];
  frames.forEach(a => a.addEventListener('click', (e) => {
    e.preventDefault();
    if (window.openProjectDetail) window.openProjectDetail(Number(a.dataset.id));
  }));

  if (ticksWrap) {
    ticksWrap.innerHTML = items.map(() => '<span class="cinema__tick"></span>').join('');
  }
  const ticks = ticksWrap ? [...ticksWrap.children] : [];

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  // 터치 / reduced-motion → 네이티브 가로 스크롤-스냅 폴백 (그 자체로 부드러움 — 핀 스크럽 회피)
  const canPin = fine && !reduced && window.gsap && window.ScrollTrigger;
  if (!canPin) {
    section.classList.add('cinema--static');
    dragScroll(track);
    return;
  }

  const gsap = window.gsap;
  const pin = section.querySelector('.cinema__pin');
  const N = frames.length;

  // ── 포커스 카루셀 (히어로 롤과 동일한 검증된 JS 패킹 — 컴포지터 전용, 부드러움) ──
  // 프레임을 절대배치하고, 초점에서 멀수록 스케일을 낮춰(중앙 1.0 → 사이드 0.5) 렌더폭 기준으로
  // 타이트하게 패킹한다. 초점 프레임은 크고 컬러, 사이드는 작고 어둡게(베일). 초점이 스크롤로 이동.
  const scales = new Float64Array(N), lefts = new Float64Array(N), rw = new Float64Array(N);
  let W = 0, H = 0, GAP = 18, vw = window.innerWidth;
  const sizeConsts = () => {
    vw = window.innerWidth;
    // 중앙(scale 1.0) 프레임 폭 — 뷰포트 높이도 반영해 상하 넘침 방지
    W = Math.min(vw * 0.78, 1200, Math.max(360, (window.innerHeight - 190) * 16 / 9));
    H = Math.round(W * 9 / 16);
    GAP = Math.max(10, Math.round(vw * 0.014));
    track.style.height = H + 'px';
    frames.forEach(a => { a.style.width = W + 'px'; a.style.height = H + 'px'; });
    publishEndRect();
  };

  // 2막 인수인계 — 마지막 프레임이 '중앙 포커스(scale 1)'가 됐을 때의 뷰포트 사각형을 기록.
  // 핀 고정 시 프레임은 시네마 1fr 행에 세로 중앙(레이아웃 상수) → 스크롤/핀상태와 무관하게 안정적.
  // main.js의 act-bg가 정확히 이 위치·크기·크롭에서 태어나 '그대로' 확대되어 배경이 됨(별도 창 X).
  function publishEndRect() {
    const vh = window.innerHeight;
    const csPin = getComputedStyle(pin);
    const padTop = parseFloat(csPin.paddingTop) || 0;
    const padBot = parseFloat(csPin.paddingBottom) || 0;
    const barEl = section.querySelector('.cinema__bar');
    const barH = barEl ? barEl.offsetHeight : 0;
    const tkH = ticksWrap ? ticksWrap.offsetHeight : 0;
    const cy = ((padTop + barH) + (vh - padBot - tkH)) / 2;   // 1fr 행 세로 중앙
    const img = frames[N - 1] && frames[N - 1].querySelector('img');
    window.__cinemaEnd = { W, H, cx: vw / 2, cy, src: (img && (img.currentSrc || img.src)) || '' };
  }

  sizeConsts();

  const prox = { p: 0 };
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      start: 'top top',
      end: () => '+=' + Math.max(1, (N - 1) * Math.round(vw * 0.66)),   // 프레임당 스크롤 페이스
      pin: pin,
      pinSpacing: true,
      scrub: 0.6,
      invalidateOnRefresh: true,
      refreshPriority: 10,   // 핀 refresh 순서 = DOM 순서(hero≥selected>bleed>philosophy)로 좌표 정합
      onRefreshInit: sizeConsts,
      onToggle(self) { self.isActive ? startFrames() : stopFrames(); }
    }
  });
  tl.to(prox, { p: 1, ease: 'none', duration: 1 }, 0);

  // 시네마도 '스크롤 전용' — 호버로 초점을 당기지 않는다(hero 릴과 동일 이유: 호버 시 프레임이
  // 커지며 재패킹돼 스크롤과 충돌·버벅임). 클릭 진입/커서 'view' 라벨은 그대로 유지.

  const smooth = (t) => t * t * (3 - 2 * t);   // smoothstep — 자석 같은 초점
  const SPREAD = 1.45;                          // 초점 반경(프레임 단위) — 클수록 완만
  const frame = () => {
    const p = Math.max(0, Math.min(1, prox.p));
    let focus = p * (N - 1);   // 스크롤 전용 포커스

    // 1) 스케일 + 렌더폭 → 타이트 패킹 (사이드 0.5 → 중앙 1.0)
    let total = 0;
    for (let i = 0; i < N; i++) {
      const dd = Math.abs(i - focus) / SPREAD;
      const f = dd >= 1 ? 0 : smooth(1 - dd);
      const s = 0.5 + 0.5 * f;
      scales[i] = s;
      rw[i] = s * W;
      lefts[i] = total;
      total += rw[i] + GAP;
      frames[i].style.setProperty('--focus', f.toFixed(3));
    }
    // 2) 초점 프레임 중심을 뷰포트 중앙에
    const fi = Math.min(N - 1, Math.floor(focus)), fj = Math.min(N - 1, fi + 1), ff = focus - fi;
    const focusCenter = (lefts[fi] + rw[fi] / 2) * (1 - ff) + (lefts[fj] + rw[fj] / 2) * ff;
    const originX = vw / 2 - focusCenter;
    // 3) 배치 (translate + scale, transform-origin: left center → 렌더폭이 rw와 일치)
    for (let i = 0; i < N; i++) {
      frames[i].style.transform = `translate3d(${(originX + lefts[i]).toFixed(1)}px,0,0) scale(${scales[i].toFixed(4)})`;
    }
    const bestI = Math.round(focus);
    if (posEl) posEl.textContent = String(bestI + 1).padStart(2, '0');
    for (let k = 0; k < ticks.length; k++) ticks[k].classList.toggle('is-on', k === bestI);
  };

  let on = false;
  function startFrames() { if (!on) { on = true; gsap.ticker.add(frame); } }
  function stopFrames() { if (on) { on = false; gsap.ticker.remove(frame); frame(); } }
  frame();
}

// 폴백: 가로 드래그/휠 스크롤
function dragScroll(track) {
  let down = false, sx = 0, sl = 0;
  track.addEventListener('pointerdown', (e) => { down = true; sx = e.clientX; sl = track.scrollLeft; track.setPointerCapture?.(e.pointerId); });
  track.addEventListener('pointermove', (e) => { if (down) track.scrollLeft = sl - (e.clientX - sx); });
  track.addEventListener('pointerup', () => { down = false; });
}
