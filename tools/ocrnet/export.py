"""
학습한 모델을 브라우저에서 쓰는 JSON(frontend/src/lib/core/ocrnet.weights.json)으로 내보낸다.
배치정규화는 바로 앞 합성곱에 접어 넣고, 숫자는 float16을 base64로 담는다.

  python export.py ../../docs/private/ocrset/model.pt
"""
import base64
import json
import os
import sys

import numpy as np
import torch

from train import CLASSES, H, MAXW, Net

OUT = os.path.join(os.path.dirname(__file__), '../../frontend/src/lib/core/ocrnet.weights.json')


def main():
    net = Net()
    net.load_state_dict(torch.load(sys.argv[1], map_location='cpu'))
    net.eval()
    layers = []
    for m in net.f:
        if isinstance(m, torch.nn.Sequential):
            conv, bn = m[0], m[1]
            w = conv.weight.detach().numpy()
            k = (bn.weight / torch.sqrt(bn.running_var + bn.eps)).detach().numpy()
            b = (bn.bias - bn.running_mean * bn.weight / torch.sqrt(bn.running_var + bn.eps)).detach().numpy()
            w = w * k[:, None, None, None]
            layers.append({'op': 'conv', 'shape': list(w.shape), 'pad': list(conv.padding), 'relu': True,
                           'w': enc(w), 'b': enc(b)})
        elif isinstance(m, torch.nn.MaxPool2d):
            k = m.kernel_size if isinstance(m.kernel_size, tuple) else (m.kernel_size, m.kernel_size)
            layers.append({'op': 'pool', 'k': list(k)})
    w = net.head.weight.detach().numpy()
    layers.append({'op': 'conv', 'shape': list(w.shape), 'pad': [0, 0], 'relu': False, 'w': enc(w), 'b': enc(net.head.bias.detach().numpy())})
    json.dump({'h': H, 'maxw': MAXW, 'classes': CLASSES, 'layers': layers}, open(OUT, 'w'))
    print('wrote', OUT, os.path.getsize(OUT), 'bytes')


def enc(a):
    return base64.b64encode(np.asarray(a, np.float16).tobytes()).decode()


if __name__ == '__main__':
    main()
