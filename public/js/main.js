// ── Google Drive URL converter ──
function convertDriveUrl(url) {
  if (!url) return '';
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1200`;
  }
  return url;
}

function getDriveVideoEmbed(url) {
  if (!url) return '';
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return `https://drive.google.com/file/d/${match[1]}/preview`;
  }
  return url;
}

function getDriveVideoDirect(url) {
  if (!url) return '';
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return `https://drive.google.com/uc?export=download&id=${match[1]}`;
  }
  return url;
}

// ── Load Data ──
let portfolioData = { projects: [] };
let settingsData = {};

async function loadData() {
  const isPreview = window.location.pathname === '/preview';
  const portfolioUrl = isPreview ? '/api/draft/portfolio' : '/api/portfolio';
  const settingsUrl = isPreview ? '/api/draft/settings' : '/api/settings';
  try {
    const [portRes, setRes] = await Promise.all([
      fetch(portfolioUrl),
      fetch(settingsUrl)
    ]);

    if (!portRes.ok || !setRes.ok) {
      console.error('Failed to load data');
      return;
    }

    portfolioData = await portRes.json();
    settingsData = await setRes.json();

    renderHero();
    renderGalleries();
    renderAbout();
    renderContact();
    initRevealObserver();
  } catch (err) {
    console.error('Failed to load data:', err);
  }
}

// ── Render Hero ──
function renderHero() {
  const bg = document.getElementById('heroBg');
  const video = document.getElementById('heroVideo');
  const title = document.getElementById('heroTitle');
  const subtitle = document.getElementById('heroSubtitle');
  const content = document.getElementById('heroContent');

  if (settingsData.heroBackground) {
    const url = settingsData.heroBackground;
    if (settingsData.heroBackgroundType === 'video') {
      // Local uploaded video (starts with /) or external URL
      video.src = url.startsWith('/') ? url : getDriveVideoDirect(url);
      video.classList.add('active');
      video.play().catch(() => {});
      bg.style.display = 'none';
    } else {
      bg.style.backgroundImage = `url(${convertDriveUrl(url)})`;
      video.classList.remove('active');
      bg.style.display = '';
    }
  }
  if (settingsData.heroTitle) title.textContent = settingsData.heroTitle;
  if (settingsData.heroSubtitle) subtitle.textContent = settingsData.heroSubtitle;

  // Trigger hero animation
  requestAnimationFrame(() => {
    content.classList.add('animate');
  });
}

// ── Render Galleries ──
function renderGalleries() {
  const categories = ['photo', 'graphic', 'video'];

  categories.forEach(cat => {
    const projects = portfolioData.projects.filter(p => p.category === cat);
    const gallery = document.getElementById(`${cat}Gallery`);
    const count = document.getElementById(`${cat}Count`);

    if (count) {
      count.textContent = projects.length > 0 ? `${String(projects.length).padStart(2, '0')} projects` : '';
    }

    gallery.innerHTML = '';

    if (projects.length === 0) {
      gallery.innerHTML = '<div class="empty-state">프로젝트 준비 중</div>';
      return;
    }

    projects.forEach(project => {
      const card = document.createElement('div');
      card.className = 'project-card';
      card.onclick = () => openModal(project);

      const thumb = document.createElement('div');
      thumb.className = 'project-thumb';

      if (project.media && project.media.length > 0) {
        const firstMedia = project.media[0];
        if (firstMedia.type === 'video') {
          const iframe = document.createElement('iframe');
          iframe.src = getDriveVideoEmbed(firstMedia.url);
          iframe.style.cssText = 'width:100%;height:100%;border:none;pointer-events:none;';
          iframe.allow = 'autoplay';
          thumb.appendChild(iframe);
        } else {
          const img = document.createElement('img');
          img.src = convertDriveUrl(firstMedia.url);
          img.alt = project.title;
          img.loading = 'lazy';
          img.onerror = function() {
            this.parentElement.innerHTML = '<div class="project-thumb-placeholder">이미지를 불러올 수 없습니다</div>';
          };
          thumb.appendChild(img);
        }
      } else {
        thumb.innerHTML = '<div class="project-thumb-placeholder">No media</div>';
      }

      const info = document.createElement('div');
      info.className = 'project-info';
      info.innerHTML = `
        <h3 class="project-title">${project.title}</h3>
        <p class="project-desc">${project.description}</p>
      `;

      card.appendChild(thumb);
      card.appendChild(info);
      gallery.appendChild(card);
    });
  });
}

