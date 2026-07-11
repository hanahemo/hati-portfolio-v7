// Hati Admin — 컨트롤 룸 프론트엔드 (순수 JS, 모듈)
// - 프로젝트 CRUD + 드래그 정렬
// - featuredProjectIds 토글 & 순서 관리
// - settings 편집
// - 미디어 업로드 (multer 백엔드)

const API = '/admin/api';
let state = {
  portfolio: { projects: [] },
  settings: {}
};

// ── 유틸 ──
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function toast(msg, kind = 'ok') {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('admin-toast--err', kind === 'err');
  el.classList.add('is-show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('is-show'), 2200);
}

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
    ...opts
  });
  if (res.status === 401) { location.href = '/admin/login'; throw new Error('unauth'); }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'request failed' }));
    throw new Error(err.error || 'request failed');
  }
  return res.status === 204 ? null : res.json();
}

async function loadAll() {
  const [portfolio, settings] = await Promise.all([
    api('/portfolio'),
    api('/settings')
  ]);
  state.portfolio = portfolio || { projects: [] };
  state.settings = settings || {};
  renderProjects();
  renderFeatured();
  renderReel();
  renderSettings();
  renderDeck();
}

// ── Tabs ──
$$('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const key = tab.dataset.tab;
    $$('.admin-tab').forEach(t => {
      t.classList.toggle('is-active', t === tab);
      t.setAttribute('aria-selected', String(t === tab));
    });
    $$('.admin-panel').forEach(p => p.classList.toggle('is-active', p.dataset.panel === key));
    // reel 탭은 열 때마다 최신 order로 다시 그림 (projects 탭에서 정렬 변경 반영)
    if (key === 'reel') renderReel();
  });
});

// ── Deck 탭 — PPT 장표 전용 텍스트 (전역 + 작품별) ──
function renderDeck() {
  const form = $('#deckForm');
  if (!form) return;
  const d = (state.settings && state.settings.deck) || {};
  form.coverHeadline.value = d.coverHeadline || '';
  form.statement.value = d.statement || '';
  form.introText.value = d.introText || '';
  form.services.value = d.services || '';

  const wrap = $('#deckProjects');
  if (!wrap) return;
  wrap.innerHTML = '';
  const byId = new Map((state.portfolio.projects || []).map(p => [p.id, p]));
  const feat = (state.settings.featuredProjectIds || []).map(id => byId.get(id)).filter(Boolean);
  feat.forEach(p => {
    const row = document.createElement('div');
    row.className = 'admin-deck-row';
    row.innerHTML = `
      <div class="admin-deck-row__title"></div>
      <div class="admin-deck-row__grid">
        <label class="admin-field"><span>client</span><input class="admin-input" data-f="client" maxlength="200"></label>
        <label class="admin-field"><span>year</span><input class="admin-input" data-f="year" maxlength="20"></label>
        <label class="admin-field admin-field--wide"><span>장표 요약 (히어로 한 줄 카피)</span><input class="admin-input" data-f="deckSummary" maxlength="600"></label>
        <label class="admin-field admin-field--wide"><span>커버 이미지 URL (비우면 첫 미디어)</span><input class="admin-input" data-f="coverImage" maxlength="500" placeholder="https://drive.google.com/... 또는 /uploads/..."></label>
      </div>
      <div class="admin-form__actions"><button type="button" class="admin-pill admin-pill--sm" data-save>save</button><span class="admin-muted" data-status></span></div>`;
    row.querySelector('.admin-deck-row__title').textContent = p.title || '(untitled)';
    ['client', 'year', 'deckSummary', 'coverImage'].forEach(f => { row.querySelector(`[data-f="${f}"]`).value = p[f] || ''; });
    row.querySelector('[data-save]').addEventListener('click', async () => {
      const patch = {};
      ['client', 'year', 'deckSummary', 'coverImage'].forEach(f => { patch[f] = row.querySelector(`[data-f="${f}"]`).value; });
      const st = row.querySelector('[data-status]');
      try {
        const updated = await api(`/portfolio/${p.id}`, { method: 'PUT', body: JSON.stringify(patch) });
        Object.assign(p, updated || patch);
        st.textContent = '저장됨';
        setTimeout(() => { st.textContent = ''; }, 1800);
      } catch (err) { st.textContent = '실패: ' + err.message; }
    });
    wrap.appendChild(row);
  });
}

const deckForm = $('#deckForm');
if (deckForm) deckForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const st = $('#deckStatus');
  try {
    const deck = {
      coverHeadline: deckForm.coverHeadline.value,
      statement: deckForm.statement.value,
      introText: deckForm.introText.value,
      services: deckForm.services.value,
    };
    const merged = await api('/settings', { method: 'PUT', body: JSON.stringify({ deck }) });
    state.settings = merged || state.settings;
    if (st) st.textContent = '저장됨';
    toast('deck 텍스트 저장 완료');
    setTimeout(() => { if (st) st.textContent = ''; }, 1800);
  } catch (err) { if (st) st.textContent = '실패: ' + err.message; toast('저장 실패', 'err'); }
});

