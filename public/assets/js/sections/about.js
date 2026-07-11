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

  const gallery = document.getElementById('aboutGallery');
  if (gallery) {
    const imgs = (settings.aboutGallery || []).slice(0, 24);   // 풀폭 컬럼 콜라주 — 상한 넉넉히
    const colCount = window.innerWidth >= 1200 ? 3 : 2;
    gallery.innerHTML = '';
    const cols = Array.from({ length: colCount }, (_, c) => {
      const d = document.createElement('div');
      d.className = 'about__gallery__col' + (colCount === 3 && c === 1 ? ' about__gallery__col--mid' : '');
      gallery.appendChild(d);
      return d;
    });
    imgs.forEach((u, i) => {
      const img = document.createElement('img');
      img.src = u; img.alt = `hati studio ${i + 1}`; img.loading = 'lazy';
      img.setAttribute('onerror', "this.style.display='none'");
      cols[i % colCount].appendChild(img);   // 라운드로빈 분배 — 세로/가로 섞여도 얼추 균형
    });
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
      stagger: 0.08, duration: 0.7,
      ease: 'cubic-bezier(0.45, 0.05, 0.55, 0.95)',
      scrollTrigger: { trigger: '.about__gallery', start: 'top 82%' }
    });
  }

  // ── 깊이 패럴랙스 — 컬럼 통째로 다른 속도로 흘러 앞뒤 공간감 (디즈니 크레딧 문법) ──
  // 컬럼 wrapper를 움직이므로 컬럼 내부 사진은 절대 안 겹친다.
  const colEls = document.querySelectorAll('.about__gallery__col');
  if (window.innerWidth >= 1000 && colEls.length) {
    const gal = document.getElementById('aboutGallery');
    // 가운데 컬럼이 가장 앞(빠름), 바깥이 뒤(느림)
    const COL_SPEED = colEls.length === 3 ? [50, 120, 78] : [90, 48];
    colEls.forEach((col, ci) => {
      gsap.to(col, {
        y: () => -COL_SPEED[ci] || 0,
        ease: 'none',
        scrollTrigger: { trigger: gal, start: 'top bottom', end: 'bottom top', scrub: 0.7 }
      });
    });
  }
}
