---
title: [MISC] 小灰灰的情感故事（1）-小灰灰的礼物
date: 2026-11-25
tags: [CTF, PCTF2026, MISC]
description: JPEG 尾部挂 ZIP、伪加密判定、空口令 steghide、emoji 编码，四层嵌套一路拆到底。
---
## 1. 题目信息

| 字段 | 内容 |
| :--- | :--- |
| 赛事/平台 | PCTF 2026 |
| 分类/难度 | Misc / 2.5 |
| 附件 | `flag.jpg`（2048×1280，179430 B，sha256 `366129a8…`） |
| 环境 | Kali Linux、Python 3、steghide |
| 解题用时 | 约 1.5 小时（不含口令枚举的等待时间） |

题面：小灰灰送你的礼物，看看有什么秘密吧。

## 2. 考点分析

一句话核心考点：**文件格式的边界、结构，以及边界之外的数据。**

展开成两条：

1. 解析器只认自己定义的边界。JPEG 的边界是 `FFD9`（EOI），解码器读到就停，后面的字节与画面无关；ZIP 的边界是 EOCD，其 comment 字段可以再塞一段文案。**知道格式"结束在哪"，才知道该往哪找。**
2. 加密数据只能靠可验证的判定下结论。口令不是"看起来像"就是对的，必须过 `inflate + 长度 + CRC` 三道；真加密与伪加密的分界，也只能靠"能不能 inflate"来定。

## 3. 解题过程

### 3.1 初步观察

包中只有一张图片，打开以后没有任何关于 flag 的信息。先做静态检查：

```bash
file flag.jpg
# JPEG image data, JFIF standard 1.01, baseline, precision 8, 2048x1280, components 3

sha256sum flag.jpg
# 366129a89b2d94a9d41902edcc3100b5e81fbbf73ec0972b08a562d07a84e312
```

### 3.2 发现尾部数据

图片题的性价比最高的一步是看文件尾，而不是先跑 LSB 或各种隐写工具。JPEG 解码器读到 EOI 就停止，**EOI 之后挂什么都不会影响预览**。

```bash
python3 -c "
d = open('flag.jpg','rb').read()
e = d.rfind(b'\xff\xd9')
print('size', len(d), 'EOI', e, 'after', len(d)-e-2)"
```

```text
size 179430 EOI 178951 after 477
```

`rfind` 而不是 `find`：EXIF 缩略图里也可能有 `FFD9`，熵编码段的 `FF` 还会被转义成 `FF00`，第一次出现的位置不可靠。

接着看这 477 字节：

```bash
tail -c 480 flag.jpg | xxd | head -3
```

```text
00000000: 01 ff d9 50 4b 03 04 0a 00 00 00 00 00 a4 a8 56 5d  ...PK........V]
```

`ff d9` 之后紧跟 `50 4b 03 04`，也就是 `PK\x03\x04` —— **ZIP 本地文件头**。ZIP 起点为 `178951+2 = 178953`。

```bash
dd if=flag.jpg of=/tmp/hint.zip bs=1 skip=178953
unzip -l /tmp/hint.zip
```

```text
        0  2026-10-22 21:05   hint/
       90  2026-10-22 21:05   hint/hint.txt
```

### 3.3 ZIP 结构与伪加密判定

`unzip -l` 的输出里有一行乱码，那是 **ZIP 归档注释**（EOCD 的 comment 字段）。EOCD 在 179330，22 字节，注释长 78 字节，正好 `179330+22+78 = 179430` = 文件末尾。

```bash
tail -c 78 flag.jpg | iconv -f gb18030 -t utf-8
```

> 什么？你说你不知道密码？密码就是小灰灰的生日呀，你说你忘记了？自己想去吧。。。。

`zipinfo -v` 给出加密相关的字段：

```text
hint/hint.txt:  encrypted, deflated, 101 compressed, 90 uncompressed
  general purpose flag:    0x0009  (bit0=加密, bit3=data descriptor)
  CRC-32:                  d4c09d8b
```

101 → 90 的压缩比说明内容不是空文件；flags bit0 置位说明要真口令。

**伪加密必须排除**，三组对照，缺一不可：

