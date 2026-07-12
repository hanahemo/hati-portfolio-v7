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

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('is-show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('is-show'), 1600);
  }
}