// ── PPT 내보내기 — 현재 데이터 스냅샷을 기업 제출용 덱으로 (settings 탭) ──
const pptBtn = $('#pptExportBtn');
if (pptBtn) pptBtn.addEventListener('click', async () => {
  const scope = ($('#pptScope') && $('#pptScope').value) === 'all' ? 'all' : 'featured';
  const status = $('#pptStatus');
  pptBtn.disabled = true;
  if (status) status.textContent = '생성 중… (이미지 수집에 수십 초 걸릴 수 있어요)';
  try {
    const res = await fetch(`${API}/export-ppt?scope=${scope}`, { credentials: 'same-origin' });
    if (res.status === 401) { location.href = '/admin/login'; return; }
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'export failed');
    // 세션 만료가 302→로그인 HTML 로 돌아오는 경로 방어 — pptx 가 아니면 다운로드하지 않는다
    if (!(res.headers.get('content-type') || '').includes('presentationml')) { location.href = '/admin/login'; return; }
    const blob = await res.blob();
    const cd = res.headers.get('content-disposition') || '';
    const m = cd.match(/filename="([^"]+)"/);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (m && m[1]) || 'Hati_Portfolio.pptx';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    if (status) status.textContent = `완료 — ${(blob.size / 1048576).toFixed(1)}MB`;
    toast('PPT 생성 완료');
  } catch (err) {
    if (status) status.textContent = '실패: ' + err.message;
    toast('PPT 생성 실패', 'err');
  } finally { pptBtn.disabled = false; }
});

// ── Logout ──
$('#logoutBtn').addEventListener('click', async () => {
  await fetch('/admin/logout', { method: 'POST' });
  location.href = '/admin/login';
});

// ── Projects ──
let projFilter = { q: '', cat: 'all' };

function sortedProjects() {
  const q = projFilter.q.trim().toLowerCase();
  return state.portfolio.projects
    .filter(p => projFilter.cat === 'all' || p.category === projFilter.cat)
    .filter(p => !q || (p.title || '').toLowerCase().includes(q) || String(p.id).includes(q))
    .slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id);
}

// 검색/필터 바인딩 — 렌더 후 한 번만
document.addEventListener('DOMContentLoaded', () => {
  const s = $('#projSearch'), f = $('#projCatFilter');
  if (s) s.addEventListener('input', () => { projFilter.q = s.value; renderProjects(); });
  if (f) f.addEventListener('change', () => { projFilter.cat = f.value; renderProjects(); });
});

// 네온 확인 다이얼로그 (브라우저 confirm 대체)
function neonConfirm(message) {
  return new Promise((resolve) => {
    const dlg = document.createElement('div');
    dlg.className = 'admin-confirm';
    const msgId = `confirm-msg-${Date.now()}`;
    dlg.innerHTML = `
      <div class="admin-confirm__box" role="alertdialog" aria-modal="true" aria-labelledby="${msgId}">
        <div class="admin-confirm__msg" id="${msgId}">${escapeHtml(message)}</div>
        <div class="admin-confirm__actions">
          <button class="admin-pill" data-ans="0">cancel</button>
          <button class="admin-pill admin-pill--danger" data-ans="1">confirm</button>
        </div>
      </div>`;
    document.body.appendChild(dlg);
    // 열림 동안 배경 비활성 (dlg·라이브 리전(toast) 제외 body 직계 요소에 inert)
    const inerted = [...document.body.children]
      .filter(el => el !== dlg && el.id !== 'toast' && !el.hasAttribute('inert'));
    inerted.forEach(el => el.setAttribute('inert', ''));
    const trigger = document.activeElement; // 닫힘 시 포커스 복원용
    const esc = (e) => { if (e.key === 'Escape') done(false); };
    const done = (v) => {
      document.removeEventListener('keydown', esc);
      inerted.forEach(el => el.removeAttribute('inert'));
      dlg.remove();
      if (trigger && trigger.focus) trigger.focus({ preventScroll: true });
      resolve(v);
    };
    dlg.querySelector('[data-ans="0"]').addEventListener('click', () => done(false));
    dlg.querySelector('[data-ans="1"]').addEventListener('click', () => done(true));
    dlg.addEventListener('click', (e) => { if (e.target === dlg) done(false); });
    document.addEventListener('keydown', esc);
    setTimeout(() => dlg.querySelector('[data-ans="1"]').focus(), 50);
  });
}

