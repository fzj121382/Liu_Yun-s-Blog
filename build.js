#!/usr/bin/env node
'use strict';

/**
 * 极简静态博客生成器（零依赖，只用 Node 标准库）
 *
 *   node build.js
 *
 * 输入：posts/*.md + assets/*
 * 输出：dist/index.html + dist/posts/*.html + dist/assets/* + dist/style.css
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const POSTS_DIR = path.join(ROOT, 'posts');
const ASSETS_DIR = path.join(ROOT, 'assets');
const DIST_DIR = path.join(ROOT, 'dist');

// ====== 站点信息：改这里即可 ======
const SITE = {
  title: '我的博客',
  description: '用 Markdown 写，用 Node 生成，纯静态。',
  footer: 'build.js · 无框架 · 无依赖',
};

// ====== 小工具 ======
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

// 行内语法：/**/ `code` 图片 链接 加粗 斜体 删除线
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
  const root = opts.depth === 1 ? '../' : '';
  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>' + escapeHtml(opts.title) + '</title>',
    '<link rel="stylesheet" href="' + root + 'style.css">',
    '</head>',
    '<body>',
    '<header class="site-header">',
    '<a class="site-title" href="' + root + 'index.html">' + escapeHtml(SITE.title) + '</a>',
    '<p class="site-desc">' + escapeHtml(SITE.description) + '</p>',
    '</header>',
    '<main>',
    opts.body,
    '</main>',
    '<footer class="site-footer">' + escapeHtml(SITE.footer) + '</footer>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

// ====== 数据 ======
function readPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  const posts = [];
  for (const file of fs.readdirSync(POSTS_DIR)) {
    if (!file.toLowerCase().endsWith('.md')) continue;
    const raw = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8');
    const parsed = parseFrontMatter(raw);
    const data = parsed.data;
    if (String(data.draft).toLowerCase() === 'true') continue;

    let tags = data.tags !== undefined ? data.tags : data.tag;
    if (tags === undefined) tags = [];
    if (!Array.isArray(tags)) {
      tags = String(tags)
        .split(',')
        .map(function (s) { return s.trim(); })
        .filter(Boolean);
    }

    posts.push({
      slug: file.replace(/\.md$/i, ''),
      title: data.title || file.replace(/\.md$/i, ''),
      date: data.date || '',
      tags: tags,
      body: parsed.body,
    });
  }
  posts.sort(function (a, b) {
    return (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0);
  });
  return posts;
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

// ====== 构建 ======
function build() {
  const posts = readPosts();

  fs.mkdirSync(DIST_DIR, { recursive: true });
  copyDir(ASSETS_DIR, path.join(DIST_DIR, 'assets'));
  const styleSrc = path.join(ASSETS_DIR, 'style.css');
  if (fs.existsSync(styleSrc)) fs.copyFileSync(styleSrc, path.join(DIST_DIR, 'style.css'));

  for (const post of posts) {
    const body = renderMarkdown(post.body, { depth: 1 });
    const metaParts = [];
    if (post.date) {
      metaParts.push('<time datetime="' + escapeHtml(post.date) + '">' + escapeHtml(post.date) + '</time>');
    }
    for (const tag of post.tags) metaParts.push('<span class="tag">' + escapeHtml(tag) + '</span>');
    const meta = metaParts.join('<span class="dot">·</span>');

    const article =
      '<article>' +
      '<header class="post-header">' +
      '<h1>' + escapeHtml(post.title) + '</h1>' +
      (meta ? '<p class="post-meta">' + meta + '</p>' : '') +
      '</header>' +
      '<div class="post-body">' + body + '</div>' +
      '</article>' +
      '<p class="back"><a href="../index.html">← 返回首页</a></p>';

    writeFile(
      path.join(DIST_DIR, 'posts', post.slug + '.html'),
      layout({ title: post.title + ' · ' + SITE.title, body: article, depth: 1 })
    );
  }

  const items = posts.map(function (post) {
    const href = 'posts/' + encodeURIComponent(post.slug) + '.html';
    const time = post.date
      ? '<time datetime="' + escapeHtml(post.date) + '">' + escapeHtml(post.date) + '</time>'
      : '';
    return (
      '<li>' +
      '<a class="post-link" href="' + href + '">' + escapeHtml(post.title) + '</a>' +
      time +
      '<p class="excerpt">' + escapeHtml(excerpt(post.body)) + '</p>' +
      '</li>'
    );
  });

  const indexBody = posts.length
    ? '<ul class="post-list">' + items.join('\n') + '</ul>'
    : '<p class="empty">还没有文章。在 posts/ 里新建一个 .md，然后运行 node build.js。</p>';

  writeFile(
    path.join(DIST_DIR, 'index.html'),
    layout({ title: SITE.title, body: indexBody, depth: 0 })
  );

  console.log('生成完成：' + posts.length + ' 篇文章 -> ' + DIST_DIR);
  console.log('本地预览：双击 dist/index.html，或运行  python -m http.server -d dist 8000');
}

build();
