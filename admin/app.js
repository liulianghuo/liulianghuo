/* 流量火传媒官网 · 文章后台 · 界面与发布
   令牌只留在浏览器内存 / 会话里，绝不写进仓库、页面或日志。 */
(function () {
  'use strict';
  var C = window.LHCore;
  if (!C) { document.body.innerHTML = '<p style="padding:30px">加载失败：缺少 core.js</p>'; return; }

  var CFG = { owner: 'liulianghuo', repo: 'liulianghuo', branch: 'main' };
  /* 仅本地调试时可指向测试仓库；线上永远锁定正式仓库 */
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(location.hostname)) {
    var q = new URLSearchParams(location.search);
    if (q.get('repo')) { var bits = q.get('repo').split('/'); if (bits.length === 2) { CFG.owner = bits[0]; CFG.repo = bits[1]; } }
    if (q.get('branch')) CFG.branch = q.get('branch');
  }
  var RP = '/repos/' + CFG.owner + '/' + CFG.repo;
  /* 账号名册：账号名 → 角色与显示名。密码 = 各人自己的 GitHub 令牌（细粒度，仅 liulianghuo/liulianghuo 的 Contents: Read and Write）。
     这里只存账号与角色，不含任何密钥；令牌只在浏览器会话里。要加 / 改账号，就在这里加一行。 */
  var ACCOUNTS = {
    'admin':   { role: 'admin',  name: '管理员' },
    'editor1': { role: 'editor', name: '编辑一' },
    'editor2': { role: 'editor', name: '编辑二' }
  };
  var TOK = 'lh_admin_token', USER = 'lh_admin_user', DRAFT = 'lh_admin_draft', THEME = 'lh-admin-theme';
  var STATUS_TEXT = { published: '已发布', offline: '已下线', deleted: '已删除' };
  var ACTION_TEXT = { offline: '下线', published: '恢复', deleted: '删除' };

  var state = {
    token: '', user: null, isAdmin: false, ctx: null, view: 'login',
    editingId: null, filter: 'all', coverFile: null, busy: false
  };

  function el(id) { return document.getElementById(id); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) { return C.esc(s); }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fmt(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') +
      ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  var toastTimer;
  function toast(msg, kind) {
    var t = el('toast');
    t.textContent = msg; t.className = 'toast ' + (kind || ''); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 4200);
  }
  function showErr(id, msg) { var e = el(id); e.textContent = msg; e.hidden = !msg; }
  function openModal(html, wide) {
    var root = el('modal-root');
    root.innerHTML = '<div class="modal-mask"><div class="modal' + (wide ? ' wide' : '') + '">' + html + '</div></div>';
    var mask = root.querySelector('.modal-mask');
    mask.addEventListener('click', function (e) { if (e.target === mask) closeModal(); });
    return root.querySelector('.modal');
  }
  function closeModal() { el('modal-root').innerHTML = ''; }

  /* ---------------- GitHub 接口（令牌只在本次会话，绝不进仓库/页面） ---------------- */
  function utf8ToBase64(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function base64ToUtf8(b64) {
    var bin = atob(String(b64).replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }
  async function api(method, path, body) {
    var headers = { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    var res;
    try {
      res = await fetch('https://api.github.com' + path, {
        method: method, headers: headers,
        body: body !== undefined ? JSON.stringify(body) : undefined, cache: 'no-store'
      });
    } catch (e) { throw new Error('连不上 GitHub，检查网络后重试'); }
    if (!res.ok) {
      var msg = '';
      try { var j = await res.json(); msg = j.message || ''; } catch (e) {}
      if (res.status === 401) throw new Error('令牌无效或已过期，请重新登录');
      if (res.status === 403 && /\/git\//.test(path)) throw new Error('这个令牌不能提交更改：请在令牌设置里把 Contents 设为 Read and Write，或改用经典令牌并勾选 repo');
      if (res.status === 403) throw new Error(/rate limit/i.test(msg) ? '操作太频繁，稍等几分钟再试' : '令牌权限不足，或这个账号还不是仓库协作者');
      if (res.status === 404) throw new Error('找不到仓库或文件，请确认账号已被邀请为协作者');
      if (res.status === 409 || res.status === 422) throw new Error('有其他人刚刚发布过，请点「刷新」后再试一次');
      throw new Error('GitHub 返回 ' + res.status + (msg ? '：' + msg : ''));
    }
    if (res.status === 204) return null;
    return res.json();
  }
  async function readFile(path, ref) {
    var r = await api('GET', RP + '/contents/' + encodeURI(path) + '?ref=' + encodeURIComponent(ref || CFG.branch) + '&t=' + Date.now());
    if (Array.isArray(r)) throw new Error('读取失败：' + path + ' 是目录');
    return { content: base64ToUtf8(r.content), sha: r.sha };
  }
  async function listRoot() {
    var r = await api('GET', RP + '/contents/?ref=' + encodeURIComponent(CFG.branch) + '&t=' + Date.now());
    return Array.isArray(r) ? r.map(function (x) { return x.name; }) : [];
  }
  async function commitAll(files, message) {
    var ref = await api('GET', RP + '/git/ref/heads/' + CFG.branch);
    var baseSha = ref.object.sha;
    var base = await api('GET', RP + '/git/commits/' + baseSha);
    var entries = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var payload = f.encoding === 'base64'
        ? { content: f.content, encoding: 'base64' }
        : { content: utf8ToBase64(f.content), encoding: 'base64' };
      var blob = await api('POST', RP + '/git/blobs', payload);
      entries.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    var tree = await api('POST', RP + '/git/trees', { base_tree: base.tree.sha, tree: entries });
    var cm = await api('POST', RP + '/git/commits', { message: message, tree: tree.sha, parents: [baseSha] });
    await api('PATCH', RP + '/git/refs/heads/' + CFG.branch, { sha: cm.sha, force: false });
    return cm;
  }

  /* ---------------- 读取官网现状 ---------------- */
  async function loadContext() {
    var all = await Promise.all([
      readFile('admin/data/articles.json'), readFile('insights.html'),
      readFile('sitemap.xml'), readFile('admin/article-template.txt'), listRoot()
    ]);
    var data = all[0], ins = all[1], sm = all[2], tpl = all[3], names = all[4];
    var current;
    try { current = JSON.parse(data.content); } catch (e) { throw new Error('文章数据文件损坏，请联系负责人'); }
    if (!current || !Array.isArray(current.articles)) throw new Error('文章数据格式不对，请联系负责人');
    var cssM = /styles\.css\?v=(\d+)/.exec(ins.content);
    var jsM = /script\.js\?v=(\d+)/.exec(ins.content);
    if (!cssM || !jsM) throw new Error('读不到官网样式版本号，已停止发布');
    var maxNum = 13;
    names.forEach(function (n) { var m = /^article-(\d+)\.html$/.exec(n); if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10)); });
    current.articles.forEach(function (a) { var m = /^article-(\d+)\.html$/.exec(a.url || ''); if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10)); });
    state.ctx = {
      current: current, insightsHtml: ins.content, sitemapXml: sm.content, tpl: tpl.content,
      cssV: cssM[1], jsV: jsM[1], nextNum: maxNum + 1
    };
    // 按账号过滤：管理员看全部，编辑只看自己（author === 当前账号）
    state.viewArticles = state.isAdmin
      ? current.articles
      : current.articles.filter(function (a) { return (a.author || '') === (state.user && state.user.username); });
    return state.ctx;
  }

  /* ---------------- 会话存储（令牌只留浏览器，绝不进仓库/页面） ---------------- */
  function saveSession(remember) {
    var a = remember ? window.localStorage : window.sessionStorage;
    var b = remember ? window.sessionStorage : window.localStorage;
    try {
      a.setItem(TOK, state.token); a.setItem(USER, state.user.username);
      b.removeItem(TOK); b.removeItem(USER);
    } catch (e) {}
  }
  function clearSession() {
    try {
      localStorage.removeItem(TOK); localStorage.removeItem(USER);
      sessionStorage.removeItem(TOK); sessionStorage.removeItem(USER);
    } catch (e) {}
  }
  function loadSession() {
    var t = null, u = null;
    try {
      t = localStorage.getItem(TOK); u = localStorage.getItem(USER);
      if (!t) { t = sessionStorage.getItem(TOK); u = sessionStorage.getItem(USER); }
    } catch (e) {}
    if (t && u && ACCOUNTS[u]) return { token: t, username: u };
    return null;
  }

  /* ---------------- 登录 ---------------- */
  function renderUser() {
    var box = el('userbox');
    el('app').classList.remove('is-guest');
    box.hidden = false;
    // 头像用官网 logo，与官网保持一致
    var th = document.documentElement.getAttribute('data-theme');
    el('user-avatar').src = (th === 'dark' ? '../logo-dark.png' : '../logo.png');
    el('user-name').textContent = state.user ? state.user.displayName : '';
    var role = el('user-role');
    role.style.display = '';
    role.textContent = (state.user && state.user.role === 'admin') ? '管理员' : '编辑';
  }
  async function buildUser(username, token) {
    state.token = token;
    var me = await api('GET', '/user');
    var acc = ACCOUNTS[username];
    state.user = { username: username, displayName: acc.name, role: acc.role, login: (me && me.login) || '' };
    state.isAdmin = (acc.role === 'admin');
    return state.user;
  }
  async function doLogin(username, password, remember) {
    username = (username || '').trim();
    if (!ACCOUNTS[username]) { showErr('login-err', '没有这个账号，请向管理员确认'); return; }
    var tok = password || '';
    if (!tok) { showErr('login-err', '请输入密码（即你个人的 GitHub 令牌）'); return; }
    showErr('login-err', '');
    try {
      await buildUser(username, tok);
      saveSession(!!remember);
      renderUser();
      switchView('list');
      await refreshList();
      toast('登录成功，欢迎使用文章后台', 'ok');
    } catch (e) {
      state.token = ''; showErr('login-err', e.message);
    }
  }
  async function logout() {
    clearSession();
    state.user = null; state.isAdmin = false; state.ctx = null; state.viewArticles = []; state.history = [];
    el('app').classList.add('is-guest');
    el('userbox').hidden = true;
    switchView('login');
    el('user').value = ''; el('pw').value = '';
    showErr('login-err', '');
  }

  /* ---------------- 视图切换 ---------------- */
  var TITLES = { login: '登录', list: '文章管理', write: '写文章', log: '发布记录', help: '使用帮助' };
  function switchView(v) {
    state.view = v;
    ['login', 'list', 'write', 'log', 'help'].forEach(function (k) { el('view-' + k).hidden = (k !== v); });
    $$('.nav-item').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-view') === v); });
    el('topbar-title').textContent = TITLES[v] || '';
  }

  /* ---------------- 文章管理 ---------------- */
  async function refreshList() {
    el('list-loading').hidden = false; el('list-body').hidden = true;
    try {
      await loadContext();
      renderList({ articles: state.viewArticles });
      el('list-loading').hidden = true; el('list-body').hidden = false;
    } catch (e) {
      el('list-loading').textContent = '读取失败：' + e.message;
      throw e;
    }
  }
  function renderList(data) {
    var arts = (data.articles || []).slice().sort(C.byDateDesc);
    var n = { published: 0, offline: 0, deleted: 0 };
    arts.forEach(function (a) { if (n[a.status] !== undefined) n[a.status]++; });
    el('list-summary').textContent = '后台文章 ' + arts.length + ' 篇 · 已发布 ' + n.published + ' · 已下线 ' + n.offline + ' · 已删除 ' + n.deleted;
    var shown = arts.filter(function (a) { return state.filter === 'all' || a.status === state.filter; });
    if (!shown.length) {
      el('list-body').innerHTML = '<div class="empty"><b>' + (arts.length ? '这个分类下还没有文章' : '还没有通过后台发布过文章') + '</b>' +
        (arts.length ? '换个筛选条件看看' : '点右上角「写新文章」，发一篇试试') + '</div>';
      return;
    }
    var rows = shown.map(function (a) {
      var ops = [];
      if (a.status !== 'deleted') {
        ops.push('<button class="link-btn" data-act="edit" data-id="' + esc(a.id) + '">编辑</button>');
        ops.push('<button class="link-btn" data-act="preview" data-id="' + esc(a.id) + '">预览</button>');
      }
      if (a.status === 'published') {
        ops.push('<a class="link-btn" href="../' + esc(a.url) + '" target="_blank" rel="noopener">查看</a>');
        ops.push('<button class="link-btn" data-act="offline" data-id="' + esc(a.id) + '">下线</button>');
      } else if (a.status === 'offline') {
        ops.push('<button class="link-btn" data-act="restore" data-id="' + esc(a.id) + '">恢复</button>');
      } else if (state.isAdmin) {
        ops.push('<button class="link-btn" data-act="restore" data-id="' + esc(a.id) + '">恢复</button>');
      }
      if (state.isAdmin && a.status !== 'deleted') {
        ops.push('<button class="link-btn danger" data-act="delete" data-id="' + esc(a.id) + '">删除</button>');
      }
      return '<tr>' +
        '<td class="cell-title">' + esc(a.title) + '<small>' + esc(a.excerpt || '') + '</small></td>' +
        '<td>' + esc(a.category) + '</td>' +
        '<td>' + esc(a.date) + '</td>' +
        '<td><span class="badge ' + esc(a.status) + '">' + (STATUS_TEXT[a.status] || a.status) + '</span></td>' +
        '<td>' + esc(a.createdBy || '—') + '</td>' +
        '<td class="cell-ops">' + ops.join('') + '</td>' +
        '</tr>';
    }).join('');
    el('list-body').innerHTML = '<table><thead><tr><th>标题</th><th>分类</th><th>发布日期</th><th>状态</th><th>发布人</th><th style="text-align:right">操作</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  /* ---------------- 编辑表单 ---------------- */
  function findArticle(id) {
    var list = state.ctx ? state.ctx.current.articles : [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function fillForm(a) {
    el('f-cat').value = a.category || 'GEO 优化';
    el('f-title').value = a.title || '';
    el('f-excerpt').value = a.excerpt || '';
    el('f-date').value = a.date || today();
    el('f-body').value = a.body || '';
    el('f-desc').value = a.description || '';
    el('f-footnote').value = a.footnote || '';
    el('f-cover').value = '';
    el('cover-note').textContent = a.ogImage && /og-admin-/.test(a.ogImage) ? '沿用已上传的封面：' + a.ogImage : '';
    updateMeta();
    showErr('write-err', '');
  }
  function startNew() {
    state.editingId = null; state.coverFile = null;
    el('write-title').textContent = '写新文章';
    el('btn-publish').textContent = '发布到官网';
    var blank = { category: 'GEO 优化', date: today() };
    var saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(DRAFT) || 'null'); } catch (e) {}
    fillForm(saved && saved.title ? saved : blank);
    if (saved && saved.title) toast('已恢复上次没发完的内容');
  }
  function startEdit(id) {
    var a = findArticle(id);
    if (!a) { toast('找不到这篇文章，先刷新一下', 'bad'); return; }
    state.editingId = id; state.coverFile = null;
    el('write-title').textContent = '编辑文章';
    el('btn-publish').textContent = '保存并发布';
    fillForm(a);
  }
  function collectForm(strict) {
    var f = {
      category: el('f-cat').value.trim(),
      title: el('f-title').value.trim(),
      excerpt: el('f-excerpt').value.trim(),
      date: el('f-date').value,
      body: el('f-body').value.replace(/\r\n?/g, '\n').trim(),
      description: el('f-desc').value.trim(),
      footnote: el('f-footnote').value.trim()
    };
    if (strict) {
      if (!f.title) { showErr('write-err', '请先填标题'); return null; }
      if (!f.excerpt) { showErr('write-err', '请填摘要，列表里标题下面那行小字'); return null; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) { showErr('write-err', '请选发布日期'); return null; }
      if (f.body.length < 30) { showErr('write-err', '正文太短了，至少写 30 个字再发布'); return null; }
    }
    showErr('write-err', '');
    return f;
  }
  function updateMeta() {
    var n = el('f-body').value.replace(/\s/g, '').length;
    el('body-meta').textContent = n + ' 字 · ' + C.readTime(el('f-body').value);
  }
  var draftTimer;
  function saveDraft() {
    if (state.editingId) return;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(function () {
      var f = collectForm(false);
      if (f && (f.title || f.body)) sessionStorage.setItem(DRAFT, JSON.stringify(f));
    }, 500);
  }
  function applyTool(tool) {
    var ta = el('f-body'), s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
    if (tool === 'h2' || tool === 'h3' || tool === 'ul' || tool === 'quote') {
      var prefix = tool === 'h2' ? '## ' : tool === 'h3' ? '### ' : tool === 'ul' ? '- ' : '> ';
      var ph = tool === 'h2' || tool === 'h3' ? '小标题' : tool === 'ul' ? '列表项' : '引用一句话';
      var ls = v.lastIndexOf('\n', s - 1) + 1;
      var chunk = v.slice(ls, e) || ph;
      var replaced = chunk.split('\n').map(function (l) { return prefix + l; }).join('\n');
      ta.value = v.slice(0, ls) + replaced + v.slice(e);
      ta.focus(); ta.setSelectionRange(ls + prefix.length, ls + replaced.length);
    } else {
      var map = {
        bold: ['**', '**', '重点'],
        link: ['[', '](https://)', '链接文字'],
        hr: ['\n---\n', '', '']
      };
      var m = map[tool]; if (!m) return;
      var sel = v.slice(s, e) || m[2];
      ta.value = v.slice(0, s) + m[0] + sel + m[1] + v.slice(e);
      ta.focus(); ta.setSelectionRange(s + m[0].length, s + m[0].length + sel.length);
    }
    updateMeta(); saveDraft();
  }

  /* ---------------- 预览 ---------------- */
  async function preview(article) {
    var f = article ? {
      category: article.category, title: article.title, excerpt: article.excerpt,
      date: article.date, body: article.body, description: article.description,
      footnote: article.footnote
    } : collectForm(false);
    if (!f) return;
    f.title = f.title || '（还没填标题）';
    f.body = f.body || '（正文还是空的）';
    f.category = f.category || 'GEO 优化';
    f.date = f.date || today();
    f.excerpt = f.excerpt || '这里是列表里的摘要';
    try {
      var ctx = state.ctx || await loadContext();
      var fake = Object.assign({}, f, {
        id: 'article-preview', num: 9999, url: 'article-preview.html', status: 'published',
        description: f.description || f.excerpt,
        ogImage: (article && article.ogImage) || 'images/og/og-insights.webp',
        ogType: (article && article.ogType) || 'image/webp'
      });
      var html = C.forPreview(C.buildArticleHtml(fake, ctx.tpl, ctx));
      html = html.replace('<head>', '<head><base href="' + C.SITE + '/">');
      var m = openModal(
        '<h2>页面预览</h2><p>和官网文章页用同一套样式，明暗主题也跟官网一致。这里只是预览，不会发布。</p>' +
        '<div class="preview-bar"><span>窗口宽度</span>' +
        '<button class="btn" data-w="desktop">桌面</button><button class="btn" data-w="mobile">手机</button>' +
        '<span style="margin-left:auto">预览不会计入百度统计</span></div>' +
        '<iframe class="preview-frame" title="文章预览" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>' +
        '<div class="modal-actions"><button class="btn btn-primary" data-act="close">关闭预览</button></div>', true);
      var frame = m.querySelector('.preview-frame');
      frame.srcdoc = html;
      m.querySelector('[data-w="desktop"]').onclick = function () { frame.style.width = '100%'; };
      m.querySelector('[data-w="mobile"]').onclick = function () { frame.style.width = '390px'; frame.style.display = 'block'; frame.style.marginInline = 'auto'; };
      m.querySelector('[data-act="close"]').onclick = closeModal;
    } catch (e) { toast('预览失败：' + e.message, 'bad'); }
  }

  /* ---------------- 发布 / 改状态 ---------------- */
  function confirmPublish(action, files, title) {
    return new Promise(function (resolve) {
      var list = files.map(function (f) {
        return '<li>' + esc(f.path) + '<span>' + esc(f.label || '') + '</span></li>';
      }).join('');
      var m = openModal(
        '<h2>确认' + esc(action) + '</h2>' +
        '<p>《' + esc(title) + '》将写入仓库，官网会自动重新构建。</p>' +
        '<ul class="file-list">' + list + '</ul>' +
        '<div class="notice">发布后约 1～3 分钟生效。这时打开文章链接可能暂时看不到内容，属正常现象。已发布的旧文章不受影响。</div>' +
        '<div class="modal-actions"><button class="btn" data-act="no">再改改</button>' +
        '<button class="btn btn-primary" data-act="yes">确认' + esc(action) + '</button></div>');
      m.querySelector('[data-act="no"]').onclick = function () { closeModal(); resolve(false); };
      m.querySelector('[data-act="yes"]').onclick = function () { closeModal(); resolve(true); };
    });
  }
  function simpleConfirm(title, text, okText, danger) {
    return new Promise(function (resolve) {
      var m = openModal('<h2>' + esc(title) + '</h2><p>' + esc(text) + '</p>' +
        '<div class="modal-actions"><button class="btn" data-act="no">取消</button>' +
        '<button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" data-act="yes">' + esc(okText) + '</button></div>');
      m.querySelector('[data-act="no"]').onclick = function () { closeModal(); resolve(false); };
      m.querySelector('[data-act="yes"]').onclick = function () { closeModal(); resolve(true); };
    });
  }
  async function publish() {
    var f = collectForm(true); if (!f) return;
    if (state.busy) return;
    state.busy = true; var btn = el('btn-publish'); btn.disabled = true;
    try {
      var ctx = await loadContext();
      state.ctx = ctx;
      var next = JSON.parse(JSON.stringify(ctx.current));
      var now = new Date().toISOString();
      var who = state.user.username;
      var a, action;
      if (state.editingId) {
        a = null;
        next.articles.forEach(function (x) { if (x.id === state.editingId) a = x; });
        if (!a) throw new Error('找不到这篇文章，请回列表刷新后再试');
        Object.keys(f).forEach(function (k) { a[k] = f[k]; });
        a.status = 'published'; a.updatedBy = who; a.updatedAt = now;
        action = '修改并发布';
      } else {
        var num = ctx.nextNum;
        a = Object.assign({
          id: 'article-' + num, num: num, url: 'article-' + num + '.html', status: 'published',
          ogImage: 'images/og/og-insights.webp', ogType: 'image/webp', author: who,
          createdBy: who, createdAt: now, updatedBy: who, updatedAt: now
        }, f);
        next.articles.push(a);
        action = '发布文章';
      }
      var coverFile = state.coverFile;
      if (coverFile) {
        a.ogImage = 'images/og/og-admin-' + a.num + '.' + coverFile.ext;
        a.ogType = coverFile.type;
      }
      var files = C.buildAllFiles(ctx.current, next, ctx);
      if (coverFile) {
        files.push({ path: a.ogImage, content: coverFile.data, encoding: 'base64', label: '封面图' });
      }
      var bad = C.preflight(ctx, ctx.current, next, files);
      if (bad.length) throw new Error('发布前体检没通过，已取消：\n' + bad.join('\n'));
      if (!await confirmPublish(action, files, a.title)) return;
      await commitAll(files, '[后台] ' + action + '：' + a.title);
      state.coverFile = null;
      if (!state.editingId) sessionStorage.removeItem(DRAFT);
      var publishedUrl = a.url;
      var publishedTitle = a.title;
      closeModal();
      openModal('<h2>已提交发布</h2><p>《' + esc(publishedTitle) + '》已写入仓库，官网正在重新构建，约 1～3 分钟后生效。</p>' +
        '<div class="notice">新文章会自动排在「行业观点」最上面，站点地图也已同步。刚发布就打开文章链接可能暂时是空白页，等一会儿刷新即可。</div>' +
        '<div class="modal-actions"><button class="btn" data-act="close">知道了</button>' +
        '<a class="btn" href="../' + esc(publishedUrl) + '" target="_blank" rel="noopener">打开文章页</a>' +
        '<a class="btn btn-primary" href="../insights.html" target="_blank" rel="noopener">打开行业观点</a></div>');
      el('modal-root').querySelector('[data-act="close"]').onclick = closeModal;
      state.editingId = null;
      switchView('list');
      await refreshList();
      toast(action + '成功', 'ok');
    } catch (e) {
      toast(e.message, 'bad');
      showErr('write-err', e.message);
    } finally { state.busy = false; btn.disabled = false; }
  }
  async function setStatus(id, status) {
    if (!state.isAdmin && (status === 'deleted')) { toast('只有管理员能删除文章', 'bad'); return; }
    var a = findArticle(id);
    if (!a) { toast('找不到这篇文章，先刷新一下', 'bad'); return; }
    var action = ACTION_TEXT[status];
    var extra = status === 'deleted'
      ? '删除后文章会从「行业观点」和站点地图移除，原网址保留一张提示页，不会出现死链；内容仍可从发布记录恢复。'
      : status === 'offline'
        ? '下线后文章不再出现在「行业观点」和站点地图，文章页会保留但不被搜索引擎收录，随时可以恢复。'
        : '恢复后文章会重新出现在「行业观点」列表里，位置按发布日期自动排。';
    if (!await simpleConfirm('确认' + action + '《' + a.title + '》', extra, '确认' + action, status === 'deleted')) return;
    if (state.busy) return;
    state.busy = true;
    try {
      var ctx = await loadContext(); state.ctx = ctx;
      var next = JSON.parse(JSON.stringify(ctx.current));
      var target = null;
      next.articles.forEach(function (x) { if (x.id === id) target = x; });
      if (!target) throw new Error('找不到这篇文章，请刷新后重试');
      target.status = status;
      target.updatedBy = state.user.username;
      target.updatedAt = new Date().toISOString();
      var files = C.buildAllFiles(ctx.current, next, ctx);
      var bad = C.preflight(ctx, ctx.current, next, files);
      if (bad.length) throw new Error('体检没通过，已取消：\n' + bad.join('\n'));
      await commitAll(files, '[后台] ' + action + '：' + target.title);
      await refreshList();
      toast(action + '成功', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
    finally { state.busy = false; }
  }

  /* ---------------- 发布记录（读 GitHub 提交历史，按账号过滤） ---------------- */
  async function renderLog() {
    el('log-loading').hidden = false; el('log-body').hidden = true;
    try {
      var r = await api('GET', RP + '/commits?path=' + encodeURIComponent('admin/data/articles.json') + '&per_page=100');
      var h = (r || []).map(function (c) {
        var login = (c.author && c.author.login) || (c.commit && c.commit.author && c.commit.author.name) || '未知';
        return {
          at: (c.commit && c.commit.author && c.commit.author.date) || '',
          login: login,
          by: (login === (state.user && state.user.login)) ? (state.user.displayName) : login,
          msg: (c.commit && c.commit.message ? c.commit.message.split('\n')[0] : ''),
          sha: c.sha
        };
      });
      // 编辑只看自己（按 GitHub 登录过滤）；管理员看全部
      if (!state.isAdmin) h = h.filter(function (e) { return e.login === (state.user && state.user.login); });
      h.sort(function (x, y) { return (y.at || '').localeCompare(x.at || ''); });
      var byUser = {};
      h.forEach(function (e) { var who = e.by || '未知'; byUser[who] = (byUser[who] || 0) + 1; });
      var names = Object.keys(byUser).sort(function (x, y) { return byUser[y] - byUser[x]; });
      el('log-stat').hidden = false;
      el('log-stat').innerHTML = '<span>共 ' + h.length + ' 次操作</span>' + names.map(function (n) {
        return '<span>' + esc(n) + ' <b>' + byUser[n] + '</b> 次</span>';
      }).join('');
      el('log-summary').textContent = '每一次发布、修改、下线、恢复和删除都会留下操作人与时间';
      if (!h.length) {
        el('log-body').innerHTML = '<div class="empty"><b>还没有发布记录</b>发第一篇文章后，这里就会开始留痕</div>';
      } else {
        el('log-body').innerHTML = '<table><thead><tr><th>时间</th><th>操作人</th><th>操作内容</th><th style="text-align:right">操作</th></tr></thead><tbody>' +
          h.map(function (e) {
            return '<tr><td>' + esc(fmt(e.at)) + '</td><td>' + esc(e.by || '—') + '</td><td>' + esc(e.msg) + '</td>' +
              '<td class="cell-ops">' +
              (state.isAdmin && e.sha ? '<button class="link-btn" data-act="rollback" data-sha="' + esc(e.sha) + '">回滚到这次</button>' : '') +
              '</td></tr>';
          }).join('') + '</tbody></table>';
      }
      el('log-loading').hidden = true; el('log-body').hidden = false;
    } catch (e) {
      el('log-loading').textContent = '读取失败：' + e.message;
      toast(e.message, 'bad');
    }
  }
  async function rollback(sha) {
    if (!state.isAdmin) { toast('只有管理员能回滚', 'bad'); return; }
    if (!await simpleConfirm('回滚到这次发布之前',
      '会把文章数据退回到当时文章数据文件的状态（之后的新增与改动会被撤销），回滚本身也会留一条记录。',
      '确认回滚', true)) return;
    if (state.busy) return;
    state.busy = true;
    try {
      var data = await readFile('admin/data/articles.json', sha);
      var current;
      try { current = JSON.parse(data.content); } catch (e) { throw new Error('读取历史版本失败，文件可能损坏'); }
      if (!current || !Array.isArray(current.articles)) throw new Error('历史版本格式不对，无法回滚');
      var ctx = state.ctx || await loadContext();
      var files = C.buildAllFiles(ctx.current, current, ctx);
      var bad = C.preflight(ctx, ctx.current, current, files);
      if (bad.length) throw new Error('体检没通过，已取消：\n' + bad.join('\n'));
      await commitAll(files, '[后台] 回滚到历史版本 ' + sha.slice(0, 7));
      await renderLog();
      await refreshList();
      toast('已回滚，官网约 1～3 分钟后生效', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
    finally { state.busy = false; }
  }

  /* ---------------- 事件绑定 ---------------- */
  $$('.nav-item').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = b.getAttribute('data-view');
      if (state.view === 'login' && !state.user) { toast('请先登录', 'bad'); return; }
      if (v === 'write') startNew();
      switchView(v);
      if (v === 'log') renderLog();
      if (v === 'list' && !state.ctx) refreshList().catch(function () {});
    });
  });
  el('btn-theme').addEventListener('click', function () {
    var cur = document.documentElement.getAttribute('data-theme');
    var n = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', n);
    try { localStorage.setItem(THEME, n); } catch (e) {}
  });
  el('btn-logout').addEventListener('click', logout);
  el('btn-login').addEventListener('click', async function () {
    var u = el('user').value.trim(), p = el('pw').value;
    if (!u || !p) { showErr('login-err', '请输入账号和密码'); return; }
    this.disabled = true; showErr('login-err', '');
    try { await doLogin(u, p, el('remember').checked); }
    catch (e) { showErr('login-err', e.message); }
    finally { this.disabled = false; }
  });
  el('pw').addEventListener('keydown', function (e) { if (e.key === 'Enter') el('btn-login').click(); });

  el('btn-new').addEventListener('click', function () { startNew(); switchView('write'); });
  el('btn-back').addEventListener('click', function () { switchView('list'); });
  el('btn-refresh').addEventListener('click', function () { refreshList().then(function () { toast('已刷新', 'ok'); }).catch(function () {}); });
  el('btn-log-refresh').addEventListener('click', renderLog);
  el('btn-preview').addEventListener('click', function () { preview(null); });
  el('btn-publish').addEventListener('click', publish);
  $$('.chip').forEach(function (c) {
    c.addEventListener('click', function () {
      state.filter = c.getAttribute('data-filter');
      $$('.chip').forEach(function (x) { x.classList.toggle('is-on', x === c); });
      if (state.viewArticles) renderList({ articles: state.viewArticles });
    });
  });
  $$('.tool').forEach(function (b) { b.addEventListener('click', function () { applyTool(b.getAttribute('data-tool')); }); });
  ['f-title', 'f-excerpt', 'f-date', 'f-body', 'f-desc', 'f-footnote', 'f-cat'].forEach(function (id) {
    el(id).addEventListener('input', function () { updateMeta(); saveDraft(); });
  });
  el('f-cover').addEventListener('change', function () {
    var f = this.files && this.files[0];
    if (!f) { state.coverFile = null; el('cover-note').textContent = ''; return; }
    if (!/^image\/(webp|png|jpeg)$/.test(f.type)) { toast('只支持 webp / png / jpg 图片', 'bad'); this.value = ''; return; }
    if (f.size > 2 * 1024 * 1024) { toast('封面图超过 2MB，请换一张', 'bad'); this.value = ''; return; }
    var self = this;
    var r = new FileReader();
    r.onload = function () {
      var s = String(r.result);
      state.coverFile = {
        data: s.slice(s.indexOf(',') + 1), type: f.type,
        ext: f.type === 'image/png' ? 'png' : f.type === 'image/jpeg' ? 'jpg' : 'webp'
      };
      el('cover-note').textContent = '已选择：' + f.name + '（点发布时上传）';
    };
    r.onerror = function () { toast('读取图片失败', 'bad'); self.value = ''; };
    r.readAsDataURL(f);
  });
  el('list-body').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var act = b.getAttribute('data-act'), id = b.getAttribute('data-id');
    if (act === 'edit') { startEdit(id); switchView('write'); }
    else if (act === 'preview') { var a = findArticle(id); if (a) preview(a); }
    else if (act === 'offline') setStatus(id, 'offline');
    else if (act === 'restore') setStatus(id, 'published');
    else if (act === 'delete') setStatus(id, 'deleted');
  });
  el('log-body').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act="rollback"]'); if (!b) return;
    rollback(b.getAttribute('data-sha'));
  });

  /* ---------------- 启动 ---------------- */
  (async function init() {
    // 打开即显示登录页（零延迟，不再先联网校验再弹框）；若浏览器里存了有效会话，静默验证后直接进入
    switchView('login');
    var s = loadSession();
    if (s) {
      state.token = s.token;
      try {
        var me = await api('GET', '/user');
        var acc = ACCOUNTS[s.username];
        state.user = { username: s.username, displayName: acc.name, role: acc.role, login: (me && me.login) || '' };
        state.isAdmin = (acc.role === 'admin');
        renderUser();
        switchView('list');
        refreshList().catch(function () {});
        return;
      } catch (e) {
        state.token = ''; clearSession();
      }
    }
  })();
})();
