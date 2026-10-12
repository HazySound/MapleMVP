"""
정답이 있는 캡처를 통째로 망가뜨린 사본(docs/private/ocrset/degraded)을 만든다. 지금 판독기와 새 판독기를 같은 시험지로 견준다.
"""
import io
import json
import os

import numpy as np
from PIL import Image, ImageFilter

P = os.path.join(os.path.dirname(__file__), '../../docs/private')
OUT = os.path.join(P, 'ocrset/degraded')


def jpeg(im, q):
    b = io.BytesIO()
    im.save(b, 'JPEG', quality=q)
    return Image.open(b).convert('RGB')


def point(im, f):
    return im.point([max(0, min(255, round(f(v)))) for v in range(256)] * 3)


WAYS = {
    'small75': lambda im: im.resize((round(im.width * .75), round(im.height * .75)), Image.BICUBIC),
    'big130': lambda im: im.resize((round(im.width * 1.3), round(im.height * 1.3)), Image.BILINEAR),
    'blur': lambda im: im.filter(ImageFilter.GaussianBlur(0.8)),
    'hdr': lambda im: point(im, lambda v: v * 1.22 + 36),
    'dark': lambda im: point(im, lambda v: v * 0.7),
    'jpeg40': lambda im: jpeg(im, 40),
    'gamma': lambda im: point(im, lambda v: 255 * (v / 255) ** 1.4),
    'mix': lambda im: jpeg(im.resize((round(im.width * .85), round(im.height * .85)), Image.BILINEAR).filter(ImageFilter.GaussianBlur(0.5)), 60),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    labels = json.load(open(os.path.join(P, 'ocrset/real/labels.json'), encoding='utf8'))
    caps = sorted({tuple(n.split('__')[:2]) for n in labels})
    for d, f in caps:
        src = os.path.join(P, d, f + '.png')
        im = Image.open(src).convert('RGB')
        for k, fn in WAYS.items():
            fn(im).save(os.path.join(OUT, f'{d}__{f}__{k}.png'))
    print(len(caps), 'captures x', len(WAYS))


if __name__ == '__main__':
    main()
