export function initClients(settings) {
  const track = document.getElementById('clientsTrack');
  if (!track) return;
  // 로고 이미지 파일이 있는 항목만 (이름만 있는 항목 제외)
  const logos = (settings.clientLogos || []).filter(l => l && l.url);
  if (!logos.length) { track.parentElement?.parentElement?.setAttribute('hidden', ''); return; }

  // 정규 경로(/assets, /uploads, http)는 그대로 통과 — 이중 prefix 방지.
  // 레거시(reference/portfolio/public/images/logos + 타임스탬프 중복본)만 /assets/images/logos/base 로 매핑.
  function mapUrl(url) {
    if (!url) return '';
    url = String(url).trim();
    if (/^https?:\/\//i.test(url) || url.startsWith('/assets/') || url.startsWith('/uploads/')) return url;
    return url
      .replace('/images/logos/', '/assets/images/logos/')
      .replace(/^(\/assets\/images\/logos\/)([a-zA-Z_ ]+?)_\d+(\.[a-zA-Z]+)$/, '$1$2$3');
  }

  // 로고 이미지만 — 시각 장식 (심리스 루프로 2~3회 중복되므로 alt 비움)
  function buildItem(l) {
    const url = mapUrl(l.url);
    return `<span class="marquee__item"><img src="${escapeHtml(url)}" alt="" onerror="this.closest('.marquee__item').style.display='none'"></span>`;
  }
  const html = logos.map(buildItem).join('');
  // 마퀴 띠 — 심리스 루프용 2회 복제 (reduced-motion에선 CSS가 정적 랩으로 폴백)
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  track.innerHTML = reduced ? html : html + html;
  // 복제된 로고가 스크린리더에 2~3회 낭독되지 않도록 띠 자체는 aria-hidden,
  // 클라이언트 이름은 섹션 라벨 한 곳에만 노출
  track.setAttribute('aria-hidden', 'true');
  const region = track.closest('.clients');
  if (region) region.setAttribute('aria-label', 'Trusted by ' + logos.map(l => l.name).filter(Boolean).join(', '));
}

function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