1. 对密文直接 raw inflate → `Error -3 ... invalid code lengths set`，真被加密；
2. 把本地头与中心目录的 flags bit0 清掉后再读 → 同样 `invalid code lengths set`，不是"只改标志位"的伪加密；
3. 用错误口令走 `zipfile` → `Bad password`，标准 ZipCrypto。

### 3.4 口令：从"语义"转向"格式"

提示说密码是"小灰灰的生日"。小灰灰是《喜羊羊与灰太狼》里的角色，公开资料给的生日是**羊历 3513 年 10 月 1 日**，试遍 `35131001`、`3513-10-01`、`3513年10月1日` 等写法，全部无效。题面本身也没有任何日期信息。

转折点：**"生日"在密码里最常见的写法是 `MMDD`，不是完整日期。** 按"月+日"做受限空间枚举，覆盖 `1118`、`11-18`、`11.18`、`11月18日` 等格式：

```text
*** HIT *** '1118'
tested 1892722  hits 2   (218 s)
```

判定标准只有一条：`解密 → zlib.decompress(-15) → len == 90 → CRC == d4c09d8b`。

> **踩坑**：ZIP 的 flags 含 bit3 时，正确口令解出的第 12 字节是 **DOS 时间高字节**（本题 `0xa8`），不是 CRC 高字节（`0xd4`）。任何用 CRC 高字节做预过滤的写法都会把正确口令直接拒掉；而 check byte 本身还有 1/256 的假阳性。**只有 inflate + CRC 全对才算命中。**

解出来：

```bash
unzip -P 1118 /tmp/hint.zip -d /tmp/hint_out
cat /tmp/hint_out/hint/hint.txt
```

> 小灰灰说，她给这张照片设了个密码，但是是空的，这是什么意思？

### 3.5 第二层：steghide 空口令

"给照片设了个密码，但是是空的"——指向 **steghide**（JPEG 系数域隐写，支持空口令）。

```bash
steghide info flag.jpg          # 口令处直接回车
```

```text
embedded file "secret.txt":
  size: 214.0 Byte
  encrypted: rijndael-128, cbc
  compressed: yes
```

```bash
steghide extract -sf flag.jpg -p '' -xf /tmp/secret.txt
cat /tmp/secret.txt
```

```text
小灰灰不会那么轻易的给你flag的，哈哈哈哈~~
🍐🍃🍔🍆🏯🎽🎛🍸🍨🍨🍟🍡🌱🌱🍟🍦🍀🍭🍩🌱🍹🍟🍨🍀🌳🍟🍢🌳🌳🍮🍟🌴🌰🌰🌫🏯🎽🎝
```

### 3.6 emoji 编码

观察码位：`🍐`=U+1F350、`🍃`=U+1F343、`🍔`=U+1F354、`🍆`=U+1F346。

```text
0x1F350 - 0x1F300 = 0x50 = 'P'
0x1F343 - 0x1F300 = 0x43 = 'C'
0x1F354 - 0x1F300 = 0x54 = 'T'
0x1F346 - 0x1F300 = 0x46 = 'F'
```

规律成立：**每个 emoji 的码位 = `0x1F300` + 一个 UTF-8 字节**。38 个 emoji 即 38 字节，拼起来按 UTF-8 解码：

```python
s = open('/tmp/secret.txt', encoding='utf-8').read().strip().splitlines()[-1]
print(bytes(ord(c) - 0x1F300 for c in s).decode('utf-8'))
```

字节流：

```text
50 43 54 46 | ef bd 9b | 78 68 68 5f ... 2b | ef bd 9d
P  C  T  F  |   ｛      |  xhh_...        +  |   ｝
```

`EF BD 9B` 与 `EF BD 9D` 是**全角**的 `｛`、`｝`（U+FF5B / U+FF5D），说明出题人是在中文输入法状态下打的括号。

### 3.7 走过的弯路

