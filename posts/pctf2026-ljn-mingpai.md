---
title: [MISC] ljn的命名牌
date: 2026-11-25
tags: [CTF, PCTF2026, MISC]
description: PNG 头合法、尾合法、中间被整体倒序：先分清哪段是数据、哪段是包装，再修签名。
---
## 1. 题目信息

| 字段 | 内容 |
| :--- | :--- |
| 赛事/平台 | PCTF 2026 |
| 分类/难度 | Misc / — |
| 附件 | `grumm.grumm`（570079 B，sha256 `cd0c7148…`） |
| 环境 | Python 3、PIL |
| 题面 | ljn 玩 mc 翻宝箱时，翻到一个命名牌，他赶紧给村民命名 grumm，村民立马颠倒过来了。ljn 转念一想，这样命名了一个 png 文件，并做了一些小戏法，一切都 upsidedown 了 |

## 2. 考点分析

一句话核心考点：**PNG 的文件结构，以及"颠倒"到底颠倒在哪里。**

展开成两条：

1. PNG 的结构是 `8 字节签名 + 若干 chunk + IEND`。签名是 `89 50 4E 47 0D 0A 1A 0A`，每个 chunk 由「4 字节长度 + 4 字节类型 + 数据 + 4 字节 CRC」组成。判断文件坏没坏，就看这些字段能不能对上。
2. "upsidedown" 不等于"把文件反过来"就完事。作者把**真正的数据整体倒序**，再用"标准签名 + 反转体 + IEND"包了一层，让文件头尾看起来都正常。**要先看穿这层包装，才能拿到中间的倒序数据。**

## 3. 解题过程

### 3.1 初步观察

```bash
file grumm.grumm
# data
xxd -l 64 grumm.grumm
```

```text
00000000: 8950 4e47 0d0a 1a0a 8260 42ae 444e 4549  .PNG.....`B.DNEI
00000010: 0000 0000 2afc 18e6 a740 919d 7ffe 0378  ....*....@.....x
```

`89 50 4E 47 0D 0A 1A 0A`——是标准 PNG 签名。但紧跟其后的第一个 chunk，长度为 `0x826042AE`（约 21 亿字节），远超文件大小，**不可能是合法结构**。

再看尾部：

```text
... 0000 5244 4849 0d00 0000 0a1a 0a0d 6d6d  ..RDHI........mm
... 7572 6789 0000 0000 4945 4e44 ae42 6082  urg.....IEND.B`.
```

最后 12 字节 `00 00 00 00 49 45 4E 44 AE 42 60 82` 是一个**完全合法**的零长度 IEND chunk；而倒数十几字节里出现了 `6D 6D 75 72 67`（"mmurg"）和 `89`——那是 `grumm` 和签名被倒着写。

**结论：头合法、尾合法、中间非法。** 文件不是简单坏了，而是中间的内容被整体倒序，头尾各放了一段"正常字节"当包装。

### 3.2 定位真正的数据

两处证据：

```text
raw[8:20]          = 82 60 42 ae 44 4e 45 49 00 00 00 00
                      → 这是 IEND chunk 的逆序（"DNEI"）
raw[570057:570067] = 0a 1a 0a 0d 6d 6d 75 72 67 89
                      → 这是 89 'grumm' 0d 0a 1a 0a 的逆序
```

也就是说：

```text
grumm.grumm(570079) = [8 B 标准签名] + [reverse(M)（570059 B）] + [12 B 假 IEND]
M（570059 B）        = 一张 PNG，但签名里 "PNG" 被换成了 "grumm"
```

签名因此从 8 字节变成 `89 'grumm' 0D 0A 1A 0A` 共 10 字节，多出 2 字节——这也解释了为什么"改后缀名"打不开：文件里的签名本身就不是合法签名。

### 3.3 还原

```python
raw = open('grumm.grumm', 'rb').read()

mid = raw[8:-12]                     # 去掉 8 字节标准签名 + 12 字节假 IEND
M = mid[::-1]                        # 倒序回来
assert M[:1] == b'\x89' and M[1:6] == b'grumm'
assert M[6:10] == b'\r\n\x1a\n'

P = M[0:1] + b'PNG' + M[6:]          # grumm(5B) 换回 PNG(3B)
open('flag.png', 'wb').write(P)
```

结果：

```text
len(P) = 570057
sha256(P) = f1f4a5ea77f7819a166f4f69639a763d13d9638f31e32530bf0d1e80703f4f04
PIL: 2560×1600 RGB，正常打开
```

（本目录下的 `flag.png` 就是这一步的产物，哈希一致，可直接对比。）

### 3.4 图里的 flag

图片是一张夜景插画，上面用大字压着 flag，并有满屏重复水印和一行 `CONFIDENTIAL - DO NOT DISTRIBUTE`：

```text
PCTF{f337_70_h3@d}
```
![还原出来的 PNG，flag 压在夜景插画上](assets/img/ljn-nametag-flag.png)


## 4. 关键脚本

```python
# solve.py
import hashlib

raw = open('grumm.grumm', 'rb').read()

mid = raw[8:-12]                      # 去掉两端的包装
M = mid[::-1]                         # 倒序还原
assert M[:1] == b'\x89' and M[1:6] == b'grumm' and M[6:10] == b'\r\n\x1a\n'

P = M[0:1] + b'PNG' + M[6:]           # 签名修回 PNG
open('flag.png', 'wb').write(P)

print('len', len(P))
print('sha256', hashlib.sha256(P).hexdigest())

from PIL import Image
im = Image.open('flag.png'); im.load()
print(im.size, im.mode)
```

## 5. 踩坑记录

| 坑 | 现象 | 结论 |
| :--- | :--- | :--- |
| 直接改后缀名 | 打不开 | 文件里的签名是 `89 grumm…`，不是合法 PNG 签名 |
| 直接整体倒序 `data[::-1]` | 仍打不开 | 头部会多出 12 字节（倒序的 IEND），尾部多出 8 字节（倒序的签名） |
| 只去掉前 8 字节再倒序 | 仍打不开 | 尾部还留着 8 字节残留，且签名长度不对（多 2 字节） |
| 只把 `grumm` 改 `PNG` | 打不开 | 数据本身还是倒的，改签名没有意义 |
| 以为 IEND 只有一个 | 判断混乱 | 文件里有两个：末尾那个是真的包装，头部 `raw[8:20]` 是它的倒序 |

**一句话**：先确认"哪一段是数据、哪一段是包装"，再动手改字节。直接对所有字节做操作，很容易把包装也算进去。

## 6. Flag

```text
PCTF{f337_70_h3@d}
```
