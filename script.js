/* ============================================
   流量火传媒 — 官网共享交互逻辑 v7
   ============================================ */

// Nav scroll hairline
const nav = document.getElementById('nav');
if (nav) {
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 20);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// 顶部滚动进度条
const progress = document.createElement('div');
progress.className = 'scroll-progress';
document.body.appendChild(progress);
const updateProgress = () => {
  const h = document.documentElement.scrollHeight - window.innerHeight;
  const p = h > 0 ? (window.scrollY / h) * 100 : 0;
  progress.style.width = p + '%';
};
window.addEventListener('scroll', updateProgress, { passive: true });
updateProgress();

// Mobile menu toggle (真正可用)
const mobileBtn = document.querySelector('.mobile-btn');
const mobileMenu = document.querySelector('.mobile-menu');
if (mobileBtn && mobileMenu) {
  const toggle = (e) => {
    e && e.preventDefault();
    const open = mobileMenu.classList.toggle('open');
    mobileBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  mobileBtn.addEventListener('click', toggle);
  mobileMenu.querySelectorAll('a').forEach(a => a.addEventListener('click', toggle));
}

// Scroll reveal with stagger
const ro = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      ro.unobserve(e.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
document.querySelectorAll('.reveal').forEach(el => ro.observe(el));

// 数字滚动计数（对标高级感）
function animateCount(el) {
  const to = parseFloat(el.dataset.to);
  const suffix = el.dataset.suffix || '';
  const prefix = el.dataset.prefix || '';
  const dur = 1500;
  const start = performance.now();
  const step = (now) => {
    const t = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    const val = to * eased;
    const shown = to >= 100 ? Math.round(val) : val.toFixed(to % 1 ? 1 : 0);
    el.textContent = prefix + shown + suffix;
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = prefix + (to % 1 ? to.toFixed(1) : Math.round(to)) + suffix;
  };
  requestAnimationFrame(step);
}
const countObs = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.querySelectorAll('.count-num').forEach(animateCount);
      countObs.unobserve(e.target);
    }
  });
}, { threshold: 0.4 });
document.querySelectorAll('[data-count-group]').forEach(g => countObs.observe(g));

// 服务卡片 3D 倾斜微交互
if (window.matchMedia('(hover:hover) and (pointer:fine)').matches) {
  document.querySelectorAll('.tilt').forEach(card => {
    const inner = card.querySelector('.tilt-inner');
    if (!inner) return;
    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      inner.style.transform = `rotateY(${px * 6}deg) rotateX(${-py * 6}deg) translateY(-4px)`;
    });
    card.addEventListener('mouseleave', () => {
      inner.style.transform = 'rotateY(0) rotateX(0) translateY(0)';
    });
  });
}

// Hero 光晕视差
const heroGlow = document.querySelector('.hero-glow');
if (heroGlow) {
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (y < window.innerHeight) {
      heroGlow.style.transform = `translateX(-50%) translateY(${y * 0.25}px)`;
    }
  }, { passive: true });
}

// Smooth anchor
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const href = a.getAttribute('href');
    if (href.length < 2) return;
    const t = document.querySelector(href);
    if (t) {
      e.preventDefault();
      t.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// FAQ accordion
document.querySelectorAll('.faq-q').forEach(q => {
  q.addEventListener('click', () => {
    const item = q.closest('.faq-item');
    const ans = item.querySelector('.faq-a');
    const isOpen = item.classList.toggle('open');
    ans.style.maxHeight = isOpen ? ans.scrollHeight + 'px' : '0';
  });
});
