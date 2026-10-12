"""
실제 캡처에서 오려 낸 줄(docs/private/ocrset/real, 정답 labels.json)에서 숫자·쉼표·'캐시' 조각과 바탕을 뽑는다.

메이플은 해상도마다 크기가 다른 픽셀 글꼴을 쓴다. 그래서 조각은 캡처마다 따로 모은다(합성할 때 한 줄은 한 캡처의 조각만 쓴다).
줄에서 밝은 세로 조각을 왼쪽부터 세어, 정답을 쉼표 넣어 쓴 글자 수만큼이 숫자 부분이고 나머지가 '캐시'다.
조각 수가 안 맞는 줄(글자가 붙었거나 끊긴 줄)은 버린다.
"""
import json
import os
import pickle
from collections import defaultdict

import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '../../docs/private/ocrset')
REAL = os.path.join(ROOT, 'real')


def runs(mask):
    out, s = [], None
    for i, m in enumerate(list(mask) + [False]):
        if m and s is None:
            s = i
        elif not m and s is not None:
            out.append((s, i))
            s = None
    return out


def main():
    labels = json.load(open(os.path.join(REAL, 'labels.json'), encoding='utf8'))
    bank = defaultdict(lambda: {'chars': defaultdict(list), 'cash': [], 'bg': [], 'gap': [], 'space': [], 'h': []})
    used = skipped = 0
    for name, val in labels.items():
        src = name.split('__')[0] + '__' + name.split('__')[1]
        a = np.asarray(Image.open(os.path.join(REAL, name)).convert('L')).astype(np.float32)
        bg = float(np.median(a))
        peak = float(np.percentile(a, 99.5))
        if peak - bg < 60:
            skipped += 1
            continue
        col = (a > bg + 0.45 * (peak - bg)).any(axis=0)
        segs = runs(col)
        text = f'{int(val):,}'
        n = len(text)
        if len(segs) < n + 1:
            skipped += 1
            continue
        num, rest = segs[:n], segs[n:]
        gaps = [num[i + 1][0] - num[i][1] for i in range(n - 1)]
        space = rest[0][0] - num[-1][1]
        # 숫자 사이보다 '캐시' 앞 띄어쓰기가 넓어야 제대로 센 것이다
        if gaps and space <= max(gaps):
            skipped += 1
            continue
        rows = np.where((a > bg + 0.45 * (peak - bg)).any(axis=1))[0]
        y0, y1 = int(rows[0]), int(rows[-1]) + 1
        b = bank[src]
        for ch, (p, q) in zip(text, num):
            b['chars'][ch].append(a[:, p:q].copy())
        b['cash'].append(a[:, rest[0][0]:rest[-1][1]].copy())
        b['gap'] += gaps
        b['space'].append(space)
        b['h'].append((y0, y1, a.shape[0]))
        # 바탕: 글자가 없는 왼쪽·오른쪽 끝
        if num[0][0] >= 3:
            b['bg'].append(a[:, :num[0][0]].copy())
        if a.shape[1] - rest[-1][1] >= 3:
            b['bg'].append(a[:, rest[-1][1]:].copy())
        used += 1
    out = {}
    for src, b in bank.items():
        out[src] = {'chars': {k: v for k, v in b['chars'].items()}, 'cash': b['cash'], 'bg': b['bg'],
                    'gap': b['gap'], 'space': b['space'], 'h': b['h']}
        print(src.ljust(36), 'rows', len(b['h']), 'chars', ''.join(sorted(b['chars'])), 'gap', np.median(b['gap']) if b['gap'] else '-',
              'space', np.median(b['space']), 'height', b['h'][0][2])
    pickle.dump(out, open(os.path.join(ROOT, 'bank.pkl'), 'wb'))
    print('used', used, 'skipped', skipped)


if __name__ == '__main__':
    main()
