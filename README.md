# 本地静态博客

零依赖：只用 Node 标准库生成 HTML，不用安装 Hugo / Hexo，不联网也能构建。

## 用法

```bash
node build.js
```

生成结果在 `dist/`，双击 `dist/index.html` 即可浏览。想用本地服务器预览：

```bash
python -m http.server -d dist 8000
# 打开 http://localhost:8000
```

## 目录

```
blog/
├── build.js          构建脚本（零依赖）
├── posts/            文章，一个 .md 一篇
│   └── hello-world.md
├── pages/            固定页面（关于等），一个 .md 一页
│   └── about.md
├── assets/
│   └── style.css     样式
├── wrangler.jsonc    Cloudflare Workers 部署配置（dist 作为静态资源目录）
└── dist/             生成结果，不要手改
```

`dist/` 里除了 HTML，还会生成 `feed.xml`（RSS）、`sitemap.xml`、`robots.txt`、`404.html` 和 `tags/` 下各标签页。

## 文章格式

```md
---
title: 文章标题
date: 2026-11-25
tags: [标签一, 标签二]
draft: false
---

正文……
```

- `title` 不填就用文件名
- `date` 用于首页排序，格式 `YYYY-MM-DD`
- `draft: true` 的文章不生成
- 想自定义首页摘要，加一行 `description: 一句话简介`

## 支持的 Markdown

标题、段落、加粗/斜体/删除线、行内代码、围栏代码块、引用、有序/无序列表、链接、图片、分割线。

不支持：表格、嵌套列表、任务列表、脚注。需要时再扩展 `build.js`。

## 改站点信息

`build.js` 顶部的 `SITE` 对象：标题、描述、作者、站点 URL、页脚。换域名时改 `SITE.url`，或构建前设环境变量 `SITE_URL`（影响 canonical、og:url、RSS 与 sitemap 里的绝对地址）。

## 注意

- 删除文章后，`dist/` 里对应的旧 HTML 不会自动删（构建不清理目录），手动删掉即可
- `dist/` 是纯静态文件，可以原样放到任何静态托管上，不用改代码

## 部署（外网访问）

`dist/` 是纯静态文件，写法与托管平台无关。

**当前方案：GitHub + Cloudflare Workers Builds**

1. 代码在 `https://github.com/fzj121382/Liu_Yun-s-Blog`（仓库根就是 `blog/`）
2. Cloudflare Dashboard → Workers & Pages → Create application → Import a repository → 选该仓库
3. Build command 填 `node build.js`，Deploy command 保持默认 `npx wrangler deploy`，Root directory 留空
4. 部署后地址：`https://liu-yun-s-blog.fzj121382.workers.dev`

`wrangler.jsonc` 里 `assets.directory` 指向 `./dist`，`not_found_handling: "404-page"` 让不存在的路径返回 `404.html`。之后每次 `git push` 到 `main` 自动重新构建部署；`dist/` 已写进 `.gitignore`，由 Cloudflare 构建时生成。

国内一般能打开，晚高峰速度看线路。

**最稳方案：国内服务器 + 备案域名**

1. 买轻量云服务器（腾讯云 / 阿里云，首年百元级）
2. 域名备案（约 1–2 周）
3. Nginx 指向 `dist/`，配 HTTPS
4. 更新时把 `dist/` 重新传上去

国内服务器不备案会被拦，这条路绕不开。

**只给同一局域网看**：`python -m http.server -d dist 8000 --bind 0.0.0.0`，手机连同一 WiFi 访问 `http://电脑IP:8000`。

