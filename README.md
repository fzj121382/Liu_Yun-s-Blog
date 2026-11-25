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
├── assets/
│   └── style.css     样式
└── dist/             生成结果，不要手改
```

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

`build.js` 顶部的 `SITE` 对象：标题、描述、页脚。

## 注意

- 删除文章后，`dist/` 里对应的旧 HTML 不会自动删（构建不清理目录），手动删掉即可
- `dist/` 是纯静态文件，可以原样放到任何静态托管上，不用改代码

## 部署（外网稳定访问）

`dist/` 是纯静态文件，扔给静态托管即可，本地代码不用改。

**免费方案：Cloudflare Pages**

1. 把 `blog` 推到 GitHub 仓库
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → 连接 Git 仓库
3. 构建命令留空，输出目录填 `dist`（仓库根是 `blog` 的话填 `blog/dist`）
4. 得到 `xxx.pages.dev`，可以再绑自己的域名

国内一般能打开，晚高峰速度看线路。

**最稳方案：国内服务器 + 备案域名**

1. 买轻量云服务器（腾讯云 / 阿里云，首年百元级）
2. 域名备案（约 1–2 周）
3. Nginx 指向 `dist/`，配 HTTPS
4. 更新时把 `dist/` 重新传上去

国内服务器不备案会被拦，这条路绕不开。

**只给同一局域网看**：`python -m http.server -d dist 8000 --bind 0.0.0.0`，手机连同一 WiFi 访问 `http://电脑IP:8000`。

