"""
툴팁 한 줄을 통째로 읽는 작은 모델(합성곱 + CTC)을 학습한다.

입력: 회색 줄 그림을 높이 32로 맞춘 것(밝기는 줄마다 아래 1%~위 0.5%를 0~1로). 출력: 가로 4칸마다 '빈칸·0~9' 중 하나.
브라우저에서 직접 돌리려고 합성곱·최대풀링·ReLU만 쓴다(배치정규화는 내보낼 때 합성곱에 접어 넣는다).

  python train.py --hold icarus__ingame,hawkeye__ingame,...   # 그 캡처들은 학습에서 빼고 시험에만
  python train.py --out model.pt                               # 모든 캡처로
"""
import argparse
import json
import os
import pickle
import random
import time

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image
from torch.utils.data import DataLoader, IterableDataset

from synth import Synth, degrade

ROOT = os.path.join(os.path.dirname(__file__), '../../docs/private/ocrset')
H = 32
MAXW = 384
CLASSES = 11   # 0 = 빈칸, 1~10 = 숫자 0~9


def prep(a):
    """회색 줄 → 높이 32, 밝기 0~1. 브라우저 쪽(ocrnet.ts)과 똑같아야 한다"""
    a = np.asarray(a, dtype=np.float32)
    h, w = a.shape
    nw = max(8, min(MAXW, round(w * H / h)))
    x = np.asarray(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).resize((nw, H), Image.BILINEAR)).astype(np.float32)
    lo, hi = np.percentile(x, 1), np.percentile(x, 99.5)
    return np.clip((x - lo) / max(16.0, hi - lo), 0, 1)


class Net(nn.Module):
    def __init__(self):
        super().__init__()
        def block(i, o, k=3, p=1):
            return nn.Sequential(nn.Conv2d(i, o, k, padding=p, bias=False), nn.BatchNorm2d(o), nn.ReLU(inplace=True))
        self.f = nn.Sequential(
            block(1, 32), nn.MaxPool2d(2),            # 16
            block(32, 64), nn.MaxPool2d(2),           # 8
            block(64, 96), block(96, 96), nn.MaxPool2d((2, 1)),   # 4
            block(96, 128), nn.MaxPool2d((2, 1)),     # 2
            block(128, 128, (2, 3), (0, 1)),          # 1
        )
        self.head = nn.Conv2d(128, CLASSES, 1)

    def forward(self, x):          # x: (N, 1, 32, W)
        y = self.head(self.f(x))   # (N, C, 1, W/4)
        return y.squeeze(2).permute(2, 0, 1)   # (T, N, C)


class Stream(IterableDataset):
    """합성 줄. 20%는 금액이 아닌 열('1 주차 뒤'·날짜·등급 이름)의 실제 줄을 망가뜨려 빈 답으로 섞는다.
    그런 열도 숫자처럼 읽으면 금액 열을 잘못 고른다(비교 시험에서 '12, 22, 32…'로 읽힌 주차 열이 뽑혔다)"""
    def __init__(self, bank, sources, negatives):
        self.bank, self.sources, self.negatives = bank, sources, negatives

    def __iter__(self):
        info = torch.utils.data.get_worker_info()
        seed = (info.id if info else 0) * 9973 + int(time.time() * 1000) % 100000
        random.seed(seed)
        np.random.seed(seed % (2 ** 32))
        s = Synth(self.bank, self.sources)
        while True:
            if self.negatives and random.random() < 0.2:
                yield prep(degrade(random.choice(self.negatives))), ''
                continue
            a, t = s.line()
            yield prep(degrade(a)), t


def collate(batch):
    w = max(x.shape[1] for x, _ in batch)
    w = (w + 3) // 4 * 4
    xs = np.zeros((len(batch), 1, H, w), np.float32)
    for i, (x, _) in enumerate(batch):
        xs[i, 0, :, :x.shape[1]] = x
        xs[i, 0, :, x.shape[1]:] = x[:, -1:]   # 오른쪽은 끝 열을 늘려 채운다
    tg = [torch.tensor([int(c) + 1 for c in t], dtype=torch.long) for _, t in batch]
    return torch.from_numpy(xs), torch.cat(tg), torch.tensor([len(t) for t in tg]), [t for _, t in batch]


def decode(logits):
    """가장 그럴듯한 칸을 이어 읽고, 같은 것이 이어지면 하나로, 빈칸은 뺀다"""
    best = logits.argmax(-1).T.cpu().numpy()   # (N, T)
    out = []
    for row in best:
        s, prev = [], 0
        for c in row:
            if c != prev and c != 0:
                s.append(str(c - 1))
            prev = c
        out.append(''.join(s))
    return out


