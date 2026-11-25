---
title: 第一篇文章
date: 2026-11-20
tags: [随笔, 开始]
---

这是用 Markdown 写的正文。本文件就是模板：复制一份，改开头几行，就能写新文章。

## 支持的写法

- **加粗**、*斜体*、~~删除线~~
- 行内代码 `like this`
- 链接：[CommonMark 规范](https://commonmark.org)
- 无序列表和下面的有序列表

1. 第一步
2. 第二步

> 这是一段引用。引用里也能放 `代码`。

代码块：

```js
function hello(name) {
  return '你好，' + name;
}
```

分割线：

---

图片：把图片放进 `assets/` 目录，正文写 `![说明](assets/图片名.png)`，构建时会自动改成相对路径，双击 HTML 也能正常显示。

## 加一篇新文章

1. 复制 `posts/hello-world.md`，改文件名（文件名就是 URL，建议英文或拼音）
2. 改开头的 `title`、`date`、`tags`，`draft: true` 可以让文章暂时不发布
3. 运行 `node build.js`
4. 双击 `dist/index.html` 看效果
