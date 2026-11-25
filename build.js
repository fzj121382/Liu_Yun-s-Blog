#!/usr/bin/env node
'use strict';

/**
 * 极简静态博客生成器（零依赖，只用 Node 标准库）
 *
 *   node build.js
 *
 * 输入：posts/*.md + pages/*.md + assets/*
 * 输出：dist/ 下的首页、文章页、标签页、关于页、404、RSS、sitemap、robots
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const POSTS_DIR = path.join(ROOT, 'posts');
const PAGES_DIR = path.join(ROOT, 'pages');
const ASSETS_DIR = path.join(ROOT, 'assets');
const DIST_DIR = path.join(ROOT, 'dist');

// ====== 站点信息：改这里即可 ======
const SITE = {
  title: '流云借风',
  description: '记一些技术，一些想法。',
  author: '流云借风',
  // 站点绝对地址：现在用 workers.dev 域名，以后绑了自定义域名改这里（或构建时设 SITE_URL 环境变量）
  url: process.env.SITE_URL || 'https://liu-yun-s-blog.fzj121382.workers.dev',
  footer: '流云借风 · 用 Markdown 写，用 Node 生成',
};

// ====== 小工具 ======
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function absUrl(p) {
  return SITE.url.replace(/\/+$/, '') + '/' + String(p).replace(/^\/+/, '');
}

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

// ====== 解析 ======
function parseFrontMatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: raw };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (val.startsWith('[') && val.endsWith(']')) {
      data[key] = val
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else {
      data[key] = val;
    }
  }
  return { data, body: raw.slice(m[0].length) };
}

// 行内语法：`code` 图片 链接 加粗 斜体 删除线
function inline(text, opts) {
  opts = opts || {};
  const codes = [];
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, function (_, code) {
    codes.push('<code>' + code + '</code>');
    return '\u0000' + (codes.length - 1) + '\u0000';
  });
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy">');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  s = s.replace(/\u0000(\d+)\u0000/g, function (_, i) {
    return codes[Number(i)];
  });
  // 文章页比首页深一层：assets/ 自动改成 ../assets/
  if (opts.depth === 1) s = s.replace(/(src|href)="(?:\.\/)?assets\//g, '$1="../assets/');
  return s;
}

// 块级语法
function renderMarkdown(md, opts) {
  opts = opts || {};
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // 围栏代码块
    let m = line.match(/^```(\w*)\s*$/);
    if (m) {
      const lang = m[1];
      const buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++;
      out.push(
        '<pre><code' +
          (lang ? ' class="language-' + escapeHtml(lang) + '"' : '') +
          '>' +
          escapeHtml(buf.join('\n')) +
          '</code></pre>'
      );
      continue;
    }

    // 标题
    m = line.match(/^(#{1,6})\s+(.*)$/);
    if (m) {
      const lv = m[1].length;
      out.push('<h' + lv + '>' + inline(m[2], opts) + '</h' + lv + '>');
      i++;
      continue;
    }

    // 分割线
    if (/^(\*\*\*|___|---)\s*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    // 引用
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push('<blockquote>' + renderMarkdown(buf.join('\n'), opts) + '</blockquote>');
      continue;
    }

    // 无序列表
    if (/^[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s+/, ''));
        i++;
      }
      out.push('<ul>' + items.map(function (t) { return '<li>' + inline(t, opts) + '</li>'; }).join('') + '</ul>');
      continue;
    }

    // 有序列表
    if (/^\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+[.)]\s+/, ''));
        i++;
      }
      out.push('<ol>' + items.map(function (t) { return '<li>' + inline(t, opts) + '</li>'; }).join('') + '</ol>');
      continue;
    }

    // 段落
    const buf = [line.trim()];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6}\s|```|>\s?|[-*+]\s+|\d+[.)]\s+|(\*\*\*|___|---)\s*$)/.test(lines[i])
    ) {
      buf.push(lines[i].trim());
      i++;
    }
    out.push('<p>' + inline(buf.join(' '), opts) + '</p>');
  }

  return out.join('\n');
}

// ====== 页面模板 ======
function layout(opts) {
  const root = opts.root || '';
  const head = [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>' + escapeHtml(opts.title) + '</title>',
  ];
  if (opts.description) {
    head.push('<meta name="description" content="' + escapeHtml(opts.description) + '">');
  }
  head.push('<meta name="author" content="' + escapeHtml(SITE.author) + '">');
  head.push('<link rel="canonical" href="' + escapeHtml(absUrl(opts.path || 'index.html')) + '">');
  head.push('<meta property="og:site_name" content="' + escapeHtml(SITE.title) + '">');
  head.push('<meta property="og:title" content="' + escapeHtml(opts.title) + '">');
  if (opts.description) {
    head.push('<meta property="og:description" content="' + escapeHtml(opts.description) + '">');
  }
  head.push('<meta property="og:type" content="' + (opts.ogType || 'website') + '">');
  head.push('<meta property="og:url" content="' + escapeHtml(absUrl(opts.path || 'index.html')) + '">');
  head.push('<meta name="twitter:card" content="summary">');
  head.push('<link rel="alternate" type="application/rss+xml" title="' + escapeHtml(SITE.title) + ' RSS" href="' + root + 'feed.xml">');
  head.push('<link rel="stylesheet" href="' + root + 'style.css">');
  head.push('</head>');

  return head
    .concat([
      '<body>',
      '<header class="site-header">',
      '<div class="site-head-row">',
      '<a class="site-title" href="' + root + 'index.html">' + escapeHtml(SITE.title) + '</a>',
      '<nav class="site-nav">',
      '<a href="' + root + 'index.html">首页</a>',
      '<a href="' + root + 'about.html">关于</a>',
      '<a href="' + root + 'feed.xml">RSS</a>',
      '</nav>',
      '</div>',
      '<p class="site-desc">' + escapeHtml(SITE.description) + '</p>',
      '</header>',
      '<main>',
      opts.body,
      '</main>',
      '<footer class="site-footer">' + escapeHtml(SITE.footer) + '</footer>',
      '</body>',
      '</html>',
      '',
    ])
    .join('\n');
}

// ====== 数据 ======
function normalizeTags(data) {
  let tags = data.tags !== undefined ? data.tags : data.tag;
  if (tags === undefined) tags = [];
  if (!Array.isArray(tags)) {
    tags = String(tags)
      .split(',')
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }
  return tags;
}

function readPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  const posts = [];
  for (const file of fs.readdirSync(POSTS_DIR)) {
    if (!file.toLowerCase().endsWith('.md')) continue;
    const raw = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8');
    const parsed = parseFrontMatter(raw);
    const data = parsed.data;
    if (String(data.draft).toLowerCase() === 'true') continue;

    posts.push({
      slug: file.replace(/\.md$/i, ''),
      title: data.title || file.replace(/\.md$/i, ''),
      date: data.date || '',
      description: data.description || '',
      tags: normalizeTags(data),
      body: parsed.body,
    });
  }
  posts.sort(function (a, b) {
    return (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0);
  });
  return posts;
}

function readPages() {
  if (!fs.existsSync(PAGES_DIR)) return [];
  const pages = [];
  for (const file of fs.readdirSync(PAGES_DIR)) {
    if (!file.toLowerCase().endsWith('.md')) continue;
    const raw = fs.readFileSync(path.join(PAGES_DIR, file), 'utf8');
    const parsed = parseFrontMatter(raw);
    pages.push({
      slug: file.replace(/\.md$/i, ''),
      title: parsed.data.title || file.replace(/\.md$/i, ''),
      description: parsed.data.description || '',
      body: parsed.body,
    });
  }
  return pages;
}

// 摘要：优先 front matter 的 description，否则取第一段正文
function excerpt(body, max) {
  max = max || 100;
  const text =
    body
      .replace(/```[\s\S]*?```/g, ' ')
      .split(/\n\s*\n/)
      .map(function (s) { return s.trim(); })
      .find(function (s) {
        return s && !s.startsWith('#') && !s.startsWith('>') && !s.startsWith('!') && !s.startsWith('---');
      }) || '';
  const plain = text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/[*_~#>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? plain.slice(0, max) + '…' : plain;
}

function postUrl(post, root) {
  return root + 'posts/' + encodeURIComponent(post.slug) + '.html';
}

function tagUrl(tag, root) {
  return root + 'tags/' + encodeURIComponent(tag) + '.html';
}

function tagListHtml(tags, root) {
  return tags
    .map(function (tag) {
      return '<a class="tag-link" href="' + tagUrl(tag, root) + '">' + escapeHtml(tag) + '</a>';
    })
    .join('');
}

function renderPostList(posts, root) {
  return (
    '<ul class="post-list">' +
    posts
      .map(function (post) {
        const meta = [];
        if (post.date) {
          meta.push('<time datetime="' + escapeHtml(post.date) + '">' + escapeHtml(post.date) + '</time>');
        }
        if (post.tags.length) meta.push(tagListHtml(post.tags, root));
        return (
          '<li>' +
          '<a class="post-link" href="' + postUrl(post, root) + '">' + escapeHtml(post.title) + '</a>' +
          (meta.length ? '<p class="post-meta">' + meta.join('<span class="dot">·</span>') + '</p>' : '') +
          '<p class="excerpt">' + escapeHtml(post.description || excerpt(post.body)) + '</p>' +
          '</li>'
        );
      })
      .join('\n') +
    '</ul>'
  );
}

// ====== 构建 ======
function build() {
  const posts = readPosts();
  const pages = readPages();
  const tagMap = new Map();
  for (const post of posts) {
    for (const tag of post.tags) {
      if (!tagMap.has(tag)) tagMap.set(tag, []);
      tagMap.get(tag).push(post);
    }
  }

  fs.mkdirSync(DIST_DIR, { recursive: true });
  copyDir(ASSETS_DIR, path.join(DIST_DIR, 'assets'));
  const styleSrc = path.join(ASSETS_DIR, 'style.css');
  if (fs.existsSync(styleSrc)) fs.copyFileSync(styleSrc, path.join(DIST_DIR, 'style.css'));

  // 文章页
  posts.forEach(function (post, i) {
    const body = renderMarkdown(post.body, { depth: 1 });
    const meta = [];
    if (post.date) {
      meta.push('<time datetime="' + escapeHtml(post.date) + '">' + escapeHtml(post.date) + '</time>');
    }
    if (post.tags.length) meta.push(tagListHtml(post.tags, '../'));

    const newer = posts[i - 1];
    const older = posts[i + 1];
    const nav = [];
    if (older) {
      nav.push('<a class="prev" href="' + postUrl(older, '../') + '">← ' + escapeHtml(older.title) + '</a>');
    }
    if (newer) {
      nav.push('<a class="next" href="' + postUrl(newer, '../') + '">' + escapeHtml(newer.title) + ' →</a>');
    }

    const article =
      '<article>' +
      '<header class="post-header">' +
      '<h1>' + escapeHtml(post.title) + '</h1>' +
      (meta.length ? '<p class="post-meta">' + meta.join('<span class="dot">·</span>') + '</p>' : '') +
      '</header>' +
      '<div class="post-body">' + body + '</div>' +
      '</article>' +
      (nav.length ? '<nav class="post-nav">' + nav.join('') + '</nav>' : '') +
      '<p class="back"><a href="../index.html">← 返回首页</a></p>';

    writeFile(
      path.join(DIST_DIR, 'posts', post.slug + '.html'),
      layout({
        title: post.title + ' · ' + SITE.title,
        description: post.description || excerpt(post.body, 120),
        path: 'posts/' + post.slug + '.html',
        body: article,
        root: '../',
        ogType: 'article',
      })
    );
  });

  // 首页
  const indexBody = posts.length
    ? renderPostList(posts, '')
    : '<p class="empty">还没有文章。在 posts/ 里新建一个 .md，然后运行 node build.js。</p>';

  writeFile(
    path.join(DIST_DIR, 'index.html'),
    layout({ title: SITE.title, description: SITE.description, path: '', body: indexBody, root: '' })
  );

  // 标签页
  for (const [tag, list] of tagMap) {
    writeFile(
      path.join(DIST_DIR, 'tags', tag + '.html'),
      layout({
        title: '#' + tag + ' · ' + SITE.title,
        description: '标签「' + tag + '」下的 ' + list.length + ' 篇文章',
        path: 'tags/' + tag + '.html',
        body: '<h1 class="page-title">#' + escapeHtml(tag) + '</h1>' + renderPostList(list, '../'),
        root: '../',
      })
    );
  }

  // 独立页面（about 等）
  for (const page of pages) {
    writeFile(
      path.join(DIST_DIR, page.slug + '.html'),
      layout({
        title: (page.slug === 'about' ? page.title : page.title + ' · ' + SITE.title),
        description: page.description || excerpt(page.body, 120),
        path: page.slug + '.html',
        body:
          '<article class="page"><header class="post-header"><h1>' +
          escapeHtml(page.title) +
          '</h1></header><div class="post-body">' +
          renderMarkdown(page.body, { depth: 0 }) +
          '</div></article>',
        root: '',
      })
    );
  }

  // 404
  writeFile(
    path.join(DIST_DIR, '404.html'),
    layout({
      title: '页面不存在 · ' + SITE.title,
      path: '404.html',
      root: '',
      body:
        '<div class="notfound"><h1>404</h1><p>这个页面不存在，可能是链接过期了。</p>' +
        '<p><a href="/index.html">← 回首页</a></p></div>',
    })
  );

  // RSS
  const items = posts
    .slice(0, 20)
    .map(function (post) {
      const url = absUrl('posts/' + encodeURIComponent(post.slug) + '.html');
      return [
        '<item>',
        '<title>' + escapeHtml(post.title) + '</title>',
        '<link>' + escapeHtml(url) + '</link>',
        '<guid isPermaLink="true">' + escapeHtml(url) + '</guid>',
        post.date ? '<pubDate>' + new Date(post.date).toUTCString() + '</pubDate>' : '',
        '<description>' + escapeHtml(post.description || excerpt(post.body, 200)) + '</description>',
        '</item>',
      ]
        .filter(Boolean)
        .join('');
    })
    .join('\n');

  writeFile(
    path.join(DIST_DIR, 'feed.xml'),
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0">',
      '<channel>',
      '<title>' + escapeHtml(SITE.title) + '</title>',
      '<link>' + escapeHtml(absUrl('index.html')) + '</link>',
      '<description>' + escapeHtml(SITE.description) + '</description>',
      '<language>zh-CN</language>',
      posts[0] && posts[0].date ? '<lastBuildDate>' + new Date(posts[0].date).toUTCString() + '</lastBuildDate>' : '',
      items,
      '</channel>',
      '</rss>',
      '',
    ]
      .filter(Boolean)
      .join('\n')
  );

  // sitemap
  const urls = [];
  urls.push({ loc: absUrl('index.html'), lastmod: posts[0] && posts[0].date });
  for (const post of posts) {
    urls.push({ loc: absUrl('posts/' + encodeURIComponent(post.slug) + '.html'), lastmod: post.date });
  }
  for (const tag of tagMap.keys()) {
    urls.push({ loc: absUrl('tags/' + encodeURIComponent(tag) + '.html'), lastmod: '' });
  }
  for (const page of pages) urls.push({ loc: absUrl(page.slug + '.html'), lastmod: '' });
  writeFile(
    path.join(DIST_DIR, 'sitemap.xml'),
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      urls
        .map(function (u) {
          return (
            '<url><loc>' + escapeHtml(u.loc) + '</loc>' + (u.lastmod ? '<lastmod>' + escapeHtml(u.lastmod) + '</lastmod>' : '') + '</url>'
          );
        })
        .join('\n'),
      '</urlset>',
      '',
    ].join('\n')
  );

  // robots
  writeFile(
    path.join(DIST_DIR, 'robots.txt'),
    'User-agent: *\nAllow: /\n\nSitemap: ' + absUrl('sitemap.xml') + '\n'
  );

  console.log('生成完成：' + posts.length + ' 篇文章、' + tagMap.size + ' 个标签、' + pages.length + ' 个页面 -> ' + DIST_DIR);
  console.log('本地预览：python -m http.server -d dist 8000  然后开 http://localhost:8000/');
}

build();
