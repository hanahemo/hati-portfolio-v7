const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const safeHttp = (u) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '');

export function initAbout(settings) {
  const title = document.getElementById('aboutTitle');
  if (title) title.innerHTML = 'Hati<sup class="brand-reg">®</sup>';   // 브랜드 마크 통일 (나브 Hati® 기준) — 이름이라 'Studio' 없음

  const meta = document.querySelector('#about .about__meta');
  if (meta && settings.est) meta.textContent = `Director · EST. ${settings.est}`;   // 연도는 settings.est 단일 소스

  const text = document.getElementById('aboutText');
  if (text) text.textContent = settings.aboutText || '';

  // aboutQuote — 필로소피 섹션이 같은 문구를 풀스크린으로 이미 보여주므로 About에서는 반복하지 않는다.
  // (요소는 비워두면 :empty 규칙으로 숨겨짐)

  const sns = document.getElementById('aboutSns');
  if (sns) {
    const items = [];
    const ig = safeHttp(settings.contactInstagram);
    if (ig) items.push(`<a class="pill" href="${escapeHtml(ig)}" target="_blank" rel="noopener noreferrer">instagram ↗</a>`);
    const li = safeHttp(settings.contactLinkedin);
    if (li) items.push(`<a class="pill" href="${escapeHtml(li)}" target="_blank" rel="noopener noreferrer">linkedin ↗</a>`);
    if (settings.contactEmail) items.push(`<a class="pill" href="mailto:${escapeHtml(settings.contactEmail)}">email ↗</a>`);
    sns.innerHTML = items.join('');
  }

  // 포트레이트 — 어바웃은 프로필 한 장 (현장 스틸은 엔딩크레딧으로)
  const portrait = document.getElementById('aboutPortrait');
  const portraitSrc = String(settings.aboutImage || (settings.aboutGallery || [])[0] || '').trim();
  if (portrait && portraitSrc) {
    // 원본 대신 표시폭(최대 520px)의 2x WebP 썸네일 — 대용량 원본 다운로드 방지
    const psized = /^\/uploads\//.test(portraitSrc) ? `${portraitSrc}${portraitSrc.includes('?') ? '&' : '?'}w=900` : portraitSrc;
    // 35mm 필름 가장자리 인쇄(에지 코드) — 사진이 '한 컷의 필름'으로 읽히게
    const yr = new Date().getFullYear();
    portrait.innerHTML = `<img src="${escapeHtml(psized)}" alt="Hati portrait" loading="lazy" decoding="async" onerror="this.parentNode.hidden=true">`
      + `<span class="about__edge about__edge--t" aria-hidden="true"><span>Hati® 400TX</span><span>▸ 12 &nbsp;&nbsp; ▸ 12A</span></span>`
      + `<span class="about__edge about__edge--b" aria-hidden="true"><span>Seoul — ${yr}</span><span>13 ◂</span></span>`;
    portrait.hidden = false;
  }

  // 스태거 리빌 — 갤러리 + 텍스트 블록
  if (!window.gsap || !window.ScrollTrigger) return;

  // 암실 현상 — 포트레이트가 필름 네거티브(반전)로 들어와 스크롤에 따라 포지티브로 현상된다.
  // 데스크탑은 스크럽(되감으면 다시 네거티브), 모바일은 진입 시 1회 시간 기반 — 터치 모멘텀에 콘텐츠가 볼모 잡히지 않게.
  const portraitImg = portrait && portrait.querySelector('img');
  if (portraitImg && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const NEG = 'invert(1) grayscale(0.35) contrast(1.15) brightness(0.95)';
    const POS = 'invert(0) grayscale(0) contrast(1) brightness(1)';
    if (window.innerWidth >= 768) {
      window.gsap.fromTo(portraitImg, { filter: NEG }, {
        filter: POS, ease: 'none',
        scrollTrigger: { trigger: portrait, start: 'top 88%', end: 'top 30%', scrub: 0.6 }
      });
    } else {
      window.gsap.fromTo(portraitImg, { filter: NEG }, {
        filter: POS, duration: 2.2, ease: 'power2.inOut',
        scrollTrigger: { trigger: portrait, start: 'top 75%', once: true }
      });
    }
  }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const gsap = window.gsap;
  const about = document.getElementById('about');
  if (!about) return;

  const textBlocks = about.querySelectorAll('.about__meta, .about__title, .about__text, .about__quote, .about__sns');
  if (textBlocks.length) {
    gsap.from(textBlocks, {
      opacity: 0, y: 24,
      stagger: 0.08, duration: 0.6, ease: 'power2.out',
      scrollTrigger: { trigger: about, start: 'top 75%' }
    });
  }

  if (portrait && !portrait.hidden) {
    gsap.from(portrait, {
      opacity: 0, y: 40, scale: 0.98,
      duration: 0.8, ease: 'power2.out',
      scrollTrigger: { trigger: about, start: 'top 75%' }
    });
  }
}
