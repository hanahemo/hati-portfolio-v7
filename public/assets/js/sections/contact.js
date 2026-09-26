const safeHttp = (u) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '');

export function initContact(settings) {
  const emailBtn = document.getElementById('contactEmail');
  const phoneBtn = document.getElementById('contactPhone');
  const instaLink = document.getElementById('contactInstagram');
  const linkedinLink = document.getElementById('contactLinkedin');
  const toast = document.getElementById('toast');

  const insta = safeHttp(settings.contactInstagram);
  if (instaLink && insta) {
    instaLink.href = insta;
    instaLink.hidden = false;
  }
  const linkedin = safeHttp(settings.contactLinkedin);
  if (linkedinLink && linkedin) {
    linkedinLink.href = linkedin;
    linkedinLink.hidden = false;
  }

  if (emailBtn && settings.contactEmail) {
    emailBtn.textContent = settings.contactEmail;
    emailBtn.setAttribute('aria-label', `email: ${settings.contactEmail} (click to copy)`);
    emailBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await navigator.clipboard.writeText(settings.contactEmail);
        showToast('copied!');
      } catch { location.href = 'mailto:' + settings.contactEmail; }
    });
  }
  if (phoneBtn && settings.contactPhone) {
    phoneBtn.textContent = settings.contactPhone;
    phoneBtn.setAttribute('aria-label', `phone: ${settings.contactPhone} (click to copy)`);
    phoneBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await navigator.clipboard.writeText(settings.contactPhone);
        showToast('copied!');
      } catch { location.href = 'tel:' + settings.contactPhone; }
    });
  }

  // 푸터 — 연도 자동, 서울 현지시간(30초 갱신). '지금 서울에서 작업 중'이라는 살아있는 신호
  const yearEl = document.getElementById('contactYear');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
  const clock = document.getElementById('contactClock');
  if (clock) {
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
    const tick = () => { clock.textContent = `Seoul — ${fmt.format(new Date())} KST`; };
    tick();
    setInterval(tick, 30000);
  }

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('is-show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('is-show'), 1600);
  }
}