// ── Modal ──
function openModal(project) {
  const modal = document.getElementById('modal');
  const title = document.getElementById('modalTitle');
  const desc = document.getElementById('modalDesc');
  const mediaContainer = document.getElementById('modalMedia');

  title.textContent = project.title;
  desc.textContent = project.description;
  mediaContainer.innerHTML = '';

  if (project.media && project.media.length > 0) {
    project.media.forEach(m => {
      const item = document.createElement('div');
      item.className = 'modal-media-item';

      if (m.type === 'video') {
        const iframe = document.createElement('iframe');
        iframe.src = getDriveVideoEmbed(m.url);
        iframe.style.cssText = 'width:800px;height:450px;border:none;border-radius:3px;';
        iframe.allow = 'autoplay; encrypted-media';
        iframe.allowFullscreen = true;
        item.appendChild(iframe);
      } else {
        const img = document.createElement('img');
        img.src = convertDriveUrl(m.url);
        img.alt = project.title;
        item.appendChild(img);
      }

      mediaContainer.appendChild(item);
    });
  } else {
    mediaContainer.innerHTML = '<div style="color:rgba(255,255,255,0.12);padding:4rem;font-size:0.7rem;letter-spacing:0.15rem;text-transform:uppercase;">미디어가 없습니다</div>';
  }

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const modal = document.getElementById('modal');
  modal.classList.remove('active');
  document.body.style.overflow = '';
  document.getElementById('modalMedia').innerHTML = '';
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

document.getElementById('modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

// ── Render About ──
function renderAbout() {
  const text = document.getElementById('aboutText');
  const imageContainer = document.getElementById('aboutImage');
  const contact = document.getElementById('aboutContact');

  if (settingsData.aboutText) text.textContent = settingsData.aboutText;

  if (settingsData.aboutImage) {
    imageContainer.innerHTML = `<img src="${convertDriveUrl(settingsData.aboutImage)}" alt="Profile">`;
  }

  let contactHtml = '';
  if (settingsData.contactEmail) {
    contactHtml += `<a href="mailto:${settingsData.contactEmail}">Email</a>`;
  }
  if (settingsData.contactInstagram) {
    contactHtml += `<a href="${settingsData.contactInstagram}" target="_blank" rel="noopener">Instagram</a>`;
  }
  if (settingsData.contactVimeo) {
    contactHtml += `<a href="${settingsData.contactVimeo}" target="_blank" rel="noopener">Vimeo</a>`;
  }
  contact.innerHTML = contactHtml;
}

// ── Render Contact ──
function renderContact() {
  const container = document.getElementById('contactItems');
  if (!container) return;

  const rows = [];

  if (settingsData.contactPhone) {
    rows.push({
      label: 'Phone',
      value: settingsData.contactPhone,
      href: `tel:${settingsData.contactPhone.replace(/-/g, '')}`,
    });
  }
  if (settingsData.contactEmail) {
    rows.push({
      label: 'Email',
      value: settingsData.contactEmail,
      href: `mailto:${settingsData.contactEmail}`,
    });
  }
  if (settingsData.contactInstagram) {
    const handle = settingsData.contactInstagram.replace(/https?:\/\/(www\.)?instagram\.com\//, '@').replace(/\/$/, '');
    rows.push({
      label: 'Instagram',
      value: handle,
      href: settingsData.contactInstagram,
      external: true,
    });
  }
  if (settingsData.contactVimeo) {
    rows.push({
      label: 'Vimeo',
      value: 'Vimeo',
      href: settingsData.contactVimeo,
      external: true,
    });
  }

  container.innerHTML = '';
  rows.forEach((row, i) => {
    const div = document.createElement('div');
    div.className = `contact-row reveal reveal-delay-${Math.min(i + 1, 3)}`;
    const target = row.external ? ' target="_blank" rel="noopener"' : '';
    div.innerHTML = `
      <span class="contact-row-label">${row.label}</span>
      <a href="${row.href}" class="contact-row-value"${target}>${row.value}<span class="contact-arrow">&rarr;</span></a>
    `;
    container.appendChild(div);
  });
}

// ── Scroll reveal ──
function initRevealObserver() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

// ── Nav scroll effect ──
const nav = document.getElementById('nav');
let lastScroll = 0;

window.addEventListener('scroll', () => {
  const scrollY = window.scrollY;
  nav.classList.toggle('scrolled', scrollY > 80);
  lastScroll = scrollY;
}, { passive: true });

// ── Nav active state on scroll ──
const sections = ['video', 'graphic', 'photo', 'about'];

window.addEventListener('scroll', () => {
  let current = '';
  sections.forEach(id => {
    const section = document.getElementById(id);
    if (section) {
      const rect = section.getBoundingClientRect();
      if (rect.top <= 200) current = id;
    }
  });

  document.querySelectorAll('.nav-links a').forEach(a => {
    a.classList.remove('active');
    if (a.getAttribute('href') === `#${current}`) {
      a.classList.add('active');
    }
  });
}, { passive: true });

// ── Smooth nav click ──
document.querySelectorAll('.nav-links a').forEach(link => {
  link.addEventListener('click', function(e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ── Drag scroll for galleries ──
document.querySelectorAll('.gallery-scroll').forEach(gallery => {
  let isDown = false;
  let startX;
  let scrollLeft;
  let hasMoved = false;

  gallery.addEventListener('mousedown', e => {
    isDown = true;
    hasMoved = false;
    startX = e.pageX - gallery.offsetLeft;
    scrollLeft = gallery.scrollLeft;
    gallery.style.cursor = 'grabbing';
  });

  gallery.addEventListener('mouseleave', () => {
    isDown = false;
    gallery.style.cursor = 'grab';
  });

  gallery.addEventListener('mouseup', () => {
    isDown = false;
    gallery.style.cursor = 'grab';
  });

  gallery.addEventListener('mousemove', e => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - gallery.offsetLeft;
    const walk = (x - startX) * 1.8;
    if (Math.abs(walk) > 5) hasMoved = true;
    gallery.scrollLeft = scrollLeft - walk;
  });

  // Prevent click on cards when dragging
  gallery.addEventListener('click', e => {
    if (hasMoved) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
});

// ── Depth Parallax System ──
// Different speeds create layered depth: bg (slow) → mid → foreground (fast)
function initParallax() {
  const hero = document.querySelector('.hero');
  const heroBg = document.getElementById('heroBg');
  const heroVideo = document.getElementById('heroVideo');
  const heroContent = document.getElementById('heroContent');
  const heroTitle = document.querySelector('.hero-title');
  const heroSub = document.querySelector('.hero-subtitle');
  const heroLine = document.querySelector('.hero-line');
  const heroScroll = document.querySelector('.hero-scroll');

  // Collect parallax elements from sections
  const parallaxItems = [];
  document.querySelectorAll('.section').forEach(section => {
    const header = section.querySelector('.section-header');
    const number = section.querySelector('.section-number');
    const title = section.querySelector('.section-title');
    const count = section.querySelector('.section-count');
    const gallery = section.querySelector('.gallery-scroll');
    if (header) parallaxItems.push({ el: number, speed: -0.03, section });
    if (title) parallaxItems.push({ el: title, speed: -0.015, section });
    if (count) parallaxItems.push({ el: count, speed: -0.04, section });
    if (gallery) parallaxItems.push({ el: gallery, speed: -0.02, section });
  });

  // About section layers
  const aboutImage = document.querySelector('.about-image');
  const aboutName = document.querySelector('.about-name');
  const aboutLabel = document.querySelector('.about-label');
  const aboutText = document.querySelector('.about-text');

  // Contact layers
  const contactHeading = document.querySelector('.contact-heading');

  // Foreground floating items (nearest layer — moves fastest)
  const fgItems = document.querySelectorAll('.fg-item');
  // 5(biggest/fastest) → 2(mid, similar to title) → 0.5(smallest/slowest, behind)
  const fgSpeeds = [0.8, 0.25, 0.05];
  const fgBaseY = [];
  fgItems.forEach(el => {
    fgBaseY.push(parseFloat(getComputedStyle(el).top));
  });

  let ticking = false;
  let heroAnimDone = false;

  // Wait for hero animation to finish before applying parallax to inner elements
  setTimeout(() => { heroAnimDone = true; }, 2200);

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const scrollY = window.scrollY;
        const winH = window.innerHeight;
        const heroH = hero.offsetHeight;

        // ── Hero depth layers ──
        if (scrollY < heroH * 1.2) {
          const progress = scrollY / heroH;

          // Background: slowest layer (far away)
          const bgY = scrollY * 0.15;
          const bgScale = 1.08 - progress * 0.06;
          heroBg.style.transform = `scale(${bgScale}) translate3d(0, ${bgY}px, 0)`;
          if (heroVideo.classList.contains('active')) {
            heroVideo.style.transform = `translate3d(0, ${bgY}px, 0)`;
          }

          // Only parallax hero inner elements after animation completes
          if (heroAnimDone && scrollY > 5) {
            // Title: mid-far layer
            if (heroTitle) heroTitle.style.transform = `translate3d(0, ${scrollY * 0.25}px, 0)`;

            // Line: mid layer
            if (heroLine) heroLine.style.transform = `scaleX(1) translate3d(0, ${scrollY * 0.3}px, 0)`;

            // Subtitle: mid-near layer
            if (heroSub) heroSub.style.transform = `translate3d(0, ${scrollY * 0.35}px, 0)`;
          }

          // Content overall opacity
          heroContent.style.opacity = 1 - progress * 1.6;

          // Scroll indicator: nearest layer (moves fastest)
          if (heroScroll) {
            heroScroll.style.transform = `translateX(-50%) translate3d(0, ${scrollY * 0.5}px, 0)`;
            heroScroll.style.opacity = Math.max(0, 1 - progress * 3);
          }
        }

        // ── Section elements depth (only after reveal is done) ──
        parallaxItems.forEach(item => {
          if (!item.el || !item.el.closest('.visible, .reveal.visible') && item.el.classList.contains('reveal')) return;
          const rect = item.section.getBoundingClientRect();
          if (rect.top < winH && rect.bottom > 0) {
            const sectionProgress = (winH - rect.top) / (winH + rect.height);
            const offset = (sectionProgress - 0.5) * winH * item.speed;
            item.el.style.transform = `translateY(0) translate3d(0, ${offset}px, 0)`;
          }
        });

        // ── About section depth ──
        function applyDepth(el, amount) {
          if (!el) return;
          const rect = el.getBoundingClientRect();
          if (rect.top < winH && rect.bottom > 0) {
            const p = (winH - rect.top) / (winH + rect.height);
            const offset = (p - 0.5) * amount;
            // Preserve reveal translateY(0) and add parallax
            el.style.transform = `translateY(0) translate3d(0, ${offset}px, 0)`;
          }
        }

        applyDepth(aboutImage, -40);
        applyDepth(aboutName, -20);
        applyDepth(aboutText, -10);
        applyDepth(contactHeading, -25);

        // ── Foreground assets (nearest layer — fastest movement) ──
        const baseOpacities = [0.4, 0.35, 0.4];
        fgItems.forEach((el, i) => {
          const speed = fgSpeeds[i] || 0.3;
          const yOffset = scrollY * speed;
          const scaleShift = 1 + scrollY * 0.00008;
          el.style.transform = `translate3d(0, ${yOffset}px, 0) scale(${scaleShift})`;
          // Fade out as they scroll away
          const fadeProgress = Math.min(scrollY / (heroH * 1.5), 1);
          el.style.opacity = baseOpacities[i] * (1 - fadeProgress);
        });

        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
}

initParallax();

// ── Init ──
loadData();
