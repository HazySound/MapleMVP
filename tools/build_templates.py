"""인게임 캡처 한 장에서 숫자 템플릿과 앵커를 뽑아 app/ocr_templates.npz로 저장한다.

MVP 등급 툴팁의 금액은 고정 비트맵 글꼴이라, 글자 모양을 그대로 떠 두면
OCR 엔진 없이도 거의 완벽하게 읽힌다. 정답을 아는 캡처에서 글자를 오려 낸다.

    python tools/build_templates.py <캡처.png> <금액 12개 쉼표로>

예) python tools/build_templates.py cap.png 20330,46750,46750,48850,48850,88850,\
108850,108850,138650,178450,178450,646300
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app import ocr  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "app" / "ocr_templates.npz"


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    path, truth = sys.argv[1], [int(x) for x in sys.argv[2].split(",")]
    if len(truth) != 12:
        print(f"금액은 12개여야 해요 ({len(truth)}개 받음)")
        return 2

    g = ocr.gray(Image.open(path))
    # 후보 중 조각 수가 정답 자릿수와 맞는 것을 고른다
    table = None
    for cand in ocr.find_tables(g):
        hit = sum(len(ocr.line_glyphs(g, y0, y1, cand.x0, cand.x1, cand.scale)) == len(f"{v:,}")
                  for v, (y0, y1) in zip(truth, cand.rows))
        print(f"  후보 x={cand.x0}~{cand.x1} 배율 {cand.scale:.2f} → 자릿수 일치 {hit}/12")
        if hit >= 10:
            table = cand
            break
    if not table:
        print("툴팁 표를 찾지 못했어요. 표 전체가 보이는 캡처인지 확인해 주세요.")
        return 1
    print(f"표 확정: 배율 {table.scale:.2f}, 금액 열 x={table.x0}~{table.x1}")

    acc: dict[str, np.ndarray] = {}
    cnt: dict[str, int] = {}
    def harvest(value: int, y0: int, y1: int, x0: int, x1: int) -> bool:
        """글자 수가 맞는 임계값마다 모두 거둔다.

        임계값에 따라 획 굵기가 달라져서, 한 값에서만 뜬 글자는 다른 설정에서 안 맞는다.
        여러 굵기를 평균내야 읽을 때 임계값을 바꿔 가며 시도해도 잘 맞는다.
        """
        chars = f"{value:,}"
        hit = False
        for th in (210, 220, 230, 235, 240, 245, 250):
            glyphs = ocr.line_glyphs(g, y0, y1, x0, x1, table.scale, th)
            if len(glyphs) != len(chars):
                continue
            hit = True
            for ch, im in zip(chars, glyphs):
                acc[ch] = acc.get(ch, np.zeros(ocr.BOX)) + im
                cnt[ch] = cnt.get(ch, 0) + 1
        return hit

    for value, (y0, y1) in zip(truth, table.rows):
        if not harvest(value, y0, y1, table.x0, table.x1):
            print(f"  {value:,}: 어떤 임계값으로도 글자 수가 안 맞아 건너뜀")

    # 상단 패널 금액에서도 글자를 거둔다 (툴팁에 없는 숫자가 여기 있을 수 있다)
    panel = [int(x) for x in sys.argv[3].split(",")] if len(sys.argv) > 3 else []
    if panel:
        want = [len(f"{v:,}") for v in panel]
        by_line: dict[int, list] = {}
        for y0, y1, lo, hi, n in ocr.digit_clusters(g, table.scale, table.rows):
            by_line.setdefault(y0 // 6, []).append((lo, hi, y0, y1))
        for group in by_line.values():
            if len(group) != len(panel):
                continue
            group.sort()
            got = [harvest(v, y0, y1, lo, hi) for v, (lo, hi, y0, y1) in zip(panel, group)]
            if all(got):
                print(f"  패널 줄 y={group[0][2]} 에서 {panel} 거둠")
                break

    missing = [c for c in "0123456789," if c not in acc]
    if missing:
        print(f"경고: 표본이 없는 글자 {missing} — 그 숫자가 들어간 캡처가 더 필요해요")
    print("표본 수:", dict(sorted(cnt.items())))

    # 툴팁 헤더('현재 등급 유지까지')를 위치 찾기용 앵커로 쓴다
    anchor = g[table.header[1]:table.header[3], table.header[0]:table.header[2]]

    data = {f"glyph_{ord(c)}": acc[c] / cnt[c] for c in acc}
    data["anchor"] = anchor
    data["scale"] = np.array([table.scale])
    np.savez_compressed(OUT, **data)
    print(f"저장: {OUT} ({OUT.stat().st_size // 1024}KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