function renderProjects() {
  const body = $('#projectsBody');
  const list = sortedProjects();
  const featured = new Set(state.settings.featuredProjectIds || []);
  body.innerHTML = '';
  list.forEach(p => {
    const tr = document.createElement('tr');
    tr.dataset.id = p.id;
    tr.draggable = true;
    const ext = (p.externalLink || '').trim();
    tr.innerHTML = `
      <td><span class="admin-drag-handle" aria-hidden="true">≡</span></td>
      <td>#${String(p.id).padStart(3, '0')}</td>
      <td>${escapeHtml(p.title || '(untitled)')}</td>
      <td><span class="admin-cat-dot" data-cat="${p.category}"></span>${p.category}</td>
      <td>${featured.has(p.id)
        ? `<span class="admin-badge admin-badge--on">on</span>`
        : `<span class="admin-badge admin-badge--off">—</span>`}</td>
      <td>${ext
        ? `<a class="admin-ext-badge" href="${escapeAttr(ext)}" target="_blank" rel="noopener" title="${escapeAttr(ext)}">↗ ${escapeHtml(ext.replace(/^https?:\/\//, '').slice(0, 24))}…</a>`
        : `<span class="admin-muted">—</span>`}</td>
      <td>
        <div class="admin-row-actions">
          <button class="admin-pill admin-pill--sm" data-action="edit">edit</button>
          <button class="admin-pill admin-pill--sm admin-pill--danger" data-action="del">del</button>
        </div>
      </td>
    `;
    body.appendChild(tr);
  });
  $('#projCount').textContent = `${list.length} total`;
  attachProjectRowEvents();
  attachProjectDragDrop();
}

function attachProjectRowEvents() {
  $$('#projectsBody tr').forEach(tr => {
    const id = parseInt(tr.dataset.id, 10);
    tr.querySelector('[data-action="edit"]').addEventListener('click', () => openProjectModal(id));
    tr.querySelector('[data-action="del"]').addEventListener('click', async () => {
      const p = state.portfolio.projects.find(x => x.id === id);
      const ok = await neonConfirm(`#${String(id).padStart(3, '0')} "${p?.title || ''}"를 삭제할까요? 이 작업은 되돌릴 수 없습니다.`);
      if (!ok) return;
      try {
        await api(`/portfolio/${id}`, { method: 'DELETE' });
        toast('deleted');
        await loadAll();
      } catch (e) { toast(e.message, 'err'); }
    });
  });
}

// 드래그 정렬
function attachProjectDragDrop() {
  let dragEl = null;
  $$('#projectsBody tr').forEach(tr => {
    tr.addEventListener('dragstart', (e) => {
      dragEl = tr; tr.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    tr.addEventListener('dragend', () => {
      tr.classList.remove('is-dragging');
      $$('#projectsBody tr').forEach(r => r.classList.remove('is-drag-over'));
    });
    tr.addEventListener('dragover', (e) => { e.preventDefault(); tr.classList.add('is-drag-over'); });
    tr.addEventListener('dragleave', () => tr.classList.remove('is-drag-over'));
    tr.addEventListener('drop', async (e) => {
      e.preventDefault();
      tr.classList.remove('is-drag-over');
      if (!dragEl || dragEl === tr) return;
      const parent = tr.parentNode;
      const rect = tr.getBoundingClientRect();
      const after = (e.clientY - rect.top) > rect.height / 2;
      parent.insertBefore(dragEl, after ? tr.nextSibling : tr);
      const order = $$('#projectsBody tr').map(r => parseInt(r.dataset.id, 10));
      try {
        await api('/portfolio/reorder', { method: 'PUT', body: JSON.stringify({ order }) });
        // 로컬 state 반영
        order.forEach((id, idx) => {
          const p = state.portfolio.projects.find(x => x.id === id);
          if (p) p.order = idx;
        });
        toast('reordered');
      } catch (err) { toast(err.message, 'err'); await loadAll(); }
    });
  });
}

// ── Project Modal ──
const modal = $('#projectModal');
const projForm = $('#projectForm');

$$('#projectModal [data-close]').forEach(el => el.addEventListener('click', () => modal.hidden = true));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.hidden) modal.hidden = true;
});

$('#addProjectBtn').addEventListener('click', () => openProjectModal(null));

// ── 프로젝트 미디어 행 (구글드라이브 주소 입력) ──
function addMediaRow(url = '', type = 'image') {
  const wrap = $('#mediaRows');
  const row = document.createElement('div');
  row.className = 'admin-media-row';
  row.innerHTML = `
    <select class="admin-input admin-media-row__type" aria-label="media type">
      <option value="image"${type === 'image' ? ' selected' : ''}>image</option>
      <option value="video"${type === 'video' ? ' selected' : ''}>video</option>
    </select>
    <input type="url" class="admin-input admin-media-row__input" placeholder="https://drive.google.com/file/d/…/view" value="${escapeAttr(url)}">
    <button type="button" class="admin-pill admin-pill--sm admin-pill--danger admin-media-row__del" aria-label="삭제">✕</button>`;
  row.querySelector('.admin-media-row__del').addEventListener('click', () => {
    row.remove();
    if (!$$('.admin-media-row', wrap).length) addMediaRow('');   // 최소 1행 유지
  });
  wrap.appendChild(row);
}
function renderMediaRows(media) {
  const wrap = $('#mediaRows');
  if (!wrap) return;
  wrap.innerHTML = '';
  const list = (media && media.length) ? media : [{ url: '', type: 'image' }];
  list.forEach(m => addMediaRow(m.url || '', m.type || 'image'));
}
$('#mediaAddRow')?.addEventListener('click', () => addMediaRow(''));

