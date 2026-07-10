// All Works 인덱스 리스트 + 커서 프리뷰 (aristide 어법)
// + Drive 썸네일 헬퍼 (히어로 롤 등 공용)

// ── Google Drive 썸네일 URL 폴백 체인 ──
function getDriveId(url) {
  if (!url || typeof url !== 'string') return '';
  if (!url.includes('drive.google.com')) return '';
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : '';
}
function normalizeMediaUrl(url, w = 1600) {
  if (!url) return '';
  const id = getDriveId(url);
  if (id) return `https://lh3.googleusercontent.com/d/${id}=w${w}`;
  return url;
}
function pickThumb(project) {
  if (!project.media || !project.media.length) return null;
  const img = project.media.find(m => (m.type || '').startsWith('image'));
  return (img || project.media[0]).url;
}
export { pickThumb, normalizeMediaUrl };

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// 역할 태그 — 모노톤 라인 알약(헤어라인 아웃라인). 컬러 필은 튀어서 폐기(Hati).
// 색은 작품 미디어만 갖고, 메타 정보는 조용히 물러나는 에디토리얼 문법.
function renderTags(project, wrapCls, itemCls, max = 6) {
  const tags = Array.isArray(project.tags) ? project.tags.filter(Boolean).slice(0, max) : [];
  if (!tags.length) return '';
  return `<span class="${wrapCls}">${tags.map(t => `<span class="${itemCls}">${escapeHtml(t)}</span>`).join('')}</span>`;
}
export { renderTags };

// 행/프리뷰용 안전 썸네일 — Drive는 영상도 스틸을 주지만 로컬 영상 파일은 <img> 불가
const DIRECT_VIDEO_RE = /\.(mp4|mov|webm|m4v)(\?|#|$)/i;
function getYouTubeId(url) { const m = String(url || '').match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/); return m ? m[1] : ''; }
function getVimeoId(url) { const m = String(url || '').match(/vimeo\.com\/(?:video\/)?(\d+)/); return m ? m[1] : ''; }

// Drive lh3 실패 시 2차 시도할 썸네일 URL
function driveThumbFallback(raw, w = 1600) { const id = getDriveId(raw); return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w${w}` : ''; }

// 미디어 하나가 낼 수 있는 썸네일 URL — 로컬 영상은 스틸이 없어 ''
function mediaThumbUrl(raw, w) {
  if (!raw) return '';
  const id = getDriveId(raw);
  if (id) return `https://lh3.googleusercontent.com/d/${id}=w${w}`;
  if (DIRECT_VIDEO_RE.test(raw)) return '';
  const yt = getYouTubeId(raw); if (yt) return `https://img.youtube.com/vi/${yt}/hqdefault.jpg`;
  if (getVimeoId(raw)) return '';   // Vimeo 포스터는 oEmbed 필요 → 생략
  return raw;
}

// 썸네일 후보 체인 — 첫 후보가 404 여도(지워진 업로드 등) 다음으로 넘어가 프레임이 비지 않는다.
// 미디어를 전부 넣으면 data-alts 가 수십 개로 불어 HTML 만 수십 KB 커진다.
// 첫 이미지 · 마지막 이미지 · 첫 영상 포스터 세 갈래면 실패 조합을 사실상 다 덮는다.
function thumbCandidates(project, w = 600) {
  const media = Array.isArray(project.media) ? project.media : [];
  const isImg = m => (m.type || '').startsWith('image');
  const imgs = media.filter(isImg);
  const vids = media.filter(m => !isImg(m));
  const picks = [imgs[0], imgs[imgs.length - 1], vids[0]].filter(Boolean);
  const urls = [];
  for (const m of picks) {
    const u = mediaThumbUrl(m.url, w); if (u) urls.push(u);
    const alt = driveThumbFallback(m.url, w); if (alt) urls.push(alt);
  }
  return [...new Set(urls)];
}

// 공용 안전 썸네일 — 체인의 첫 후보
function safeThumb(project, w = 600) { return thumbCandidates(project, w)[0] || ''; }

