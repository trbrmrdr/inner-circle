(function () {
  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const menuToggle = qs('.menu-toggle');
  const mobileNav = qs('#mobile-nav');

  if (menuToggle && mobileNav) {
    const closeMenu = () => {
      menuToggle.setAttribute('aria-expanded', 'false');
      mobileNav.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('is-menu-open');
    };

    menuToggle.addEventListener('click', () => {
      const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
      menuToggle.setAttribute('aria-expanded', String(!isOpen));
      mobileNav.setAttribute('aria-hidden', String(isOpen));
      document.body.classList.toggle('is-menu-open', !isOpen);
    });

    qsa('a', mobileNav).forEach((link) => {
      link.addEventListener('click', closeMenu);
    });
  }

  const form = qs('#application-form');
  const privacyConsent = qs('#privacy-consent');
  const submitButton = qs('#submit-button');
  const successMessage = qs('#form-success');

  if (form && privacyConsent && submitButton && successMessage) {
    privacyConsent.addEventListener('change', () => {
      submitButton.disabled = !privacyConsent.checked;
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();

      if (!form.reportValidity()) {
        return;
      }

      successMessage.hidden = false;
      form.reset();
      submitButton.disabled = true;
      successMessage.focus?.();
    });
  }

  const galleryButtons = qsa('#space-gallery .gallery-card');
  const lightbox = qs('#lightbox');
  const lightboxImage = qs('#lightbox-image');
  const lightboxCaption = qs('#lightbox-caption');
  const lightboxClose = qs('.lightbox__close');
  const prevButton = qs('.lightbox__nav--prev');
  const nextButton = qs('.lightbox__nav--next');
  let currentIndex = 0;

  const gallery = galleryButtons.map((button) => {
    const image = qs('img', button);
    const tag = qs('.gallery-card__meta span', button)?.textContent.trim() || '';
    const title = qs('.gallery-card__meta strong', button)?.textContent.trim() || image?.alt || '';
    return {
      alt: image?.alt || 'Фото пространства Home Lab',
      src: image?.currentSrc || image?.src || '',
      tag,
      title
    };
  });

  function updateLightbox() {
    const item = gallery[currentIndex];
    if (!item || !lightboxImage || !lightboxCaption) {
      return;
    }

    lightboxImage.src = item.src;
    lightboxImage.alt = item.alt;
    lightboxCaption.textContent = item.tag ? `${item.tag} / ${item.title}` : item.title;
  }

  function openLightbox(index) {
    if (!lightbox || !lightboxClose) {
      return;
    }

    currentIndex = index;
    updateLightbox();
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-lightbox-open');
    lightboxClose.focus();
  }

  function closeLightbox() {
    if (!lightbox) {
      return;
    }

    lightbox.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-lightbox-open');
  }

  function showNext(direction) {
    if (!gallery.length) {
      return;
    }

    currentIndex = (currentIndex + direction + gallery.length) % gallery.length;
    updateLightbox();
  }

  galleryButtons.forEach((button, index) => {
    button.addEventListener('click', () => openLightbox(index));
  });

  lightboxClose?.addEventListener('click', closeLightbox);
  prevButton?.addEventListener('click', () => showNext(-1));
  nextButton?.addEventListener('click', () => showNext(1));
  lightbox?.addEventListener('click', (event) => {
    if (event.target === lightbox) {
      closeLightbox();
    }
  });

  const modals = qsa('.modal');
  let lastModalTrigger = null;

  const closeModals = () => {
    modals.forEach((modal) => modal.setAttribute('aria-hidden', 'true'));
    document.body.classList.remove('is-modal-open');
    lastModalTrigger?.focus?.();
    lastModalTrigger = null;
  };

  const openModal = (id, trigger = null) => {
    const modal = document.getElementById(id);
    if (!modal) {
      return;
    }

    lastModalTrigger = trigger;
    modals.forEach((item) => item.setAttribute('aria-hidden', 'true'));
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-modal-open');
    qs('[data-modal-close]', modal)?.focus();
  };

  qsa('[data-modal-open]').forEach((button) => {
    button.addEventListener('click', () => openModal(button.dataset.modalOpen, button));
  });

  qsa('[data-modal-switch]').forEach((button) => {
    button.addEventListener('click', () => openModal(button.dataset.modalSwitch, button));
  });

  qsa('[data-modal-close]').forEach((button) => {
    button.addEventListener('click', closeModals);
  });

  modals.forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        closeModals();
      }
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeLightbox();
      closeModals();
    }

    if (lightbox?.getAttribute('aria-hidden') === 'false') {
      if (event.key === 'ArrowRight') {
        showNext(1);
      }

      if (event.key === 'ArrowLeft') {
        showNext(-1);
      }
    }
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );

  qsa('.reveal').forEach((node) => observer.observe(node));
})();
