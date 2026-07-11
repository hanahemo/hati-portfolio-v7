const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const safeHttp = (u) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '');

export function initAbout(settings) {
  const title = document.getElementById('aboutTitle');
  if (title) title.innerHTML = 'Hati<sup class="brand-reg">®</sup> Studio';   // 브랜드 마크 통일 (나브 Hati® 기준)

  const text = document.getElementById('aboutText');
  if (text) text.textContent = settings.aboutText || '';

  const quote = document.getElementById('aboutQuote');
  if (quote && settings.philosophy) quote.textContent = settings.philosophy;

  const sns = document.getElementById('aboutSns');
  if (sns) {
    const items = [];
    const ig = safeHttp(settings.contactInstagram);
    if (ig) items.push(`<a class="pill" href="${escapeHtml(ig)}" target="_blank" rel="noopener noreferrer">instagram ↗</a>`);
    if (settings.contactEmail) items.push(`<a class="pill" href="mailto:${escapeHtml(settings.contactEmail)}">email ↗</a>`);
    sns.innerHTML = items.join('');
  }

  const gallery = document.getElementById('aboutGallery');
  if (gallery) {
    const imgs = (settings.aboutGallery || []).slice(0, 5);
    gallery.innerHTML = imgs.map((u, i) => `<img src="${escapeHtml(u)}" alt="hati studio ${i + 1}" loading="lazy" onerror="this.style.display='none'">`).join('');
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

  const items = document.querySelectorAll('.about__gallery img');
  if (items.length) {
    gsap.from(items, {
      opacity: 0, y: 40, scale: 0.96,
      stagger: 0.1, duration: 0.7,
      ease: 'cubic-bezier(0.45, 0.05, 0.55, 0.95)',
      scrollTrigger: { trigger: '.about__gallery', start: 'top 80%' }
    });
  }
}