// onerror 체인 — 후보를 하나씩 소진하고, 다 떨어지면 숨기거나(기본) 지운다(히어로 슬랫).
function fallbackJs(onEmpty) {
  const give = onEmpty === 'remove' ? 'this.remove()' : "this.style.visibility='hidden'";
  return `var a=this.dataset.alts?JSON.parse(this.dataset.alts):[];if(a.length){this.src=a.shift();this.dataset.alts=JSON.stringify(a)}else{${give}}`;
}
function thumbImg(project, w, cls, opts = {}) {
  const [src, ...alts] = thumbCandidates(project, w);
  if (!src) return '';
  const lazy = opts.lazy === false ? '' : ' loading="lazy"';
  return `<img${cls ? ` class="${cls}"` : ''} src="${escapeHtml(src)}" data-alts="${escapeHtml(JSON.stringify(alts))}" alt=""${lazy} decoding="async" onerror="${fallbackJs(opts.onEmpty)}">`;
}
export { safeThumb, driveThumbFallback, thumbCandidates, thumbImg };

// ── 커서 팔로우 프리뷰 (데스크탑 hover 전용) ──
function createPreview() {
  if (!window.matchMedia('(hover: hover)').matches) return null;
  const el = document.createElement('div');
  el.className = 'idx-preview';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<img alt="" decoding="async">`;
  document.body.appendChild(el);
  const img = el.querySelector('img');

  let mx = innerWidth / 2, my = innerHeight / 2;
  let px = mx, py = my;
  let on = false, rafOn = false;

  const loop = () => {
    if (!rafOn) return;
    px += (mx - px) * 0.14;
    py += (my - py) * 0.14;
    const tilt = Math.max(-7, Math.min(7, (mx - px) * 0.05));
    el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -56%) rotate(${tilt.toFixed(2)}deg)`;
    requestAnimationFrame(loop);
  };
  window.addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; });

  return {
    // 후보 체인을 받아 404 면 다음 후보로 넘어간다
    show(srcs) {
      const list = Array.isArray(srcs) ? srcs.slice() : (srcs ? [srcs] : []);
      if (list.length) {
        img.onerror = () => { if (list.length) img.src = list.shift(); else img.style.visibility = 'hidden'; };
        img.style.visibility = '';
        img.src = list.shift();
      }
      if (!on) { px = mx; py = my; }
      on = true;
      el.classList.add('is-on');
      if (!rafOn) { rafOn = true; requestAnimationFrame(loop); }
    },
    hide() {
      on = false;
      el.classList.remove('is-on');
      setTimeout(() => { if (!on) rafOn = false; }, 300);
    }
  };
}

// ── 인덱스 행 ──
function renderRow(project) {
  const idStr = String(project.id).padStart(3, '0');
  const thumbHtml = thumbImg(project, 300, 'idx-row__thumb');
  const a = document.createElement('a');
  a.className = 'idx-row';
  a.href = `#project/${project.id}`;
  a.dataset.id = project.id;
  a.dataset.cursor = 'view';
  a.innerHTML = `
    ${thumbHtml || `<span class="idx-row__thumb idx-row__thumb--empty" aria-hidden="true"></span>`}
    <span class="idx-row__num">${idStr}</span>
    <span class="idx-row__main">
      <span class="idx-row__title">${escapeHtml(project.title || '(untitled)')}</span>
      ${renderTags(project, 'idx-row__tags', 'idx-row__tag')}
    </span>
    <span class="idx-row__cat">${escapeHtml(project.category)}</span>
  `;
  a.addEventListener('click', (e) => {
    e.preventDefault();
    if (window.openProjectDetail) window.openProjectDetail(project.id);
  });
  return a;
}

// ── All Works ──
const CATS = ['all', 'video', 'photo', 'graphic'];
// All 뷰 정렬 우선순위 — 비디오 먼저 (Hati 지시)
const CAT_PRIORITY = { video: 0, photo: 1, graphic: 2 };

