"""인게임 캡처에서 MVP 등급 툴팁의 숫자를 읽는다.

메이플 UI는 해상도를 바꿔도 픽셀 크기가 그대로인 고정 비트맵 글꼴이라,
글자 모양을 떠 두고 맞춰 보는 방식이 일반 OCR보다 훨씬 정확하다.

설정 하나로 완벽하게 맞추려 하지 않는다. 임계값과 블러를 여러 조합으로 바꿔 가며
읽어 보고, 그중 '정답을 몰라도 할 수 있는 검증'을 통과한 결과만 채택한다.
    - 유지까지 필요한 금액은 줄어들 수 없다 (단조 비감소)
    - 주차별 금액은 음수일 수 없다
    - 수집한 결제액보다 작을 수 없다
    - 그 차이는 PC방 단위인 100의 배수여야 한다
실험에서 18개 조합 중 오답은 단 하나도 이 검증을 통과하지 못했다.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

from . import paths

BOX = (24, 16)          # 글자 하나를 정규화할 크기 (세로, 가로)
ROWS = 12               # 툴팁 줄 수
SPACING = 54.2          # 기준 배율에서의 줄 간격 (픽셀)

# 여러 조합으로 읽어 본다. 하나가 실패해도 다른 게 맞으면 된다
THRESHOLDS = (200, 210, 220, 230, 240)
BLURS = (None, 0.5, 0.8)


def gray(img: Image.Image) -> np.ndarray:
    return np.asarray(img.convert("RGB")).astype(float).mean(axis=2)


def runs(mask, gap: int, minw: int) -> list[tuple[int, int]]:
    """True가 이어지는 구간을 찾는다. gap 이하로 끊긴 건 이어 붙인다."""
    out: list[tuple[int, int]] = []
    cur, blank = None, 0
    for i, v in enumerate(mask):
        if v:
            if cur is None:
                cur = i
            blank = 0
        elif cur is not None:
            blank += 1
            if blank > gap:
                if i - blank - cur >= minw:
                    out.append((cur, i - blank))
                cur = None
    if cur is not None and len(mask) - cur >= minw:
        out.append((cur, len(mask)))
    return out


@dataclass(frozen=True)
class Table:
    rows: list[tuple[int, int]]   # 각 줄의 세로 범위
    x0: int                       # 금액 열 시작
    x1: int                       # 금액 열 끝
    scale: float
    header: tuple[int, int, int, int]   # 앵커로 쓸 헤더 영역 (x0, y0, x1, y1)


def _templates() -> dict:
    path = Path(paths.ROOT) / "app" / "ocr_templates.npz"
    if not path.exists():
        return {}
    d = np.load(path, allow_pickle=False)
    out = {"anchor": d["anchor"], "scale": float(d["scale"][0]),
           "glyphs": {chr(int(k[6:])): d[k] for k in d.files if k.startswith("glyph_")}}
    return out


def locate(g: np.ndarray, tpl: np.ndarray) -> tuple[int, int, float]:
    """FFT 상호상관으로 화면 어디에 템플릿이 있는지 찾는다. (x, y, 점수)"""
    t = tpl - tpl.mean()
    H, W = g.shape
    th, tw = t.shape
    if th > H or tw > W:
        return 0, 0, 0.0
    corr = np.fft.irfft2(np.fft.rfft2(g, s=(H, W)) * np.fft.rfft2(t[::-1, ::-1], s=(H, W)), s=(H, W))
    ones = np.fft.rfft2(np.ones_like(t), s=(H, W))
    s1 = np.fft.irfft2(np.fft.rfft2(g, s=(H, W)) * ones, s=(H, W))
    s2 = np.fft.irfft2(np.fft.rfft2(g ** 2, s=(H, W)) * ones, s=(H, W))
    var = np.maximum(s2 - s1 ** 2 / (th * tw), 1e-6)
    r = corr / np.sqrt(var * (t ** 2).sum())
    y, x = np.unravel_index(np.argmax(r), r.shape)
    return int(x - tw + 1), int(y - th + 1), float(r.max())


def _chain(segs: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """간격이 고르게 이어지는 가장 긴 줄 묶음을 찾는다."""
    best: list[tuple[int, int]] = []
    for i in range(len(segs)):
        for j in range(i + 1, len(segs)):
            d = segs[j][0] - segs[i][0]
            if d < 12:
                continue
            chain, last = [segs[i], segs[j]], segs[j][0]
            for k in range(j + 1, len(segs)):
                if abs(segs[k][0] - last - d) <= max(3, d * 0.12):
                    chain.append(segs[k])
                    last = segs[k][0]
            if len(chain) > len(best):
                best = chain
    return best


MAX_GLYPH = 15          # 기준 배율에서 숫자 한 글자의 최대 폭. 한글('캐시')은 이보다 넓다


def _digit_segs(g: np.ndarray, y0: int, y1: int, x0: int, x1: int, scale: float,
                th: int = 220) -> list[tuple[int, int]]:
    """한 줄에서 숫자로 보이는 조각만 남긴다 ('캐시' 같은 한글은 폭으로 떨군다)."""
    band = g[max(0, y0):y1, x0:x1]
    s = lambda v: max(1, int(round(v * scale)))
    segs = runs((band > th).sum(axis=0) >= 1, s(2), s(2))
    return [(a, b) for a, b in segs if b - a <= s(MAX_GLYPH)]


def _score(g: np.ndarray, rows, x0: int, x1: int, scale: float) -> float:
    """금액 열다운 정도. 오른쪽 정렬이고 글자 수가 그럴듯하면 높다."""
    ends, counts = [], []
    for y0, y1 in rows:
        segs = _digit_segs(g, y0, y1, x0, x1, scale)
        if not segs:
            return 0.0
        ends.append(segs[-1][1])
        counts.append(len(segs))
    spread = max(ends) - min(ends)
    aligned = 1.0 if spread <= max(4, 10 * scale) else max(0.0, 1 - spread / (60 * scale))
    plausible = sum(1 for c in counts if 3 <= c <= 9) / len(counts)
    return aligned * plausible


def find_tables(g: np.ndarray, x_from: int = 0, x_to: int | None = None, y_from: int = 0,
                win: int = 320, step: int = 40, limit: int = 6) -> list[Table]:
    """툴팁 금액 열을 찾는다. 그럴듯한 순서로 여러 후보를 돌려준다.

    1) 밝은 글자가 일정 간격으로 12줄 늘어선 곳을 찾는다 (배율은 줄 간격에서 역산)
    2) 그 줄들을 가로로 끝까지 펼쳐 열 덩어리로 나눈다 (창 경계에 잘리지 않게)
    3) 오른쪽 정렬이고 글자 폭이 숫자다운 덩어리를 고른다

    '주간 혜택' 목록이나 '예상 등급' 열처럼 줄이 고르게 늘어선 곳이 또 있어서 점수로 가린다.
    """
    H, W = g.shape
    x_to = W if x_to is None else min(W, x_to)
    x_from = max(0, x_from)
    bright = (g[y_from:] > 220).astype(np.int32)
    cum = np.concatenate([np.zeros((bright.shape[0], 1), np.int32), bright.cumsum(axis=1)], axis=1)

    # --- 1) 줄 묶음 찾기 (같은 묶음은 한 번만) ---
    chains: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for x0 in range(x_from, max(x_from + 1, x_to - win + 1), step):
        x1 = min(x_to, x0 + win)
        segs = [(a, b) for a, b in runs((cum[:, x1] - cum[:, x0]) >= 3, 6, 5) if b - a >= 8]
        chain = _chain(segs)[:ROWS]
        if len(chain) < ROWS:
            continue
        gaps = [chain[i + 1][0] - chain[i][0] for i in range(ROWS - 1)]
        d = float(np.median(gaps))
        if not 0.5 <= d / SPACING <= 3.0:
            continue
        chains.setdefault((chain[0][0] // 8, int(d) // 4), chain)

    # --- 2) 줄마다 가로로 펼쳐 열 덩어리로 나누기 ---
    out: list[tuple[float, Table]] = []
    for chain in chains.values():
        gaps = [chain[i + 1][0] - chain[i][0] for i in range(ROWS - 1)]
        scale = float(np.median(gaps)) / SPACING
        sc = lambda v: max(1, int(round(v * scale)))
        rows = [(y_from + a - sc(4), y_from + b + sc(6)) for a, b in chain]

        cols = np.zeros(W, bool)
        for y0, y1 in rows:
            cols |= (g[max(0, y0):y1] > 220).any(axis=0)
        for lo, hi in runs(cols, sc(24), sc(30)):
            if hi - lo > sc(420):
                continue
            lo, hi = max(0, lo - sc(6)), min(W, hi + sc(7))
            score = _score(g, rows, lo, hi, scale)
            if score > 0:
                head = (lo, max(0, rows[0][0] - sc(56)), hi, max(0, rows[0][0] - sc(20)))
                out.append((score, Table(rows, lo, hi, scale, head)))

    out.sort(key=lambda p: -p[0])
    return [t for _, t in out[:limit]]


def line_glyphs(g: np.ndarray, y0: int, y1: int, x0: int, x1: int, scale: float,
                th: int = 220, blur: float | None = None) -> list[np.ndarray]:
    """한 줄에서 글자 조각을 잘라 크기를 맞춘다. 세로 비율을 지켜 ','와 '1'을 구분한다."""
    band = g[max(0, y0):y1, x0:x1]
    # 창모드처럼 UI가 작게 그려진 캡처는 글자가 7px쯤이라, 임계값을 조금만 움직여도
    # 붙거나 끊어진다. 템플릿을 뜬 크기로 되돌려 놓고 읽는다.
    if scale < 0.95 and band.size:
        band = np.asarray(Image.fromarray(np.clip(band, 0, 255).astype(np.uint8))
                          .resize((max(1, int(round(band.shape[1] / scale))),
                                   max(1, int(round(band.shape[0] / scale)))), Image.LANCZOS)).astype(float)
        scale = 1.0
    if blur:
        band = np.asarray(Image.fromarray(np.clip(band, 0, 255).astype(np.uint8))
                          .filter(ImageFilter.GaussianBlur(blur))).astype(float)
    m = band > th
    s = lambda v: max(1, int(round(v * scale)))
    segs = [(a, b) for a, b in runs(m.sum(axis=0) >= 1, s(2), s(2)) if b - a <= s(MAX_GLYPH)]
    wide = [(a, b) for a, b in segs if b - a >= s(8)]
    if not wide:
        return []
    cols = [c for a, b in wide for c in range(a, b)]
    ys = np.where(m[:, cols].any(axis=1))[0]
    if not len(ys):
        return []
    top, bot = max(0, ys[0] - 2), min(band.shape[0], ys[-1] + 3)
    out = []
    for a, b in segs:
        piece = band[top:bot, a:b]
        f = BOX[0] / max(1, piece.shape[0])
        nw = max(1, min(BOX[1], int(round(piece.shape[1] * f))))
        img = Image.fromarray(np.clip(piece, 0, 255).astype(np.uint8)).resize((nw, BOX[0]), Image.LANCZOS)
        cell = np.zeros(BOX)
        cell[:, (BOX[1] - nw) // 2:(BOX[1] - nw) // 2 + nw] = np.asarray(img).astype(float)
        out.append(np.clip((cell - 70) / 185, 0, 1))
    return out


CLUSTER_THRESHOLDS = (200, 220, 235)


def digit_clusters(g: np.ndarray, scale: float, skip: list[tuple[int, int]] | None = None,
                   win: int = 360, step: int = 60):
    """화면에서 '숫자 여러 개가 붙어 있는 덩어리'를 모두 찾는다.

    게임 화면은 밝은 UI가 많아서 가로 전체 투영으로는 글자 줄이 안 갈린다.
    열 창을 옮겨 가며 글자 높이만 한 짧은 띠를 찾는다.
    반환: (y0, y1, x0, x1, 글자수)
    """
    H, W = g.shape
    sc = lambda v: max(1, int(round(v * scale)))
    out, seen = [], set()
    for th in CLUSTER_THRESHOLDS:
        bright = (g > th).astype(np.int32)
        cum = np.concatenate([np.zeros((H, 1), np.int32), bright.cumsum(axis=1)], axis=1)
        for wx in range(0, max(1, W - win + 1), step):
            wx1 = min(W, wx + win)
            for a, b in runs((cum[:, wx1] - cum[:, wx]) >= 3, sc(3), sc(8)):
                if not sc(10) <= b - a <= sc(30):
                    continue
                if skip and any(a < s1 and s0 < b for s0, s1 in skip):
                    continue
                # 덩어리 경계는 창에 잘리면 안 되니 이 띠 전체 폭에서 잡는다
                cols = (g[a:b] > th).any(axis=0)
                for lo, hi in runs(cols, sc(24), sc(18)):
                    if hi <= wx or lo >= wx1:
                        continue
                    lo, hi = max(0, lo - sc(6)), min(W, hi + sc(7))
                    n = len(_digit_segs(g, a - sc(4), b + sc(6), lo, hi, scale, th))
                    key = (a // 6, lo // 10, th)
                    if 3 <= n <= 9 and key not in seen:
                        seen.add(key)
                        out.append((a - sc(4), b + sc(6), lo, hi, n))
    return out


def find_amounts(g: np.ndarray, glyphs: dict, scale: float,
                 skip: list[tuple[int, int]] | None = None) -> list[int]:
    """화면에 보이는 숫자들을 모두 읽어 온다. 어느 게 '○○ 등급까지'인지는 검증으로 가린다."""
    vals = set()
    for y0, y1, x0, x1, _ in digit_clusters(g, scale, skip):
        # 붙어버린 숫자는 임계값을 올려야 갈린다. 여러 값으로 읽어 모두 후보로 둔다
        for th in THRESHOLDS + (235, 245):
            gs = line_glyphs(g, y0, y1, x0, x1, scale, th)
            t = "".join(_match(glyphs, im) for im in gs).replace(",", "")
            if t.isdigit() and 1_000 <= int(t) <= 2_500_000:
                vals.add(int(t))
    return sorted(vals)


def _match(glyphs: dict, im: np.ndarray) -> str:
    def score(t):
        return float(np.dot(t.ravel(), im.ravel()) / (np.linalg.norm(t) * np.linalg.norm(im) + 1e-9))
    return max(glyphs, key=lambda c: score(glyphs[c]))


def read_amounts(g: np.ndarray, table: Table, glyphs: dict, th: int, blur) -> list[int] | None:
    out = []
    for y0, y1 in table.rows:
        gs = line_glyphs(g, y0, y1, table.x0, table.x1, table.scale, th, blur)
        text = "".join(_match(glyphs, im) for im in gs).replace(",", "")
        if not text.isdigit():
            return None
        out.append(int(text))
    return out if len(out) == ROWS else None


def scan(img: Image.Image, scale: float = 0.0) -> dict:
    """캡처에서 숫자 후보를 뽑는다. 어느 것이 맞는지는 판단하지 않는다.

    임계값과 블러를 바꿔 가며 읽으면 결과가 여러 가지로 나오는데, 그중 무엇이
    맞는지는 규칙(수집한 결제액과 맞는가, 100의 배수인가 …)을 아는 쪽이 골라야 한다.
    그 규칙은 화면(TS)에 한 벌만 두었으므로 여기서는 후보만 넘긴다.

    scale: 툴팁이 없는 두 번째 장을 읽을 때, 첫 장에서 알아낸 UI 배율.
    반환: {readings: 툴팁 12줄 후보들, amounts: 화면에서 읽은 숫자들, scale}
    """
    tpl = _templates()
    if not tpl or not tpl.get("glyphs"):
        return {"readings": [], "amounts": [], "scale": scale, "error": "templates"}
    glyphs = tpl["glyphs"]
    g = gray(img)

    for table in find_tables(g):
        seen: list[list[int]] = []
        for th in THRESHOLDS:
            for blur in BLURS:
                vals = read_amounts(g, table, glyphs, th, blur)
                if vals and vals not in seen:
                    seen.append(vals)
        if seen:
            return {"readings": seen, "scale": table.scale,
                    "amounts": find_amounts(g, glyphs, table.scale, table.rows)}

    # 툴팁이 없는 장 (마우스를 치우면 표가 사라진다) — 숫자만 뽑아 둔다
    return {"readings": [], "scale": scale or 1.0,
            "amounts": find_amounts(g, glyphs, scale or 1.0)}