// ── 크레딧 에디터 (역할 프리셋 칩 클릭 → 이름 입력 → 추가) ──
// 데이터는 그대로 credits:[{role,name}]. currentCredits가 소스 오브 트루스.
const CREDIT_ROLES = ['Director','Photography','Cinematography','Videography','Editor','Art','Art Director','Creative Director','Graphic Design','Motion Graphics','VFX','AI','Colorist','Styling','Hair & Makeup','Gaffer','Lighting','Set Design','Producer','Production Manager','1st Assistant','Assistant','Starring','Model','Music','Sound Design','Campaign Strategy','Brand Design','Entire Production'];
let currentCredits = [];
const creditRoleInput = $('#creditRole');
const creditNameInput = $('#creditName');
const creditListEl = $('#creditList');

function renderCreditRoleChips() {
  const wrap = $('#creditRoleChips');
  if (!wrap) return;
  wrap.innerHTML = CREDIT_ROLES.map(r => `<button type="button" class="admin-crole" data-role="${escapeAttr(r)}">${escapeHtml(r)}</button>`).join('');
}
function renderCreditList() {
  if (!creditListEl) return;
  creditListEl.innerHTML = currentCredits.map((c, i) => `
    <li class="admin-credits__item">
      <span class="admin-credits__role-tag">${escapeHtml(c.role || '—')}</span>
      <span class="admin-credits__name-tag">${escapeHtml(c.name || '')}</span>
      <button type="button" class="admin-credits__del" data-i="${i}" aria-label="삭제">×</button>
    </li>`).join('');
}
function addCredit() {
  const role = (creditRoleInput?.value || '').trim();
  const name = (creditNameInput?.value || '').trim();
  if (!role && !name) return;
  currentCredits.push({ role, name });
  renderCreditList();
  if (creditNameInput) { creditNameInput.value = ''; creditNameInput.focus(); }
}
// 저장 시: 입력칸에 남은 값 자동 반영 후 배열 반환
function collectCredits() {
  addCredit();
  return currentCredits.map(c => ({ role: c.role, name: c.name })).filter(c => c.role || c.name);
}
$('#creditRoleChips')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.admin-crole');
  if (!btn) return;
  if (creditRoleInput) creditRoleInput.value = btn.dataset.role;
  if (creditNameInput) creditNameInput.focus();
});
$('#creditAdd')?.addEventListener('click', addCredit);
creditNameInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCredit(); } });
creditRoleInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); creditNameInput?.focus(); } });
creditListEl?.addEventListener('click', (e) => {
  const del = e.target.closest('.admin-credits__del');
  if (!del) return;
  currentCredits.splice(Number(del.dataset.i), 1);
  renderCreditList();
});
renderCreditRoleChips();

function openProjectModal(id) {
  const p = id ? state.portfolio.projects.find(x => x.id === id) : null;
  $('#projModalTitle').textContent = p ? `edit #${String(p.id).padStart(3, '0')}` : 'new project';
  projForm.reset();
  projForm.id.value = p?.id ?? '';
  projForm.title.value = p?.title ?? '';
  projForm.category.value = p?.category ?? 'photo';
  projForm.description.value = p?.description ?? '';
  projForm.externalLink.value = p?.externalLink ?? '';
  projForm.tags.value = (p?.tags || []).join(', ');
  projForm.order.value = p?.order ?? (state.portfolio.projects.length);
  projForm.role.value = p?.role ?? '';
  projForm.contribution.value = p?.contribution ?? '';
  projForm.result.value = p?.result ?? '';
  currentCredits = (p?.credits || []).map(c => ({ role: c.role || '', name: c.name || '' }));
  renderCreditList();
  if (creditRoleInput) creditRoleInput.value = '';
  if (creditNameInput) creditNameInput.value = '';
  renderMediaRows(p?.media || []);
  $('#projFormStatus').textContent = '';
  modal.hidden = false;
  // 다이얼로그 열림 시 첫 입력으로 포커스 이동 (ARIA APG)
  requestAnimationFrame(() => {
    const first = modal.querySelector('input:not([type=hidden]), select, textarea, button');
    if (first) first.focus();
  });
}

projForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(projForm);
  const idRaw = fd.get('id');
  const payload = {
    title: fd.get('title'),
    category: fd.get('category'),
    description: fd.get('description'),
    externalLink: fd.get('externalLink'),
    order: Number(fd.get('order')) || 0,
    tags: String(fd.get('tags') || '').split(',').map(s => s.trim()).filter(Boolean),
    role: String(fd.get('role') || '').trim(),
    contribution: String(fd.get('contribution') || '').trim(),
    result: String(fd.get('result') || ''),
    // 크레딧 — 칩 에디터 상태(currentCredits)에서 직접. 입력칸에 남은 값은 자동 반영.
    credits: collectCredits(),
    media: $$('#mediaRows .admin-media-row').map(row => ({
      url: row.querySelector('.admin-media-row__input').value.trim(),
      type: row.querySelector('.admin-media-row__type').value
    })).filter(m => m.url)
  };
  // 대표 색상 자동 감지 (첫 이미지 미디어 썸네일) — 시네마릴 색상순 자동배치용
  try {
    const firstImg = payload.media.find(m => m.type === 'image') || payload.media[0];
    if (firstImg && firstImg.url) {
      const c = await analyzeColor(reelThumb({ media: [firstImg] }, 64));
      if (c) payload.color = { h: Math.round(c.h), s: +c.s.toFixed(3), l: +c.l.toFixed(3) };
    }
  } catch (_) { /* 색상 감지 실패 시 서버가 기존 값 보존 */ }
  try {
    if (idRaw) {
      await api(`/portfolio/${idRaw}`, { method: 'PUT', body: JSON.stringify(payload) });
      toast('updated');
    } else {
      await api('/portfolio', { method: 'POST', body: JSON.stringify(payload) });
      toast('created');
    }
    modal.hidden = true;
    await loadAll();
  } catch (err) {
    $('#projFormStatus').textContent = err.message;
    toast(err.message, 'err');
  }
});