export function initAllWorks(portfolio) {
  const list = document.getElementById('allWorksGrid');
  const tabs = document.querySelectorAll('.filter-tab');
  if (!list) return;

  // 카운트 갱신
  const counts = { all: portfolio.projects.length, photo: 0, graphic: 0, video: 0 };
  portfolio.projects.forEach(p => { counts[p.category] = (counts[p.category] || 0) + 1; });
  tabs.forEach(t => {
    const c = t.dataset.cat;
    t.querySelector('.filter-tab__count').textContent = String(counts[c] ?? 0).padStart(2, '0');
  });

  const preview = createPreview();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let active = 'all';

  function filtered() {
    const arr = active === 'all' ? portfolio.projects : portfolio.projects.filter(p => p.category === active);
    return arr.slice().sort((a, b) => {
      // All 뷰: 카테고리 우선순위(비디오→포토→그래픽), 그 안에서 order/id
      if (active === 'all') {
        const pa = CAT_PRIORITY[a.category] ?? 9, pb = CAT_PRIORITY[b.category] ?? 9;
        if (pa !== pb) return pa - pb;
      }
      return (a.order ?? 0) - (b.order ?? 0) || a.id - b.id;
    });
  }

  // userAction=true(필터 클릭) → 이미 화면 안이므로 즉시 스태거.
  // userAction=false(최초/해시) → 정적으로 두고, 스크롤 진입 시 아래 1회 트리거가 리빌.
  function render(userAction) {
    list.innerHTML = '';
    filtered().forEach(p => list.appendChild(renderRow(p)));
    preview?.hide();
    if (userAction && window.gsap && !reduced) {
      window.gsap.from(list.children, {
        opacity: 0, y: 14, duration: 0.5, ease: 'power2.out', stagger: 0.018, clearProps: 'all'
      });
    }
  }

  // 프리뷰 바인딩 (위임) — 같은 행 재진입 시 재로드/재계산 방지
  if (preview) {
    const byId = new Map(portfolio.projects.map(p => [p.id, p]));
    let lastPreviewId = -1;
    list.addEventListener('pointerover', (e) => {
      const row = e.target.closest('.idx-row');
      if (!row || !list.contains(row)) return;
      const id = Number(row.dataset.id);
      if (id === lastPreviewId) return;
      lastPreviewId = id;
      const p = byId.get(id);
      preview.show(p ? thumbCandidates(p, 800) : []);
    });
    list.addEventListener('pointerleave', () => { lastPreviewId = -1; preview.hide(); });
  }

  function setActive(cat, push = true) {
    if (!CATS.includes(cat)) cat = 'all';
    active = cat;
    tabs.forEach(t => {
      const isActive = t.dataset.cat === cat;
      t.classList.toggle('is-active', isActive);
      t.setAttribute('aria-pressed', String(isActive));
    });
    if (push) {
      const hash = cat === 'all' ? '' : `#${cat}`;
      if (location.hash !== hash) history.pushState(null, '', hash || location.pathname);
    }
    render(push);
    // 사용자 필터로 리스트 높이가 바뀌면 아래 섹션 트리거 좌표 갱신
    if (push && window.ScrollTrigger) window.ScrollTrigger.refresh();
  }

  tabs.forEach(t => t.addEventListener('click', () => setActive(t.dataset.cat, true)));

  window.addEventListener('hashchange', () => {
    const h = location.hash.replace('#', '');
    if (h.startsWith('project/')) return;   // 모달 라우팅과 충돌 방지
    if (h && !CATS.includes(h)) return;      // 섹션 앵커(#works/#about/#contact)는 필터를 건드리지 않음
    setActive(h || 'all', false);
  });

  setActive(location.hash.replace('#', '') || 'all', false);

  // 최초 1회 — 인덱스가 뷰포트에 들어올 때 현재 행들을 스태거로 리빌 (부팅 시 오프스크린 낭비 방지)
  if (window.gsap && window.ScrollTrigger && !reduced) {
    window.ScrollTrigger.create({
      trigger: list, start: 'top 85%', once: true,
      onEnter: () => window.gsap.from(list.children, {
        opacity: 0, y: 16, duration: 0.55, ease: 'power2.out', stagger: 0.02, clearProps: 'all'
      })
    });
  }
}
