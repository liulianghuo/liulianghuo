/* 流量火传媒官网 · 文章后台 · 生成内核
   纯函数：不碰 DOM、不碰网络。浏览器与 Node 都能跑，方便发布前做本地回归。
   对外暴露 window.LHCore（浏览器）/ module.exports（Node）。 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LHCore = api;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : null), function () {
  'use strict';

  var SITE = 'https://liulianghuo.com';
  var MANAGED_ROW_RE = /[ \t]*<a class="insight-row reveal"[^>]*data-admin-id="[^"]*"[^>]*>[\s\S]*?<\/a>[ \t]*(?:\r?\n|$)/g;
  var MANAGED_SITEMAP_RE = /[ \t]*<!-- admin:article-\d+ -->[ \t]*\r?\n[ \t]*<url>[\s\S]*?<\/url>[ \t]*(?:\r?\n|$)/g;
  var LIST_OPEN_RE = /(<div class="insights-list"[^>]*>)([ \t]*\r?\n)/;
  var ALLOWED_PATHS = [
    /^insights\.html$/,
    /^sitemap\.xml$/,
    /^admin\/data\/articles\.json$/,
    /^article-(1[4-9]|[2-9]\d|[1-9]\d{2,})\.html$/,
    /^images\/og\/og-admin-\d+\.(webp|png|jpe?g)$/
  ];

  var DEFAULT_RELATED = [
    { text: '品牌GEO全国链路打通实战：从0到1让AI替你获客', href: 'geo-guide.html' },
    { text: '小红书账号定位诊断方法论', href: 'diagnosis-method.html' },
    { text: '五大引擎与四项落地服务', href: 'products.html#services' }
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function dateLabel(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? m[1] + '.' + m[2] : String(iso || '');
  }

  function readTime(plain) {
    var n = String(plain || '').replace(/\s/g, '').length;
    return '约' + Math.max(1, Math.ceil(n / 400)) + '分钟阅读';
  }

  function safeUrl(u) {
    var s = String(u || '').trim();
    if (/^(https?:\/\/|mailto:)/i.test(s)) return s;
    if (/^(\/|#|[a-zA-Z0-9_\-./]+\.html(?:#[^\s]*)?)$/.test(s)) return s;
    return '';
  }

  /* 先整体转义，再只放行受控的几种行内语法，杜绝 Word / 网页粘贴带进来的脏 HTML */
  function inline(escaped) {
    var s = escaped;
    s = s.replace(/`([^`]+)`/g, function (m, code) { return '<code>' + code + '</code>'; });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, label, url) {
      var ok = safeUrl(url);
      if (!ok) return label;
      var external = /^https?:\/\//i.test(ok);
      return '<a href="' + ok + '"' + (external ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + label + '</a>';
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return s;
  }

  /* 正文语法：## 小标题 / ### 次级标题 / - 列表 / > 引用 / --- 分割线 / **加粗** / `代码` / [文字](网址) */
  function renderBody(text) {
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    var out = [], mode = null, buf = [];
    function flush() {
      if (mode === 'ul' && buf.length) {
        out.push('<ul>');
        buf.forEach(function (x) { out.push('<li>' + x + '</li>'); });
        out.push('</ul>');
      } else if (mode === 'quote' && buf.length) {
        out.push('<blockquote>');
        buf.forEach(function (x) { out.push('<p>' + x + '</p>'); });
        out.push('</blockquote>');
      }
      mode = null; buf = [];
    }
    lines.forEach(function (raw) {
      var t = raw.trim();
      if (!t) { flush(); return; }
      if (/^###\s+/.test(t)) { flush(); out.push('<h3>' + inline(esc(t.replace(/^###\s+/, ''))) + '</h3>'); return; }
      if (/^##\s+/.test(t)) { flush(); out.push('<h2>' + inline(esc(t.replace(/^##\s+/, ''))) + '</h2>'); return; }
      if (/^[-*]\s+/.test(t)) { if (mode !== 'ul') flush(); mode = 'ul'; buf.push(inline(esc(t.replace(/^[-*]\s+/, '')))); return; }
      if (/^>\s?/.test(t)) { if (mode !== 'quote') flush(); mode = 'quote'; buf.push(inline(esc(t.replace(/^>\s?/, '')))); return; }
      if (/^-{3,}$/.test(t)) { flush(); out.push('<hr>'); return; }
      flush(); out.push('<p>' + inline(esc(t)) + '</p>');
    });
    flush();
    return out.join('\n');
  }

  function jsonLd(a) {
    var obj = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: a.title,
      description: a.description || a.excerpt,
      datePublished: a.date,
      author: { '@type': 'Organization', name: '流量火传媒' },
      publisher: { '@type': 'Organization', name: '流量火传媒' }
    };
    return JSON.stringify(obj, null, 2).replace(/</g, '\\u003c');
  }

  function relatedHtml(list) {
    var arr = (list && list.length) ? list : DEFAULT_RELATED;
    return arr.map(function (r) {
      return '    <li><a href="' + esc(safeUrl(r.href) || '#') + '">' + esc(r.text) + '</a></li>';
    }).join('\n');
  }

  function buildArticleHtml(a, tpl, ctx) {
    var body = renderBody(a.body || '');
    var values = {
      TITLE: esc(a.title),
      DESC: esc(a.description || a.excerpt || ''),
      CAT: esc(a.category),
      DATE_LABEL: dateLabel(a.date),
      DATE_ISO: esc(a.date),
      READTIME: readTime(a.body || ''),
      URL: esc(a.url),
      OG_IMAGE: esc(a.ogImage || 'images/og/og-insights.webp'),
      OG_IMAGE_TYPE: esc(a.ogType || 'image/webp'),
      CSS_V: esc(ctx.cssV),
      JS_V: esc(ctx.jsV),
      NOINDEX: a.status === 'published' ? '' : '<meta name="robots" content="noindex,follow">\n',
      BODY: body,
      FOOTNOTE: a.footnote ? '\n<div class="article-footnote">\n  * ' + esc(a.footnote) + '\n</div>\n' : '',
      RELATED: relatedHtml(a.related),
      JSONLD: jsonLd(a)
    };
    var html = String(tpl).replace(/\{\{([A-Z_]+)\}\}/g, function (m, k) {
      return Object.prototype.hasOwnProperty.call(values, k) ? values[k] : m;
    });
    return html;
  }

  /* 文章被删除或回滚掉之后，原网址保留一张 noindex 的占位页，避免出现死链 */
  function buildRemovedPage(url) {
    return '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n' +
      '<meta name="robots" content="noindex,follow">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
      '<title>文章已下线 — 流量火传媒</title>\n' +
      '<link rel="canonical" href="' + SITE + '/insights.html">\n' +
      '<style>html,body{margin:0;height:100%;background:#0d0f13;color:#e9ecf1;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}' +
      '.wrap{display:flex;align-items:center;justify-content:center;height:100%;text-align:center;padding:24px}' +
      '.card{max-width:520px;background:#161a22;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:36px 32px}' +
      'h1{font-size:23px;margin:0 0 12px}p{color:#a3acb9;font-size:15px;line-height:1.7;margin:0 0 20px}' +
      'a{display:inline-block;background:#e9ecf1;color:#0d0f13;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;font-size:14px}</style>\n' +
      '</head>\n<body>\n<div class="wrap"><div class="card">\n' +
      '  <h1>这篇文章已下线</h1>\n' +
      '  <p>内容已从「行业观点」中移除，看看其他一线实战观点吧</p>\n' +
      '  <a href="insights.html">返回行业观点 &rarr;</a>\n' +
      '</div></div>\n</body>\n</html>\n';
  }

  function byDateDesc(a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.num || 0) - (a.num || 0);
  }

  function buildRow(a) {
    return '    <a class="insight-row reveal" href="' + esc(a.url) + '" data-admin-id="' + esc(a.id) + '" data-admin-date="' + esc(a.date) + '">\n' +
      '      <span class="insight-cat">' + esc(a.category) + '</span>\n' +
      '      <div>\n' +
      '        <div class="insight-title">' + esc(a.title) + '</div>\n' +
      '        <div class="insight-excerpt">' + esc(a.excerpt) + '</div>\n' +
      '      </div>\n' +
      '      <span class="insight-date">' + dateLabel(a.date) + '</span>\n' +
      '    </a>\n';
  }

  function stripManagedRows(html) { return String(html).replace(MANAGED_ROW_RE, ''); }

  /* 只重排后台条目：先删掉全部旧条目，再按发布日期倒序插到列表最上面，老条目一个字节都不动 */
  function updateInsights(html, articles) {
    var src = String(html);
    if (!LIST_OPEN_RE.test(src)) throw new Error('没找到观点列表容器 .insights-list，已停止发布');
    var cleaned = stripManagedRows(src);
    var m = LIST_OPEN_RE.exec(cleaned);
    if (!m) throw new Error('观点列表容器结构异常，已停止发布');
    var published = (articles || []).filter(function (a) { return a.status === 'published'; }).sort(byDateDesc);
    var rows = published.map(buildRow).join('');
    return cleaned.slice(0, m.index) + m[1] + '\n' + rows + cleaned.slice(m.index + m[0].length);
  }

  function sitemapBlock(a) {
    return '  <!-- admin:' + esc(a.id) + ' -->\n' +
      '  <url>\n' +
      '    <loc>' + SITE + '/' + esc(a.url) + '</loc>\n' +
      '    <lastmod>' + esc(a.date) + '</lastmod>\n' +
      '    <changefreq>monthly</changefreq>\n' +
      '    <priority>0.6</priority>\n' +
      '  </url>\n';
  }

  function stripManagedSitemap(xml) { return String(xml).replace(MANAGED_SITEMAP_RE, ''); }

  function updateSitemap(xml, articles) {
    var src = String(xml);
    var cleaned = stripManagedSitemap(src);
    var idx = cleaned.lastIndexOf('</urlset>');
    if (idx < 0) throw new Error('sitemap.xml 缺少结束标签，已停止发布');
    var published = (articles || []).filter(function (a) { return a.status === 'published'; }).sort(byDateDesc);
    var blocks = published.map(sitemapBlock).join('');
    return cleaned.slice(0, idx) + blocks + cleaned.slice(idx);
  }

  /* 所有操作都归一成「算出新的数据 → 全量重生成受影响的文件」 */
  function buildAllFiles(current, next, ctx) {
    var files = [];
    var cur = {}, nxt = {}, all = {};
    (current.articles || []).forEach(function (a) { cur[a.url] = a; all[a.url] = 1; });
    (next.articles || []).forEach(function (a) { nxt[a.url] = a; all[a.url] = 1; });
    Object.keys(all).sort().forEach(function (url) {
      var a = nxt[url];
      if (!a || a.status === 'deleted') {
        files.push({ path: url, content: buildRemovedPage(url), encoding: 'utf8', label: '文章占位页' });
      } else {
        files.push({ path: url, content: buildArticleHtml(a, ctx.tpl, ctx), encoding: 'utf8', label: '文章页' });
      }
    });
    files.push({ path: 'insights.html', content: updateInsights(ctx.insightsHtml, next.articles), encoding: 'utf8', label: '观点列表' });
    files.push({ path: 'sitemap.xml', content: updateSitemap(ctx.sitemapXml, next.articles), encoding: 'utf8', label: '站点地图' });
    files.push({ path: 'admin/data/articles.json', content: JSON.stringify(next, null, 2) + '\n', encoding: 'utf8', label: '文章数据' });
    return files;
  }

  /* 发布前体检：不许碰样式/脚本/首页，不许弄坏老条目，生成结果不许带残占位符 */
  function preflight(ctx, current, next, files) {
    var bad = [];
    var paths = files.map(function (f) { return f.path; });
    paths.forEach(function (p) {
      if (!ALLOWED_PATHS.some(function (r) { return r.test(p); })) bad.push('不允许改动的文件：' + p);
    });
    if (/styles\.css|script\.js|^index\.html$/.test(paths.join('|'))) bad.push('检测到样式、脚本或首页被列为改动对象');

    var ins = files.filter(function (f) { return f.path === 'insights.html'; })[0];
    var sm = files.filter(function (f) { return f.path === 'sitemap.xml'; })[0];
    if (!ins || !sm) bad.push('缺少观点列表或站点地图的改动');

    if (ins) {
      var before = stripManagedRows(ctx.insightsHtml).replace(/\s+/g, '');
      var after = stripManagedRows(ins.content).replace(/\s+/g, '');
      if (before !== after) bad.push('官网原有的观点条目被改动了');
      if (!/class="insights-list"/.test(ins.content)) bad.push('观点列表容器丢失');
    }
    if (sm) {
      var sb = stripManagedSitemap(ctx.sitemapXml).replace(/\s+/g, '');
      var sa = stripManagedSitemap(sm.content).replace(/\s+/g, '');
      if (sb !== sa) bad.push('站点地图原有条目被改动了');
      var opens = (sm.content.match(/<url>/g) || []).length;
      var closes = (sm.content.match(/<\/url>/g) || []).length;
      if (opens !== closes || (sm.content.match(/<\/urlset>/g) || []).length !== 1) bad.push('站点地图标签不成对');
    }
    files.forEach(function (f) {
      if (f.encoding === 'base64' || f.content == null || !/\.html$/.test(f.path)) return;
      if (/\{\{[A-Z_]+\}\}/.test(f.content)) bad.push(f.path + ' 里还有未替换的占位符');
      if (!/<title>/.test(f.content) || !/<\/html>/.test(f.content)) bad.push(f.path + ' 不是完整网页');
    });
    files.filter(function (f) { return /^article-\d+\.html$/.test(f.path) && f.encoding === 'utf8' && /article-body/.test(f.content || ''); })
      .forEach(function (f) {
        if (f.content.indexOf('styles.css?v=' + ctx.cssV) < 0) bad.push(f.path + ' 的样式版本号与官网不一致');
        if (f.content.indexOf('script.js?v=' + ctx.jsV) < 0) bad.push(f.path + ' 的脚本版本号与官网不一致');
      });
    var seen = {};
    (next.articles || []).forEach(function (a) {
      if (seen[a.id]) bad.push('文章编号重复：' + a.id);
      if (seen[a.url]) bad.push('文章网址重复：' + a.url);
      seen[a.id] = seen[a.url] = 1;
      if (!a.title || !a.body || !a.date || !a.category) bad.push('有文章缺标题、正文、日期或分类');
    });
    return bad;
  }

  /* 预览用：去掉统计脚本，避免预览时污染百度统计 */
  function forPreview(html) {
    return String(html)
      .replace(/<!-- 流量统计[\s\S]*?<\/script>/, '')
      .replace(/<link rel="canonical"[^>]*>/, '');
  }

  return {
    SITE: SITE,
    DEFAULT_RELATED: DEFAULT_RELATED,
    esc: esc, dateLabel: dateLabel, readTime: readTime, safeUrl: safeUrl,
    renderBody: renderBody, jsonLd: jsonLd,
    buildArticleHtml: buildArticleHtml, buildRemovedPage: buildRemovedPage,
    buildRow: buildRow, updateInsights: updateInsights, stripManagedRows: stripManagedRows,
    sitemapBlock: sitemapBlock, updateSitemap: updateSitemap, stripManagedSitemap: stripManagedSitemap,
    buildAllFiles: buildAllFiles, preflight: preflight, forPreview: forPreview,
    byDateDesc: byDateDesc, MANAGED_ROW_RE: MANAGED_ROW_RE, MANAGED_SITEMAP_RE: MANAGED_SITEMAP_RE
  };
});
