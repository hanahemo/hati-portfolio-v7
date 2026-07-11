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
    const imgs = (settings.aboutGallery || []).slice(0, 12);   // ponytail: 12장 상한, 벤또가 그 이상 필요하면 올려
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

  // ── 뎁스 콜라주 — 데스크탑 2단 레이아웃에서만 (엔딩크레딧 부유 스틸과 같은 공간 문법) ──
  if (window.innerWidth >= 1200 && items.length >= 3) {
    // 슬롯: 컨테이너 % 기준 {top, left, width, depth}. near가 크게 앞, far가 작고 뒤로 물러남.
    const SLOTS = [
      { t: '0%',  l: '4%',  w: '82%', d: 'near' },
      { t: '24%', l: '46%', w: '54%', d: 'mid'  },
      { t: '36%', l: '0%',  w: '42%', d: 'far'  },
      { t: '52%', l: '30%', w: '68%', d: 'near' },
      { t: '76%', l: '2%',  w: '48%', d: 'mid'  },
      { t: '84%', l: '56%', w: '40%', d: 'far'  },
      { t: '96%', l: '18%', w: '58%', d: 'mid'  },
      { t: '110%', l: '50%', w: '46%', d: 'far' },
      { t: '118%', l: '4%',  w: '64%', d: 'near' },
      { t: '138%', l: '42%', w: '50%', d: 'mid' },
      { t: '148%', l: '0%',  w: '42%', d: 'far' },
      { t: '160%', l: '28%', w: '60%', d: 'near' },
    ];
    const SPEED = { near: 1.0, mid: 0.55, far: 0.28 };   // 깊이별 패럴랙스 속도
    const gal = document.getElementById('aboutGallery');
    gal.classList.add('about__gallery--depth');
    // 사진 수에 따라 컨테이너 높이 확장 (4장=112vh 기준, 6장 넘으면 슬롯 진출 폭만큼)
    const maxT = parseFloat(SLOTS[Math.min(items.length, SLOTS.length) - 1].t);
    if (maxT > 100) gal.style.height = `calc(96vh * ${(maxT + 45) / 100})`;
    items.forEach((img, i) => {
      const slot = SLOTS[i % SLOTS.length];
      img.style.setProperty('--t', slot.t);
      img.style.setProperty('--l', slot.l);
      img.style.setProperty('--w', slot.w);
      img.classList.add(`is-${slot.d}`);
      // 패럴랙스 — 어바웃 통과 동안 깊이 속도만큼 상승. near가 성큼, far가 미동 = 앞뒤 공간감.
      gsap.to(img, {
        y: () => -110 * SPEED[slot.d],
        ease: 'none',
        scrollTrigger: { trigger: gal, start: 'top bottom', end: 'bottom top', scrub: 0.7 }
      });
    });
  }
}
