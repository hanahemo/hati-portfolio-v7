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

// ── 작품별 배경 파스텔 추출 ─────────────────────────────────────────────
// 썸네일(첫 이미지 미디어)의 지배 색상을 뽑아 '명도 높은 파스텔'로 변환해 배경 톤으로 사용.
function projectThumbUrl(project) {
  const media = Array.isArray(project.media) ? project.media : [];
  if (!media.length) return '';
  const pick = media.find(m => (m.type || '').startsWith('image')) || media[0];
  const raw = pick.url || '';
  const id = getDriveId(raw);
  if (id) return `https://lh3.googleusercontent.com/d/${id}=w600`;   // 카드와 동일 해상도 → 캐시 히트
  if (DIRECT_VIDEO_RE.test(raw)) return '';                          // 영상 파일은 스틸 없음 → 폴백
  return raw;                                                        // 로컬/외부 이미지
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h *= 60; if (h < 0) h += 360;
  }
  return [h, s, l];
}
// 지배 색상 → 명도 높은 파스텔 hsl 문자열. 거의 무채색 아트는 소프트 뉴트럴로.
function toPastel(h, s) {
  if (s < 0.08) return `hsl(${Math.round(h)}, 12%, 95%)`;
  const S = Math.min(0.48, Math.max(0.3, s));   // 파스텔 채도 대역
  return `hsl(${Math.round(h)}, ${Math.round(S * 100)}%, 93%)`;   // 명도 93% 고정 = 밝은 파스텔
}
// 썸네일 URL → 파스텔 hsl 문자열(Promise). CORS/로딩 실패 시 null(→ 기본 배경 폴백).
function extractPastel(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      try {
        const N = 40;
        const cv = document.createElement('canvas'); cv.width = N; cv.height = N;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, N, N);
        const data = ctx.getImageData(0, 0, N, N).data;
        let rw = 0, gw = 0, bw = 0, wsum = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 125) continue;
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          const l = (mx + mn) / 2 / 255;
          if (l > 0.96 || l < 0.05) continue;      // 흰/검 근처는 색상 정보 없음 → 제외
          const d = (mx - mn) / 255;
          const w = d * d + 0.02;                  // 채도 높은 픽셀에 가중 → 지배 '색상'이 이김
          rw += r * w; gw += g * w; bw += b * w; wsum += w;
        }
        if (!wsum) return resolve(null);
        const [h, s] = rgbToHsl(rw / wsum, gw / wsum, bw / wsum);
        resolve(toPastel(h, s));
      } catch (_) { resolve(null); }   // 오염된 캔버스(CORS) 등 → 폴백
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
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
  const creditsSection = modal.querySelector('#pmCredits');
  const creditsGrid = modal.querySelector('#pmCreditsGrid');
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

  // 어드민에서 비워둔 칸은 "" 가 아니라 마침표 한 개(".")로 저장돼 있는 경우가 많다.
  // 글자도 숫자도 없는 값은 내용이 아니라 자리표시자로 보고 화면에서 뺀다.
  function filled(value) {
    const s = String(value ?? '').trim();
    return /[\p{L}\p{N}]/u.test(s) ? s : '';
  }

  function fill(project) {
    numEl.textContent = String(currentIdx + 1).padStart(2, '0');
    catEl.textContent = project.category;
    setTitle(project.title);
    descEl.textContent = filled(project.description);

    // 상세 팩트 — role / contribution / result / credits. 어드민에서 안 채운 칸은 줄째로 빠진다.
    const rows = [];
    const role = filled(project.role); if (role) rows.push(['Role', role]);
    const contribution = filled(project.contribution); if (contribution) rows.push(['Contribution', contribution]);
    const result = filled(project.result); if (result) rows.push(['Result', result]);
    detailsEl.innerHTML = rows.map(([label, value]) => `<div class="pview__row"><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');

    // 크레딧 — 전용 섹션에 자동 다단 그리드(auto-fill). 양이 늘어나도 열로 알아서 정리됨.
    const credits = Array.isArray(project.credits) ? project.credits.filter(c => c && (filled(c.role) || filled(c.name))) : [];
    if (creditsGrid && creditsSection) {
      creditsGrid.innerHTML = credits.map(c => `
        <div class="pview__credit">
          <dt>${escapeHtml(filled(c.role) || '—')}</dt>
          <dd>${escapeHtml(filled(c.name))}</dd>
        </div>`).join('');
      creditsSection.hidden = credits.length === 0;
    }

    // 미디어 — 첫 미디어 = 대형 리드(원본 비율), 나머지 = 메이슨리 그리드
    const media = orderedMedia(project);
    const title = project.title || '';
    leadEl.innerHTML = media.length ? renderLead(media[0], title)
      : '<div class="pview__media-fail">미디어가 등록되지 않은 프로젝트입니다.</div>';
    gallery.innerHTML = media.slice(1).map((m, i) => renderGridMedia(m, `${title} — ${i + 2}`)).join('');

    tagsEl.innerHTML = (project.tags || []).map(t => `<span class="pview__tag">${escapeHtml(t)}</span>`).join('');
  }

  // 작품별 배경 파스텔 — 계산 결과는 캐시(재방문 시 즉시 적용)
  const paletteCache = new Map();
  function applyBackdrop(project) {
    const cached = paletteCache.get(project.id);
    if (cached) { modal.style.setProperty('--pv-bg', cached); return; }
    modal.style.removeProperty('--pv-bg');   // 계산 전엔 CSS 기본값(소프트 라벤더 화이트)
    const url = projectThumbUrl(project);
    if (!url) return;
    extractPastel(url).then(hsl => {
      if (!hsl) return;
      paletteCache.set(project.id, hsl);
      // 그 사이 다른 작품으로 넘어갔으면 적용하지 않음
      if (seq[currentIdx] && seq[currentIdx].id === project.id) modal.style.setProperty('--pv-bg', hsl);
    });
  }

  function open(id) {
    const project = state.portfolio.projects.find(p => p.id === Number(id));
    if (!project) return;
    currentIdx = seq.findIndex(p => p.id === project.id);
    updateNav();
    fill(project);
    applyBackdrop(project);

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
