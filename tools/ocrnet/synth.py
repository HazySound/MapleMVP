"""
숫자 조각(bank.pkl)을 이어 붙여 툴팁 한 줄을 만들고, 캡처마다 달라지는 것들로 일부러 망가뜨린다.

망가뜨리는 것: 크기(0.55~1.8배, 확대·축소 방식 여러 가지), 흐림, 밝기·대비·감마, 화면을 통째로 밝게 보정(HDR),
JPEG 압축, 잡음, 위아래·좌우 여백. 정답은 숫자만(쉼표 없이) 쓴다. '캐시'는 읽지 않게 가르친다.
"""
import io
import random

import numpy as np
from PIL import Image, ImageFilter

FILTERS = [Image.NEAREST, Image.BILINEAR, Image.BICUBIC, Image.LANCZOS, Image.BOX]


def group_of(src):
    """글꼴 크기 묶음: '캐시' 앞 띄어쓰기 폭으로 가른다"""
    sp = float(np.median(src['space']))
    return 0 if sp < 7.5 else 1 if sp < 10.5 else 2


def value():
    r = random.random()
    if r < 0.30:
        return 0
    if r < 0.62:
        return int(10 ** random.uniform(2, np.log10(2_500_000))) // 100 * 100
    if r < 0.77:
        return int(10 ** random.uniform(1, np.log10(2_500_000))) // 10 * 10
    if r < 0.93:
        return int(10 ** random.uniform(0, np.log10(2_500_000)))
    return int(10 ** random.uniform(5, 7))


