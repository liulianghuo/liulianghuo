/* ============================================
   流量火传媒 — 官网共享交互逻辑 v8
   ============================================ */

// 深浅色主题切换（首帧已由 <head> 内联脚本定好，这里负责按钮与跟随系统）
(function () {
  var root = document.documentElement;
  var KEY = 'lh-theme';
  var meta = document.querySelector('meta[name="theme-color"]');
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function cur() { return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function saved() {
    try { var v = localStorage.getItem(KEY); return (v === 'dark' || v === 'light') ? v : null; }
    catch (e) { return null; }
  }
  function paint(mode) {
    root.setAttribute('data-theme', mode);
    if (meta) meta.setAttribute('content', mode === 'dark' ? '#0A0A0D' : '#FFFFFF');
    var label = mode === 'dark' ? '切换到浅色模式' : '切换到深色模式';
    document.querySelectorAll('.theme-toggle').forEach(function (b) {
      b.setAttribute('aria-pressed', mode === 'dark' ? 'true' : 'false');
      b.setAttribute('aria-label', label);
      b.setAttribute('title', label);
    });
  }

  paint(cur());

  document.querySelectorAll('.theme-toggle').forEach(function (b) {
    b.addEventListener('click', function () {
      var next = cur() === 'dark' ? 'light' : 'dark';
      paint(next);
      try { localStorage.setItem(KEY, next); } catch (e) {}
    });
  });

  if (mq) {
    var onChange = function (e) { if (!saved()) paint(e.matches ? 'dark' : 'light'); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
})();

// 若上一次是「点 Logo 刷新首页」，加载后回到顶部
// 注意：线上图片加载慢时，浏览器会在脚本执行后仍把滚动恢复到原位，
// 所以用 rAF 循环强制置顶几秒；用户一旦自己滚动立刻让位。
(function () {
  try {
    if (sessionStorage.getItem('lh-top') === '1') {
      sessionStorage.removeItem('lh-top');
      if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
      var frames = 0, stop = false;
      var cancel = function () { stop = true; };
      window.addEventListener('wheel', cancel, { passive: true, once: true });
      window.addEventListener('touchstart', cancel, { passive: true, once: true });
      window.addEventListener('keydown', cancel, { once: true });
      (function force() {
        if (stop || frames++ > 300) return;   // 最多约 5 秒
        window.scrollTo(0, 0);
        requestAnimationFrame(force);
      })();
    }
  } catch (e) {}
})();

// Logo 回首页：内页点击正常回首页；已在首页时点击 = 重新加载首页
(function () {
  var links = document.querySelectorAll('[data-home-logo]');
  if (!links.length) return;

  function isHome() {
    var p = location.pathname;
    return p === '/' || p === '' || /\/index\.html?$/.test(p);
  }

  Array.prototype.forEach.call(links, function (a) {
    a.addEventListener('click', function (e) {
      // 新标签/新窗口打开等操作不拦截
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      if (!isHome()) return;

      e.preventDefault();
      try { sessionStorage.setItem('lh-top', '1'); } catch (e2) {}
      var clean = location.origin + location.pathname;
      if (clean === location.href) location.reload();
      else location.href = clean;   // 带锚点或参数时回到干净的首页
    });
  });
})();

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

// Mobile menu toggle
const mobileBtn = document.querySelector('.mobile-btn');
const mobileMenu = document.querySelector('.mobile-menu');
if (mobileBtn && mobileMenu) {
  const setOpen = (open) => {
    mobileMenu.classList.toggle('open', open);
    mobileBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  mobileBtn.addEventListener('click', (e) => {
    e.preventDefault();
    setOpen(!mobileMenu.classList.contains('open'));
  });

  /* 点菜单里的链接：只关面板，绝对不要 preventDefault ——
     之前把 toggle 直接绑在 a 上，里面调了 preventDefault，导致点「套餐/服务」
     菜单收起了但页面不跳转，手机上看起来就是「点了没反应」。 */
  mobileMenu.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => setOpen(false));
  });

  // 点面板外收起
  document.addEventListener('click', (e) => {
    if (!mobileMenu.classList.contains('open')) return;
    if (mobileMenu.contains(e.target) || mobileBtn.contains(e.target)) return;
    setOpen(false);
  });

  // 转横屏 / 放大窗口时收起
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) setOpen(false);
  });

  // Esc 收起
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });
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

// Cases 分类锚点高亮（sticky nav 滚动联动）
const casesNav = document.getElementById('cases-nav');
if (casesNav) {
  const chips = Array.from(casesNav.querySelectorAll('.v8-nav-chip'));
  const map = {};
  chips.forEach(c => {
    const id = (c.getAttribute('href') || '').replace('#', '');
    if (id) map[id] = c;
  });
  const sections = Object.keys(map)
    .map(id => document.getElementById(id))
    .filter(Boolean);
  if (sections.length) {
    const spy = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          chips.forEach(c => c.classList.remove('v8-nav-chip--active'));
          const active = map[e.target.id];
          if (active) active.classList.add('v8-nav-chip--active');
        }
      });
    }, { rootMargin: '-55% 0px -40% 0px', threshold: 0 });
    sections.forEach(s => spy.observe(s));
  }
}