- **视觉找提示**：猜"这款刻着你的八字""它干净无染"是线索，实际只是皮肤文案。裁剪放大枪身、机匣橙色印记、白色贴纸、8×8 分块 CLAHE、灰度反相，全部无可读文字。
- **像素层**：位平面、LSB、R-B / G-B 通道差、autocontrast、equalize，均无隐藏文字。这题不在像素里。
- **纯数字爆破**：1–7 位（117 s）、8 位 1 亿（147 s）、9 位 10 亿（2808 s）全部零命中，纯数字 ≤9 位可以彻底排除。
- **完整日期全空间**：1900–2027 × 13 种写法 = 951,624 个，零命中；中文日期、农历写法、昵称组合 2200+ 个也全部零命中。
- **外部情报**：出题者博客、PolarCTF 往届 wp、羊历年表都查过，没有可用信息。

## 4. 关键脚本

### 4.1 尾部 ZIP 解析 + 密文提取

```python
import struct

d = open('flag.jpg', 'rb').read()
z = d.rfind(b'PK\x03\x04')
print('zip start', z, '/', len(d))

(sig, ver, flags, method, mtime, mdate,
 crc, csize, usize, nlen, elen) = struct.unpack('<IHHHHHIIIHH', d[z:z+30])
name = d[z+30:z+30+nlen].decode()
dataoff = z + 30 + nlen + elen          # 长度必须取本地头，不能用 ZipInfo.extra
print(f'{name} flags={flags:#06x} method={method} '
      f'crc={crc:#010x} csize={csize} usize={usize} dataoff={dataoff}')

open('/tmp/hint_enc.bin', 'wb').write(d[dataoff:dataoff+csize])
```

### 4.2 ZipCrypto 解密与严格校验

```python
import zlib, binascii

def _table():
    t = []
    for i in range(256):
        c = i
        for _ in range(8):
            c = (c >> 1) ^ (0xEDB88320 if c & 1 else 0)
        t.append(c)
    return t

T = _table()

class ZipCrypto:
    def __init__(self, pw: bytes):
        self.k = [305419896, 591751049, 878082192]
        for b in pw:
            self.update(b)

    def update(self, b):
        k0, k1, k2 = self.k
        k0 = ((k0 >> 8) ^ T[(k0 ^ b) & 0xff]) & 0xffffffff
        k1 = ((k1 + (k0 & 0xff)) * 134775813 + 1) & 0xffffffff
        k2 = ((k2 >> 8) ^ T[(k2 ^ (k1 >> 24)) & 0xff]) & 0xffffffff
        self.k = [k0, k1, k2]

    def decrypt(self, data: bytes) -> bytes:
        out = bytearray()
        for c in data:
            t = (self.k[2] | 2) & 0xffff
            p = (c ^ (((t * (t ^ 1)) >> 8) & 0xff)) & 0xff
            self.update(p)              # 用解出的明文字节更新密钥
            out.append(p)
        return bytes(out)

def try_password(pw, enc, crc, usize):
    z = ZipCrypto(pw)
    z.decrypt(enc[:12])                 # 12 字节加密头
    body = z.decrypt(enc[12:])
    try:
        out = zlib.decompress(body, -15)
    except zlib.error:
        return None
    if len(out) == usize and (binascii.crc32(out) & 0xffffffff) == crc:
        return out
    return None

enc = open('/tmp/hint_enc.bin', 'rb').read()
print(try_password(b'1118', enc, 0xd4c09d8b, 90))
```

### 4.3 emoji 解码

```python
s = open('/tmp/secret.txt', encoding='utf-8').read().strip().splitlines()[-1]
print(bytes(ord(c) - 0x1F300 for c in s).decode('utf-8'))
```

## 5. 踩坑记录

| 坑 | 现象 | 结论 |
| :--- | :--- | :--- |
| check byte 预过滤 | 正确口令被判 miss | bit3 时第 12 字节是 DOS 时间高字节，只能 inflate+CRC 判定 |
| `ZipInfo.extra` 取长度 | dataoff 偏 36 字节，解出乱码 | extra 来自中心目录，长度须读本地头 |
| 副本文件 | 同哈希，疑似双图差分 | 本地备份，排除 |
| 羊历生日 | 各种写法全 miss | 公开设定不是题目线索 |
| 纯数字爆破 | ≤9 位全灭 | 但不能因此排除"受限数字空间"（MMDD） |
| 视觉增强 | 全部无字 | 该图不靠像素藏数据 |

## 6. Flag

```text
PCTF{xhh_a11_f@mi1y_h@3_b33n_400+}
```
