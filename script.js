/* ============================================
   流量火传媒 — 官网共享交互逻辑
   ============================================ */

// Nav scroll hairline
const nav = document.getElementById('nav');
if (nav) {
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 20);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

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
