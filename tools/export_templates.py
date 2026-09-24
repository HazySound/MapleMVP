"""app/ocr_templates.npz 를 웹에서 쓸 수 있는 JSON으로 내보낸다.

    python tools/export_templates.py

글자 하나가 24x16 실수 배열인데, 0~255로 양자화해 base64로 담는다.
JSON에 숫자를 그대로 적으면 30KB가 넘고, 이렇게 하면 6KB 안팎이 된다.
"""
from __future__ import annotations

import base64
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "app" / "ocr_templates.npz"
OUT = ROOT / "frontend" / "src" / "lib" / "core" / "ocr.templates.json"


def main() -> int:
    if not SRC.exists():
        print(f"{SRC} 가 없어요. tools/build_templates.py 를 먼저 돌려 주세요.")
        return 1
    d = np.load(SRC, allow_pickle=False)
    glyphs = {}
    shape = None
    for k in d.files:
        if not k.startswith("glyph_"):
            continue
        arr = d[k]
        shape = arr.shape
        q = np.clip(np.rint(arr * 255), 0, 255).astype(np.uint8)
        glyphs[chr(int(k[6:]))] = base64.b64encode(q.tobytes()).decode("ascii")
    if not glyphs:
        print("글자 템플릿이 없어요.")
        return 1
    OUT.write_text(json.dumps({
        "height": int(shape[0]), "width": int(shape[1]), "glyphs": glyphs,
    }, ensure_ascii=False), encoding="utf-8")
    print(f"저장: {OUT} ({OUT.stat().st_size // 1024}KB, 글자 {len(glyphs)}개 {shape[0]}x{shape[1]})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
