// 프로젝트 뷰 — 풀페이지 시네마틱 (키컬러 배경 전환 + 거대 키네틱 타이틀, 보기 전용).
const DIRECT_VIDEO_RE = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;

function getDriveId(url) {
  if (!url || typeof url !== 'string' || !url.includes('drive.google.com')) return '';
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : '';
}
function getYouTubeId(url) {
  const m = String(url || '').match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  return m ? m[1] : '';
}
function getVimeoId(url) {
  const m = String(url || '').match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? m[1] : '';
}
function toThumb(url) {
  const id = getDriveId(url);
  if (id) return `https://lh3.googleusercontent.com/d/${id}=w1600`;
  return url;
}
function toThumbFallback(url) {
  const id = getDriveId(url);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1600` : '';
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function isVideoMedia(m) {
  const url = m.url || '';
  return (m.type === 'video') || DIRECT_VIDEO_RE.test(url) || !!getYouTubeId(url) || !!getVimeoId(url);
}

// 미디어 요소 하나(iframe/video/img)만 반환 — 래퍼 없음. label = 스크린리더용 설명(프로젝트명).
function mediaInner(m, label) {
  const url = m.url || '';
  const t = escapeHtml(label || 'video');
  const alt = escapeHtml(label || '');
  const driveId = getDriveId(url);
  const ytId = getYouTubeId(url);
  const vimeoId = getVimeoId(url);
  const isVideo = isVideoMedia(m);
  if (isVideo && driveId) return { html: `<iframe src="https://drive.google.com/file/d/${driveId}/preview" allow="autoplay" allowfullscreen loading="lazy" title="${t}"></iframe>`, video: true };
  if (ytId) return { html: `<iframe src="https://www.youtube-nocookie.com/embed/${ytId}?rel=0&modestbranding=1" allow="autoplay; fullscreen" allowfullscreen loading="lazy" title="${t}"></iframe>`, video: true };
  if (vimeoId) return { html: `<iframe src="https://player.vimeo.com/video/${vimeoId}?dnt=1" allow="autoplay; fullscreen" allowfullscreen loading="lazy" title="${t}"></iframe>`, video: true };
  if (isVideo) return { html: `<video src="${escapeHtml(url)}" title="${t}" controls controlsList="nodownload noplaybackrate" disablepictureinpicture playsinline preload="metadata"></video>`, video: true };
  const main = toThumb(url), fallback = toThumbFallback(url);
  return { html: `<img src="${escapeHtml(main)}" data-fallback="${escapeHtml(fallback)}" alt="${alt}" loading="lazy" draggable="false"
    onerror="if(this.dataset.fallback && this.src !== this.dataset.fallback){this.src=this.dataset.fallback;}else{this.closest('.pv-media,.pview__lead').innerHTML='<div class=&quot;pview__media-fail&quot;>미디어를 불러오지 못했습니다</div>';}">`, video: false };
}
// 그리드용 — .pv-media 래퍼(메이슨리 컬럼 아이템)
function renderGridMedia(m, label) {
  const inner = mediaInner(m, label);
  return `<div class="pv-media${inner.video ? ' pv-media--video' : ''}">${inner.html}</div>`;
}
// 리드용 — 이미지는 원본 비율 직접, 영상은 16:9 래퍼
function renderLead(m, label) {
  const inner = mediaInner(m, label);
  return inner.video ? `<div class="pv-media--video">${inner.html}</div>` : inner.html;
}

// 케이스 스터디 정렬 — 영상 카테고리는 영상을 맨 앞(리드)으로
function orderedMedia(project) {
  const media = Array.isArray(project.media) ? project.media.slice() : [];
  if (project.category === 'video') {
    const firstVid = media.findIndex(isVideoMedia);
    if (firstVid > 0) { const [v] = media.splice(firstVid, 1); media.unshift(v); }
  }
  return media;
}

export function initProjectModal(state) {
  const modal = document.getElementById('projectModal');
  if (!modal) return;
  const scroller = modal.querySelector('.pview__scroll');
  const leadEl = modal.querySelector('#pmLead');
  const gallery = modal.querySelector('#pmGallery');
  const titleEl = modal.querySelector('#pmTitle');
  const descEl = modal.querySelector('#pmDesc');
  const detailsEl = modal.querySelector('#pmDetails');
  const numEl = modal.querySelector('#pmNum');
  const totalEl = modal.querySelector('#pmTotal');
  const catEl = modal.querySelector('#pmCat');
  const tagsEl = modal.querySelector('#pmTags');

  let lastTrigger = null;
  let mainHadInert = false, hudHadInert = false;
  const mainEl = document.getElementById('main');
  const hudEl = document.getElementById('hud');
  const lenis = state.lenis;

  const seq = (state.portfolio.projects || []).slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id);
  if (totalEl) totalEl.textContent = String(seq.length).padStart(2, '0');
  const prevBtn = modal.querySelector('#pmPrev');
  const nextBtn = modal.querySelector('#pmNext');
  const prevTitleEl = modal.querySelector('#pmPrevTitle');
  const nextTitleEl = modal.querySelector('#pmNextTitle');
  let currentIdx = -1;

  function setTitle(text) {
    // 거대 타이틀 — 단어별 마스크 리빌용 스팬
    titleEl.innerHTML = String(text || '(untitled)').split(/\s+/).filter(Boolean)
      .map(w => `<span class="pv-word"><span>${escapeHtml(w)}</span></span>`).join(' ');
  }
  function revealTitle() {
    const inners = titleEl.querySelectorAll('.pv-word > span');
    if (!window.gsap || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    window.gsap.from(inners, { yPercent: 110, duration: 0.9, ease: 'power4.out', stagger: 0.06, delay: 0.25 });
  }

  function updateNav() {
    const prev = currentIdx > 0 ? seq[currentIdx - 1] : null;
    const next = currentIdx >= 0 && currentIdx < seq.length - 1 ? seq[currentIdx + 1] : null;
    if (prevBtn) { prevBtn.hidden = !prev; if (prev && prevTitleEl) prevTitleEl.textContent = prev.title || ''; }
    if (nextBtn) { nextBtn.hidden = !next; if (next && nextTitleEl) nextTitleEl.textContent = next.title || ''; }
  }

  function close() {
    modal.classList.remove('is-in');
    document.body.classList.remove('pm-open');
    if (!mainHadInert) mainEl?.removeAttribute('inert');
    if (!hudHadInert) hudEl?.removeAttribute('inert');
    lenis?.start();
    // 트랜지션 후 숨김 + 미디어 정리
    const finish = () => {
      modal.hidden = true;
      modal.querySelectorAll('video').forEach(v => { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (_) {} });
      gallery.innerHTML = ''; leadEl.innerHTML = '';
    };
    let done = false;
    const once = () => { if (done) return; done = true; finish(); };
    modal.querySelector('.pview__bg')?.addEventListener('transitionend', once, { once: true });
    setTimeout(once, 800);
    if (lastTrigger && lastTrigger.focus) lastTrigger.focus({ preventScroll: true });
    if (location.hash.startsWith('#project/')) history.replaceState(null, '', location.pathname + location.search);
  }

  function fill(project) {
    numEl.textContent = String(currentIdx + 1).padStart(2, '0');
    catEl.textContent = project.category;
    setTitle(project.title);
    descEl.textContent = project.description || '';

    // 상세 팩트 — role / contribution / result / credits
    const rows = [];
    const role = String(project.role || '').trim(); if (role) rows.push(['Role', role]);
    const contribution = String(project.contribution || '').trim(); if (contribution) rows.push(['Contribution', contribution]);
    const result = String(project.result || '').trim(); if (result) rows.push(['Result', result]);
    const credits = Array.isArray(project.credits) ? project.credits.filter(c => c && (c.role || c.name)) : [];
    if (credits.length) rows.push(['Credits', credits.map(c => [c.role, c.name].filter(Boolean).join(' — ')).join('\n')]);
    detailsEl.innerHTML = rows.map(([label, value]) => `<div class="pview__row"><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');

    // 미디어 — 첫 미디어 = 대형 리드(원본 비율), 나머지 = 메이슨리 그리드
    const media = orderedMedia(project);
    const title = project.title || '';
    leadEl.innerHTML = media.length ? renderLead(media[0], title)
      : '<div class="pview__media-fail">미디어가 등록되지 않은 프로젝트입니다.</div>';
    gallery.innerHTML = media.slice(1).map((m, i) => renderGridMedia(m, `${title} — ${i + 2}`)).join('');

    tagsEl.innerHTML = (project.tags || []).map(t => `<span class="pview__tag">${escapeHtml(t)}</span>`).join('');
  }

  function open(id) {
    const project = state.portfolio.projects.find(p => p.id === Number(id));
    if (!project) return;
    currentIdx = seq.findIndex(p => p.id === project.id);
    updateNav();
    fill(project);

    const wasHidden = modal.hidden;
    if (wasHidden) lastTrigger = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('pm-open');
    lenis?.stop();
    if (scroller) scroller.scrollTop = 0;
    if (wasHidden) {
      mainHadInert = !!mainEl?.hasAttribute('inert'); mainEl?.setAttribute('inert', '');
      hudHadInert = !!hudEl?.hasAttribute('inert'); hudEl?.setAttribute('inert', '');
    }
    // 배경 전환 + 타이틀 리빌 — 강제 리플로우로 초기 클립 상태 커밋 후 클래스 부여(rAF 스로틀 무관)
    modal.classList.remove('is-in');
    void modal.offsetWidth;
    modal.classList.add('is-in');
    revealTitle();
    if (location.hash !== `#project/${id}`) {
      wasHidden ? history.pushState(null, '', `#project/${id}`) : history.replaceState(null, '', `#project/${id}`);
    }
    modal.querySelector('button[data-close]')?.focus({ preventScroll: true });
  }

  const go = (delta) => {
    const ni = currentIdx + delta;
    if (ni < 0 || ni >= seq.length) return;
    open(seq[ni].id);
  };
  prevBtn?.addEventListener('click', () => go(-1));
  nextBtn?.addEventListener('click', () => go(1));

  window.openProjectDetail = open;

  modal.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', close));
  document.addEventListener('keydown', (e) => {
    if (modal.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'Tab') {
      // 포커스 트랩 — 마지막↔처음 순환 (역방향 Tab 포함). 숨김 버튼(prev/next)은 제외
      const foc = [...modal.querySelectorAll('a[href], button:not([disabled]), iframe, video, [tabindex]:not([tabindex="-1"])')]
        .filter(el => el.offsetWidth || el.offsetHeight || el === document.activeElement);
      if (foc.length < 2) return;
      const first = foc[0], last = foc[foc.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // 포커스 봉쇄
  document.addEventListener('focusin', (e) => {
    if (modal.hidden) return;
    if (modal.contains(e.target)) return;
    modal.querySelector('button[data-close]')?.focus({ preventScroll: true });
  });

  window.addEventListener('popstate', () => {
    const h = location.hash;
    if (h.startsWith('#project/')) open(h.replace('#project/', ''));
    else if (!modal.hidden) close();
  });
  if (location.hash.startsWith('#project/')) open(location.hash.replace('#project/', ''));
}
