---
title: [Crypto] it is so easy
date: 2026-11-25
tags: [CTF, PCTF2026, Crypto]
description: 六个长度递减的词表拼成一串，把词长当六进制位折回 ASCII。附完整脚本、反向验证与踩坑记录。
---
## 1. 题目信息

| 字段 | 内容 |
| :--- | :--- |
| 赛事/平台 | PCTF 2026 |
| 分类/难度 | Crypto / — |
| 附件 | `soeasy.txt`（179 B，sha256 `a17dad00…`） |
| 环境 | Python 3 |
| 题面 | soeasy, oeasy, easy, asy, sy, y 长度分别为 654321 |

## 2. 考点分析

一句话核心考点：**别把词当词，把它当一个数位。**

展开成三条：

1. 六个词的"身份"不是字母内容，而是**长度**：6、5、4、3、2、1，减 1 正好是 0–5，等价于六进制的一位数字。
2. 三个六进制位能表示 0–215，**刚好覆盖可打印 ASCII**。所以每 3 个词一组，直接换算成字符。
3. 词表是嵌套后缀关系（`soeasy` 包含 `easy` 包含 `asy` 包含 `sy` 包含 `y`），分词必须**长词优先**，否则会切错位。

## 3. 解题过程

### 3.1 观察

```bash
file soeasy.txt
# ASCII text
wc -c soeasy.txt
# 180
```

文件只有 179 个有效字节（180 里含一个结尾换行），内容从头到尾只由 6 种词反复组成。题面给的 "长度分别为 654321" 就是词表顺序，也是唯一的提示。

### 3.2 分词

贪心切分，词表按长度**降序**排列：

```python
WORDS = ['soeasy', 'oeasy', 'easy', 'asy', 'sy', 'y']   # 长度 6..1

s = open('soeasy.txt').read().strip()
toks, i = [], 0
while i < len(s):
    for w in WORDS:
        if s.startswith(w, i):
            toks.append(w)
            i += len(w)
            break
    else:
        raise ValueError(f'切不动: {s[i:i+10]!r}')

assert ''.join(toks) == s       # 没有丢字节
print(len(toks))                # 54
```

54 个词 → 54 / 3 = 18 个字符，长度和 flag 对得上。

### 3.3 解码

```python
digits = [len(w) - 1 for w in toks]          # 0..5

flag = ''.join(
    chr(digits[j] * 36 + digits[j + 1] * 6 + digits[j + 2])
    for j in range(0, len(toks), 3)
)
print(flag)
```

权重 36、6、1 就是六进制的百位、十位、个位。前 12 个词：

```text
asy sy asy | sy soeasy sy | asy asy y | sy soeasy oeasy
 2  1  2  |  1   5    1  |  2  2  0  |  1   5    4
   2*36+1*6+2 = 80 'P'  ...  'C'  'T'  'F'
```

开头正好是 `PCTF`，说明位序和解法都对。

### 3.4 反向验证

光看输出像 flag 还不够——分词错位也可能拼出"看着像"的乱码。所以把 flag 反编码回原文做对照：

```python
def encode(text):
    out = []
    for c in text:
        n = ord(c)
        out += [WORDS[5 - n // 36], WORDS[5 - (n // 6) % 6], WORDS[5 - n % 6]]
    return ''.join(out)

assert encode(flag) == s
```

反编码结果与 `soeasy.txt` 完全一致 → 分词与映射同时被验证，闭环。

### 3.5 结果

18 个字符，正好是一个标准 flag：

```text
PCTF{17_15_S03@5y}
```

## 4. 关键脚本

```python
# solve.py
WORDS = ['soeasy', 'oeasy', 'easy', 'asy', 'sy', 'y']

s = open('soeasy.txt').read().strip()

# 1) 长词优先分词
toks, i = [], 0
while i < len(s):
    for w in WORDS:
        if s.startswith(w, i):
            toks.append(w); i += len(w); break
    else:
        raise ValueError(s[i:i+10])
assert ''.join(toks) == s

# 2) 词长-1 = 六进制位，三位一组转 ASCII
digits = [len(w) - 1 for w in toks]
flag = ''.join(chr(digits[j]*36 + digits[j+1]*6 + digits[j+2])
               for j in range(0, len(toks), 3))
print('FLAG:', flag)

# 3) roundtrip 校验
def encode(text):
    out = []
    for c in text:
        n = ord(c)
        out += [WORDS[5 - n // 36], WORDS[5 - (n // 6) % 6], WORDS[5 - n % 6]]
    return ''.join(out)

print('roundtrip:', encode(flag) == s)
```

## 5. 踩坑记录

| 坑 | 现象 | 结论 |
| :--- | :--- | :--- |
| 短词优先分词 | `soeasy` 被切成 `sy`+`oeasy` 之类，后面全部错位 | 词表必须按长度降序 |
| 把长度直接当数字 | 用了 1–6，`chr` 算出不可打印字符 | 数字 = 长度 − 1 |
| 权重顺序写反 | 6 进制按低位在前算，字符全乱 | 权重 36、6、1（高位在前） |
| 不做 roundtrip | 切分错了也会输出一串"像 flag"的乱码，误以为成功 | 反编码对比原文才算验证 |
| `wc -c` 得 180 | 与"179 字节"对不上 | 差的是结尾换行，`strip()` 后处理 |

## 6. Flag

```text
PCTF{17_15_S03@5y}
```