// ── Featured ──
function renderFeatured() {
  const allList = $('#featAll');
  const selList = $('#featSelected');
  const ids = state.settings.featuredProjectIds || [];
  const selected = new Set(ids);
  const byId = new Map(state.portfolio.projects.map(p => [p.id, p]));

  // all (토글 목록)
  allList.innerHTML = '';
  sortedProjects().forEach(p => {
    const el = document.createElement('div');
    el.className = 'admin-feat__item' + (selected.has(p.id) ? ' is-on' : '');
    el.dataset.id = p.id;
    el.innerHTML = `
      <span class="admin-feat__id">#${String(p.id).padStart(3, '0')}</span>
      <span class="admin-feat__title">${escapeHtml(p.title || '(untitled)')}</span>
      <span class="admin-feat__cat" data-cat="${p.category}">${p.category}</span>
      <span>${selected.has(p.id) ? '✓' : '+'}</span>
    `;
    el.addEventListener('click', async () => {
      const cur = new Set(state.settings.featuredProjectIds || []);
      if (cur.has(p.id)) cur.delete(p.id); else cur.add(p.id);
      const nextIds = Array.from(cur);
      try {
        await api('/featured', { method: 'PUT', body: JSON.stringify({ ids: nextIds }) });
        state.settings.featuredProjectIds = nextIds;
        renderFeatured();
      } catch (err) { toast(err.message, 'err'); }
    });
    allList.appendChild(el);
  });

  // selected (드래그 정렬)
  selList.innerHTML = '';
  ids.forEach(id => {
    const p = byId.get(id);
    if (!p) return;
    const el = document.createElement('div');
    el.className = 'admin-feat__item is-on';
    el.dataset.id = id;
    el.draggable = true;
    el.innerHTML = `
      <span class="admin-feat__id">#${String(p.id).padStart(3, '0')}</span>
      <span class="admin-feat__title">${escapeHtml(p.title || '(untitled)')}</span>
      <span class="admin-feat__cat" data-cat="${p.category}">${p.category}</span>
      <span aria-hidden="true">≡</span>
    `;
    selList.appendChild(el);
  });
  $('#featCount').textContent = `${ids.length} selected`;
  attachFeaturedDrag();
}

function attachFeaturedDrag() {
  const list = $('#featSelected');
  let dragEl = null;
  $$('.admin-feat__item', list).forEach(item => {
    item.addEventListener('dragstart', (e) => {
      dragEl = item; item.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('is-dragging');
      $$('.admin-feat__item', list).forEach(el => el.classList.remove('is-drag-over'));
    });
    item.addEventListener('dragover', (e) => { e.preventDefault(); item.classList.add('is-drag-over'); });
    item.addEventListener('dragleave', () => item.classList.remove('is-drag-over'));
    item.addEventListener('drop', async (e) => {
      e.preventDefault();
      item.classList.remove('is-drag-over');
      if (!dragEl || dragEl === item) return;
      const rect = item.getBoundingClientRect();
      const after = (e.clientY - rect.top) > rect.height / 2;
      list.insertBefore(dragEl, after ? item.nextSibling : item);
      const ids = $$('.admin-feat__item', list).map(el => parseInt(el.dataset.id, 10));
      try {
        await api('/featured', { method: 'PUT', body: JSON.stringify({ ids }) });
        state.settings.featuredProjectIds = ids;
        toast('featured reordered');
      } catch (err) { toast(err.message, 'err'); await loadAll(); }
    });
  });
}

