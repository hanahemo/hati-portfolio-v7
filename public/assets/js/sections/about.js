const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const safeHttp = (u) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '');

export function initAbout(settings) {
  const title = document.getElementById('aboutTitle');
  if (title) title.innerHTML = 'Hati<sup class="brand-reg">®</sup> Studio';   // 브랜드 마크 통일 (나브 Hati® 기준)

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
    if (settings.contactEmail) items.push(`<a class="pill" href="mailto:${escapeHtml(settings.contactEmail)}">email ↗</a>`);
    sns.innerHTML = items.join('');
  }

  // 포트레이트 — 어바웃은 프로필 한 장 (현장 스틸은 엔딩크레딧으로)
  const portrait = document.getElementById('aboutPortrait');
  const portraitSrc = String(settings.aboutImage || (settings.aboutGallery || [])[0] || '').trim();
  if (portrait && portraitSrc) {
    portrait.innerHTML = `<img src="${escapeHtml(portraitSrc)}" alt="Hati portrait" loading="lazy" onerror="this.parentNode.hidden=true">`;
    portrait.hidden = false;
  }

  // 스태거 리빌 — 갤러리 + 텍스트 블록
  if (!window.gsap || !window.ScrollTrigger) return;
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