class Synth:
    def __init__(self, bank, sources):
        self.bank = {k: bank[k] for k in sources}
        self.keys = list(self.bank)
        self.groups = {}
        for k, s in self.bank.items():
            self.groups.setdefault(group_of(s), []).append(k)

    def glyph(self, key, ch, h):
        s = self.bank[key]
        pool = s['chars'].get(ch)
        if not pool:
            # 이 캡처에 없는 숫자는 같은 글꼴 묶음의 다른 캡처에서 빌린다
            alts = [k for k in self.groups[group_of(s)] if self.bank[k]['chars'].get(ch)]
            if not alts:
                alts = [k for k in self.keys if self.bank[k]['chars'].get(ch)]
            pool = self.bank[random.choice(alts)]['chars'][ch]
        g = random.choice(pool)
        if g.shape[0] != h:
            g = np.asarray(Image.fromarray(g.astype(np.uint8)).resize((max(1, round(g.shape[1] * h / g.shape[0])), h), Image.BILINEAR)).astype(np.float32)
        return g

    def line(self):
        key = random.choice(self.keys)
        s = self.bank[key]
        v = value()
        text = f'{v:,}'
        h = s['h'][0][2]
        parts, gaps = [], []
        for ch in text:
            parts.append(self.glyph(key, ch, h))
            gaps.append(int(random.choice(s['gap'] or [1])))
        cash = random.random() > 0.12
        space = int(np.median(s['space'])) + random.randint(-1, 1)
        left, right = random.randint(1, 18), random.randint(1, 40)
        width = left + sum(p.shape[1] for p in parts) + sum(gaps[:-1]) + right
        cash_img = None
        if cash:
            cash_img = random.choice(s['cash'])
            if cash_img.shape[0] != h:
                cash_img = np.asarray(Image.fromarray(cash_img.astype(np.uint8)).resize((max(1, round(cash_img.shape[1] * h / cash_img.shape[0])), h))).astype(np.float32)
            if random.random() < 0.15:   # 오른쪽이 잘린 '캐시'
                cash_img = cash_img[:, :max(2, int(cash_img.shape[1] * random.uniform(0.3, 0.9)))]
            width += space + cash_img.shape[1]
        canvas = self.background(s, h, width)
        x = left
        for p, gp in zip(parts, gaps):
            canvas[:, x:x + p.shape[1]] = np.maximum(canvas[:, x:x + p.shape[1]], p)
            x += p.shape[1] + gp
        if cash:
            x += space - gaps[-1]
            canvas[:, x:x + cash_img.shape[1]] = np.maximum(canvas[:, x:x + cash_img.shape[1]], cash_img)
        return self.clutter(canvas), str(v)

    def clutter(self, c):
        """툴팁은 반투명이라 뒤 게임 화면 글자가 희미하게 비치고, 테두리가 밝은 세로줄로 들어온다. 읽지 않게 가르친다"""
        h, w = c.shape
        base = float(np.median(c))
        for _ in range(random.choice([0, 0, 1, 2, 3])):
            src = self.bank[random.choice(self.keys)]
            pool = random.choice([src['cash']] + [v for v in src['chars'].values()])
            g = random.choice(pool)
            k = random.uniform(0.6, 1.4)
            g = np.asarray(Image.fromarray(g.astype(np.uint8)).resize((max(1, round(g.shape[1] * k)), max(2, round(g.shape[0] * k))))).astype(np.float32)
            gy = random.randint(-g.shape[0] // 2, h - g.shape[0] // 2)
            gx = random.randint(-g.shape[1] // 2, w - 1)
            a = random.uniform(0.08, 0.4)
            ys, ye = max(0, gy), min(h, gy + g.shape[0])
            xs, xe = max(0, gx), min(w, gx + g.shape[1])
            if ye <= ys or xe <= xs:
                continue
            patch = g[ys - gy:ye - gy, xs - gx:xe - gx]
            lift = np.clip(patch - np.median(g), 0, None) * a
            c[ys:ye, xs:xe] = np.maximum(c[ys:ye, xs:xe], base + lift)
        if random.random() < 0.15:
            x = random.choice([random.randint(0, 3), random.randint(max(0, w - 4), w - 1)])
            c[:, x:x + random.randint(1, 3)] = random.uniform(120, 255)
        return c

    def background(self, s, h, w):
        if s['bg'] and random.random() < 0.7:
            b = random.choice(s['bg'])
            if b.shape[0] != h:
                b = np.asarray(Image.fromarray(b.astype(np.uint8)).resize((b.shape[1], h))).astype(np.float32)
            reps = int(np.ceil(w / b.shape[1]))
            b = np.tile(b, (1, reps))[:, :w]
            return b.copy()
        lvl = random.uniform(30, 75)
        grad = np.linspace(0, random.uniform(-12, 12), w)[None, :]
        return np.clip(lvl + grad + np.random.normal(0, 2, (h, w)), 0, 255).astype(np.float32)


def degrade(a):
    """캡처마다 달라지는 것들"""
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    h, w = a.shape
    k = random.uniform(0.55, 1.8)
    ka = k * random.uniform(0.92, 1.08)
    img = img.resize((max(4, round(w * ka)), max(6, round(h * k))), random.choice(FILTERS))
    if random.random() < 0.25:   # 한 번 줄였다 키우기(화면공유·창 크기 바꿈)
        f = random.uniform(0.6, 0.9)
        w2, h2 = img.size
        img = img.resize((max(4, round(w2 * f)), max(6, round(h2 * f))), random.choice(FILTERS)).resize((w2, h2), random.choice(FILTERS))
    if random.random() < 0.35:
        img = img.filter(ImageFilter.GaussianBlur(random.uniform(0.3, 1.1)))
    x = np.asarray(img).astype(np.float32)
    r = random.random()
    if r < 0.18:   # 화면을 통째로 밝게(HDR): 바탕이 뜨고 밝은 곳이 꽉 찬다
        x = x * random.uniform(1.1, 1.45) + random.uniform(15, 60)
    elif r < 0.6:
        x = x * random.uniform(0.6, 1.3) + random.uniform(-25, 35)
    if random.random() < 0.3:
        g = random.uniform(0.7, 1.45)
        x = 255 * (np.clip(x, 0, 255) / 255) ** g
    x = np.clip(x + np.random.normal(0, random.uniform(0, 5), x.shape), 0, 255)
    if random.random() < 0.35:
        buf = io.BytesIO()
        Image.fromarray(x.astype(np.uint8)).save(buf, 'JPEG', quality=random.randint(30, 95))
        x = np.asarray(Image.open(buf)).astype(np.float32)
    # 위아래 여백을 조금 바꾼다(표 줄을 잘라 내는 자리가 매번 조금씩 다르다)
    hh = x.shape[0]
    t, b = random.randint(0, max(0, hh // 7)), random.randint(0, max(0, hh // 7))
    x = x[t:hh - b] if hh - t - b >= 6 else x
    return x