// ── Reel order (히어로 시네마릴 전 작품 순서 = order 필드) ──
// 프론트 히어로 롤과 동일한 썸네일 파생 (Drive lh3 / YouTube / 일반 이미지 · 로컬 영상은 스틸 없음)
function reelThumb(p, w = 240) {
  const m = (p.media || []).find(x => (x.type || '').startsWith('image')) || (p.media || [])[0];
  const url = m && m.url;
  if (!url) return '';
  const s = String(url);
  const dm = s.match(/\/d\/([a-zA-Z0-9_-]+)/) || s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (s.includes('drive.google.com') && dm) return `https://lh3.googleusercontent.com/d/${dm[1]}=w${w}`;
  if (/\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(s)) return '';
  const yt = s.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg`;
  return s;
}

// 색상순 정렬 키(프론트 hero.js와 동일): 인트로 영상 색(앵커)을 기점으로 hue 회전 → 컬러 먼저 → 그레이 → 없음
function reelColorRank(p) {
  const c = p.color;
  if (!c || typeof c !== 'object') return [3, (p.order ?? 0), p.id];
  if ((c.s ?? 0) < 0.12) return [2, (c.l ?? 0), 0];
  const anchor = Number.isFinite(+state.settings.reelAnchorHue) ? +state.settings.reelAnchorHue : 46;
  const hueRot = ((anchor - (c.h ?? 0)) % 360 + 360) % 360;   // 내려가는 방향(주황→빨강)
  return [0, hueRot, (c.l ?? 0)];
}
function reelOrdered() {
  return state.portfolio.projects.slice().sort((a, b) => {
    const A = reelColorRank(a), B = reelColorRank(b);
    return (A[0] - B[0]) || (A[1] - B[1]) || (A[2] - B[2]) || (a.id - b.id);
  });
}

// reel 탭 = 색상순 자동 배치 미리보기(읽기 전용) + 감지된 색상 스와치. 수동 드래그 폐기(색상순 자동).
function renderReel() {
  const grid = $('#reelGrid');
  if (!grid) return;
  const list = reelOrdered();
  const withColor = list.filter(p => p.color).length;
  grid.innerHTML = '';
  list.forEach((p, idx) => {
    const c = p.color;
    const sw = (c && typeof c === 'object') ? `hsl(${Math.round(c.h)},${Math.round((c.s || 0) * 100)}%,${Math.round((c.l || 0) * 100)}%)` : '';
    const thumb = reelThumb(p);
    const card = document.createElement('div');
    card.className = 'admin-reel__card';
    card.dataset.id = p.id;
    card.innerHTML = `
      <div class="admin-reel__thumb${thumb ? '' : ' is-empty'}">
        ${thumb ? `<img src="${escapeAttr(thumb)}" alt="" loading="lazy" onerror="this.parentElement.classList.add('is-empty');this.remove()">` : ''}
        <span class="admin-reel__pos">${String(idx + 1).padStart(2, '0')}</span>
        ${sw ? `<span class="admin-reel__swatch" style="background:${sw}" title="감지된 대표 색상"></span>` : `<span class="admin-reel__swatch admin-reel__swatch--none" title="색상 미감지">?</span>`}
      </div>
      <div class="admin-reel__meta">
        <span class="admin-reel__title">${escapeHtml(p.title || '(untitled)')}</span>
        <span class="admin-feat__cat" data-cat="${p.category}">${p.category}</span>
      </div>`;
    grid.appendChild(card);
  });
  const cnt = $('#reelCount');
  if (cnt) cnt.textContent = `${list.length} works · ${withColor} 색상감지`;
}

// ── 색상순 자동 정렬 (썸네일 주 색상 인식 → 색이 자연스럽게 흐르게) ──
// 썸네일을 canvas로 축소해 채도 가중 원형 평균으로 대표 hue/sat/lit 산출 (Drive lh3는 CORS 허용 확인됨).
function analyzeColor(imgUrl) {
  return new Promise((resolve) => {
    if (!imgUrl) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const N = 24;
        const cv = document.createElement('canvas'); cv.width = N; cv.height = N;
        const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0, N, N);
        const d = ctx.getImageData(0, 0, N, N).data;
        let sx = 0, sy = 0, sSat = 0, sLit = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 128) continue;
          const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, dl = mx - mn;
          let h = 0, s = 0;
          if (dl > 0) {
            s = l > 0.5 ? dl / (2 - mx - mn) : dl / (mx + mn);
            if (mx === r) h = ((g - b) / dl) % 6;
            else if (mx === g) h = (b - r) / dl + 2;
            else h = (r - g) / dl + 4;
            h = h * 60; if (h < 0) h += 360;
          }
          sx += Math.cos(h * Math.PI / 180) * s;   // 채도 가중 → 회색 픽셀은 hue에 거의 기여 안 함
          sy += Math.sin(h * Math.PI / 180) * s;
          sSat += s; sLit += l; n++;
        }
        if (!n) return resolve(null);
        const hue = ((Math.atan2(sy, sx) * 180 / Math.PI) + 360) % 360;
        resolve({ h: hue, s: sSat / n, l: sLit / n });
      } catch (_) { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = imgUrl;
  });
}

// 전 작품 대표 색상 (재)감지 → 일괄 저장. 릴은 저장된 색상으로 자동 배치되므로 순서 저장 불필요.
async function detectAllColors() {
  const btn = $('#reelColorSort');
  const list = state.portfolio.projects.slice();
  if (btn) btn.disabled = true;
  toast('썸네일 색상 감지 중…');
  try {
    const results = await Promise.all(list.map(async p => ({ id: p.id, c: await analyzeColor(reelThumb(p, 64)) })));
    const colors = {};
    results.forEach(r => { if (r.c) colors[r.id] = { h: Math.round(r.c.h), s: +r.c.s.toFixed(3), l: +r.c.l.toFixed(3) }; });
    await api('/portfolio/colors', { method: 'PUT', body: JSON.stringify({ colors }) });
    list.forEach(p => { p.color = colors[p.id] || null; });   // 로컬 state 반영 (미감지는 null)
    // 인트로 영상 색을 릴 정렬 기점(anchor)으로 — 포스터에서 감지해 저장 (영상 색부터 시작해 스펙트럼 흐름)
    try {
      const hv = await analyzeColor('/uploads/hero-poster.jpg');
      if (hv) {
        const anchor = Math.round(hv.h);
        await api('/settings', { method: 'PUT', body: JSON.stringify({ reelAnchorHue: anchor }) });
        state.settings.reelAnchorHue = anchor;
      }
    } catch (_) {}
    renderReel();
    const n = Object.keys(colors).length;
    toast(`색상 감지 완료 (${n}/${list.length}) — 인트로 영상 색부터 스펙트럼 배치`);
  } catch (err) { toast(err.message || '색상 감지 실패', 'err'); }
  finally { if (btn) btn.disabled = false; }
}
$('#reelColorSort')?.addEventListener('click', detectAllColors);

// ── Settings ──
const settingsForm = $('#settingsForm');
function renderSettings() {
  const s = state.settings || {};
  settingsForm.defaultTheme.value = s.defaultTheme === 'cereal' ? 'cereal' : 'studio';
  settingsForm.gateTitle.value = s.gateTitle || '';
  settingsForm.gateLogo.value = s.gateLogo || '';
  settingsForm.heroTitle.value = s.heroTitle || '';
  settingsForm.heroSubtitle.value = s.heroSubtitle || '';
  settingsForm.heroVideo.value = s.heroVideo || '';
  settingsForm.est.value = s.est || '';
  settingsForm.keyColorA.value = /^#[0-9a-fA-F]{6}$/.test(s.keyColorA || '') ? s.keyColorA : '#C7B9FF';
  settingsForm.keyColorB.value = /^#[0-9a-fA-F]{6}$/.test(s.keyColorB || '') ? s.keyColorB : '#FFC4DC';
  settingsForm.curtainMain.value = s.curtainMain || '';
  settingsForm.curtainAuthor.value = s.curtainAuthor || '';
  settingsForm.contactEmail.value = s.contactEmail || '';
  settingsForm.contactPhone.value = s.contactPhone || '';
  settingsForm.contactInstagram.value = s.contactInstagram || '';
  settingsForm.curtainSub.value = s.curtainSub || '';
  settingsForm.philosophy.value = s.philosophy || '';
  settingsForm.aboutText.value = s.aboutText || '';
  renderGallery();   // about gallery 업로드 위젯
  renderLogos();     // client logos 업로드 위젯
}

settingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(settingsForm);
  const payload = {
    defaultTheme: fd.get('defaultTheme') === 'cereal' ? 'cereal' : 'studio',
    gateTitle: String(fd.get('gateTitle') || '').trim(),
    gateLogo: String(fd.get('gateLogo') || '').trim(),
    heroTitle: fd.get('heroTitle'),
    heroSubtitle: fd.get('heroSubtitle'),
    heroVideo: String(fd.get('heroVideo') || '').trim(),
    est: String(fd.get('est') || '').trim(),
    keyColorA: fd.get('keyColorA'),
    keyColorB: fd.get('keyColorB'),
    curtainMain: fd.get('curtainMain'),
    curtainAuthor: fd.get('curtainAuthor'),
    contactEmail: fd.get('contactEmail'),
    contactPhone: fd.get('contactPhone'),
    contactInstagram: fd.get('contactInstagram'),
    curtainSub: fd.get('curtainSub'),
    philosophy: fd.get('philosophy'),
    aboutText: fd.get('aboutText'),
    // 업로드 위젯이 관리하는 배열 (textarea 폐기)
    aboutGallery: Array.isArray(state.settings.aboutGallery) ? state.settings.aboutGallery : [],
    clientLogos: Array.isArray(state.settings.clientLogos) ? state.settings.clientLogos : [],
    // featured 리스트가 settings에 포함되어 있어 경쟁조건 방지 위해 현재 state 값 병합
    featuredProjectIds: Array.isArray(state.settings.featuredProjectIds)
      ? state.settings.featuredProjectIds
      : []
  };
  try {
    const saved = await api('/settings', { method: 'PUT', body: JSON.stringify(payload) });
    state.settings = { ...state.settings, ...saved };
    $('#settingsStatus').textContent = 'saved — ' + new Date().toLocaleTimeString();
    toast('settings saved');
  } catch (err) {
    $('#settingsStatus').textContent = err.message;
    toast(err.message, 'err');
  }
});

// ── Settings 이미지 업로더 (about gallery / client logos) ──
function uploadImage(file) {
  const fd = new FormData();
  fd.append('file', file);
  return fetch(API + '/upload', { method: 'POST', body: fd, credentials: 'same-origin' })
    .then(async r => { if (!r.ok) throw new Error(((await r.json().catch(() => ({}))).error) || 'upload failed'); return r.json(); });
}

function attachUploaderDrag(grid, list, rerender) {
  let from = -1;
  $$('.admin-uploader__item', grid).forEach(cell => {
    cell.addEventListener('dragstart', () => { from = +cell.dataset.idx; cell.classList.add('is-dragging'); });
    cell.addEventListener('dragend', () => cell.classList.remove('is-dragging'));
    cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.classList.add('is-drag-over'); });
    cell.addEventListener('dragleave', () => cell.classList.remove('is-drag-over'));
    cell.addEventListener('drop', (e) => {
      e.preventDefault(); cell.classList.remove('is-drag-over');
      const to = +cell.dataset.idx;
      if (from < 0 || from === to) return;
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      rerender();
    });
  });
}

function renderGallery() {
  const grid = $('#galleryGrid');
  if (!grid) return;
  const list = state.settings.aboutGallery = (state.settings.aboutGallery || []);
  grid.innerHTML = '';
  list.forEach((url, idx) => {
    const cell = document.createElement('div');
    cell.className = 'admin-uploader__item';
    cell.draggable = true; cell.dataset.idx = idx;
    cell.innerHTML = `<img src="${escapeAttr(url)}" alt="" loading="lazy"><button type="button" class="admin-uploader__del" aria-label="remove">✕</button>`;
    cell.querySelector('.admin-uploader__del').addEventListener('click', () => { list.splice(idx, 1); renderGallery(); });
    grid.appendChild(cell);
  });
  attachUploaderDrag(grid, list, renderGallery);
}

function renderLogos() {
  const grid = $('#logosGrid');
  if (!grid) return;
  const list = state.settings.clientLogos = (state.settings.clientLogos || []);
  grid.innerHTML = '';
  list.forEach((logo, idx) => {
    const url = (logo && logo.url) || '';
    const cell = document.createElement('div');
    cell.className = 'admin-uploader__item admin-uploader__item--logo';
    cell.draggable = true; cell.dataset.idx = idx;
    cell.innerHTML = `<img src="${escapeAttr(url)}" alt="${escapeAttr((logo && logo.name) || '')}" loading="lazy"><button type="button" class="admin-uploader__del" aria-label="remove">✕</button>`;
    cell.querySelector('.admin-uploader__del').addEventListener('click', () => { list.splice(idx, 1); renderLogos(); });
    grid.appendChild(cell);
  });
  attachUploaderDrag(grid, list, renderLogos);
}

$('#galleryAdd')?.addEventListener('click', () => $('#galleryInput').click());
$('#galleryInput')?.addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  toast('uploading…');
  try { const d = await uploadImage(f); (state.settings.aboutGallery = state.settings.aboutGallery || []).push(d.url); renderGallery(); toast('added — save 잊지 마세요'); }
  catch (err) { toast(err.message, 'err'); }
  e.target.value = '';
});
$('#logosAdd')?.addEventListener('click', () => $('#logosInput').click());
$('#logosInput')?.addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  toast('uploading…');
  try {
    const d = await uploadImage(f);
    const name = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    (state.settings.clientLogos = state.settings.clientLogos || []).push({ url: d.url, name, id: Date.now() });
    renderLogos(); toast('added — save 잊지 마세요');
  } catch (err) { toast(err.message, 'err'); }
  e.target.value = '';
});

// ── Media Upload ──
const drop = $('#mediaDrop');
const input = $('#mediaInput');
$('#mediaPick').addEventListener('click', () => input.click());
input.addEventListener('change', () => {
  if (input.files && input.files[0]) uploadFile(input.files[0]);
});
['dragenter', 'dragover'].forEach(ev => {
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); });
});
['dragleave', 'drop'].forEach(ev => {
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); });
});
drop.addEventListener('drop', (e) => {
  if (e.dataTransfer.files && e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0]);
});

async function uploadFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  toast('uploading…');
  try {
    const res = await fetch(API + '/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'upload failed' }));
      throw new Error(err.error || 'upload failed');
    }
    const data = await res.json();
    appendMediaItem(data);
    try { await navigator.clipboard.writeText(data.url); toast('uploaded — URL copied'); }
    catch { toast('uploaded'); }
  } catch (err) { toast(err.message, 'err'); }
}

function appendMediaItem(data) {
  const li = document.createElement('li');
  const preview = data.type === 'video'
    ? `<video class="admin-media-preview" src="${escapeAttr(data.url)}" muted loop playsinline autoplay aria-hidden="true"></video>`
    : `<img class="admin-media-preview" src="${escapeAttr(data.url)}" alt="" loading="lazy">`;
  li.innerHTML = `
    ${preview}
    <div class="admin-media-meta">
      <span class="admin-badge admin-badge--on">${data.type}</span>
      <code>${escapeHtml(data.url)}</code>
    </div>
    <button class="admin-pill admin-pill--sm" data-copy>copy</button>
  `;
  li.querySelector('[data-copy]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(data.url); toast('copied'); }
    catch { toast('copy failed', 'err'); }
  });
  $('#mediaList').prepend(li);
}

// ── Helpers ──
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// ── Boot ──
loadAll().catch(err => toast(err.message || 'load failed', 'err'));