def real_set(names_filter):
    labels = json.load(open(os.path.join(ROOT, 'real/labels.json'), encoding='utf8'))
    out = []
    for n, v in labels.items():
        src = '__'.join(n.split('__')[:2])
        if names_filter(src):
            out.append((np.asarray(Image.open(os.path.join(ROOT, 'real', n)).convert('L')).astype(np.float32), v, src))
    return out


@torch.no_grad()
def evaluate(net, rows, dev, aug=0):
    net.eval()
    rng = random.getstate(), np.random.get_state()
    random.seed(7)
    np.random.seed(7)
    ok = tot = 0
    bad = []
    for rep in range(max(1, aug)):
        for i in range(0, len(rows), 64):
            chunk = rows[i:i + 64]
            batch = [(prep(degrade(a) if aug else a), v) for a, v, _ in chunk]
            x, _, _, _ = collate(batch)
            pred = decode(net(x.to(dev)))
            for p, (a, v, src) in zip(pred, chunk):
                tot += 1
                if p == v:
                    ok += 1
                elif len(bad) < 12:
                    bad.append(f'{src}:{v}->{p}')
    random.setstate(rng[0])
    np.random.set_state(rng[1])
    net.train()
    return ok / max(1, tot), tot, bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--hold', default='')
    ap.add_argument('--steps', type=int, default=30000)
    ap.add_argument('--out', default=os.path.join(ROOT, 'model.pt'))
    args = ap.parse_args()
    hold = set(filter(None, args.hold.split(',')))
    bank = pickle.load(open(os.path.join(ROOT, 'bank.pkl'), 'rb'))
    # 같은 캡처를 복사해 둔 것(zero0·zero2)은 zero와 같이 다룬다
    base = lambda s: s.replace('zero0', 'zero').replace('zero2', 'zero')
    train_src = [k for k in bank if base(k) not in hold]
    dev = 'cuda' if torch.cuda.is_available() else 'cpu'
    net = Net().to(dev)
    print('params', sum(p.numel() for p in net.parameters()), 'train sources', len(train_src), 'hold', sorted(hold))
    test_rows = real_set(lambda s: base(s) in hold) if hold else []
    seen_rows = real_set(lambda s: base(s) not in hold)
    neg_all = json.load(open(os.path.join(ROOT, 'real/negatives.json'), encoding='utf8'))
    negs = [np.asarray(Image.open(os.path.join(ROOT, 'real', n)).convert('L')).astype(np.float32)
            for n in neg_all if base('__'.join(n.split('__')[:2])) not in hold]
    neg_test = [(np.asarray(Image.open(os.path.join(ROOT, 'real', n)).convert('L')).astype(np.float32), '', '__'.join(n.split('__')[:2]))
                for n in neg_all if base('__'.join(n.split('__')[:2])) in hold]
    print('negatives train', len(negs), 'test', len(neg_test))
    dl = DataLoader(Stream(bank, train_src, negs), batch_size=128, num_workers=10, collate_fn=collate, persistent_workers=True, prefetch_factor=4)
    opt = torch.optim.AdamW(net.parameters(), lr=2e-3, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=2e-3, total_steps=args.steps, pct_start=0.05)
    ctc = nn.CTCLoss(blank=0, zero_infinity=True)
    t0 = time.time()
    for step, (x, tg, tl, _) in enumerate(dl, 1):
        x = x.to(dev)
        y = net(x).log_softmax(-1)
        il = torch.full((x.shape[0],), y.shape[0], dtype=torch.long)
        loss = ctc(y, tg, il, tl)
        opt.zero_grad()
        loss.backward()
        nn.utils.clip_grad_norm_(net.parameters(), 5)
        opt.step()
        sched.step()
        if step % 2000 == 0 or step == args.steps:
            msg = f'step {step} loss {loss.item():.4f} {time.time() - t0:.0f}s'
            if test_rows:
                acc, n, bad = evaluate(net, test_rows, dev)
                acc2, n2, _ = evaluate(net, test_rows, dev, aug=4)
                msg += f' | 처음 보는 캡처 {acc:.4f}({n}) 망가뜨린 사본 {acc2:.4f}({n2}) {bad[:6]}'
                if neg_test:
                    accn, nn_, badn = evaluate(net, neg_test, dev)
                    msg += f' | 처음 보는 비금액 열 {accn:.4f}({nn_}) {badn[:3]}'
            acc3, n3, bad3 = evaluate(net, seen_rows, dev)
            msg += f' | 학습 캡처 {acc3:.4f}({n3}) {bad3[:4]}'
            print(msg, flush=True)
        if step >= args.steps:
            break
    torch.save(net.state_dict(), args.out)
    print('saved', args.out)


if __name__ == '__main__':
    main()
