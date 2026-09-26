"""커뮤니티에 올릴 설명 그림을 만든다.

화면을 찍으면 되는 것은 찍는 쪽이 낫다. 실제로 도는 화면이라는 증거가 되고,
흉내 낸 그림은 아무리 비슷해도 어딘가 어긋나서 오히려 의심을 산다.

여기서 그리는 것은 찍을 수 없는 것들이다. 북마클릿을 끌어다 놓는 동작이나
'PC에서 모아 휴대폰에서 본다'는 흐름은 한 장에 담기지 않아서, 화살표와 번호로
설명하는 편이 훨씬 또렷하다.

    .venv\\Scripts\\python tools\\post_images.py

docs/post/ 아래에 PNG로 떨어진다.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "docs" / "post"
FONT = r"C:\Windows\Fonts\malgun.ttf"
BOLD = r"C:\Windows\Fonts\malgunbd.ttf"

# 앱이 쓰는 어두운 화면 색을 그대로 가져온다 (frontend/src/app.css)
BG = "#1b1c21"
PANEL = "#25272e"
PANEL2 = "#2d2f38"
LINE = "#34363f"
LINE2 = "#464956"
TX = "#e8e9ee"
TX2 = "#a9adba"
TX3 = "#767b8c"
LAV = "#b8a8ff"
MINT = "#95e2c4"
INK = "#1b1c21"

S = 2  # 두 배로 그려서 줄인다. 글자 가장자리가 깨끗해진다


def font(size, bold=False):
    return ImageFont.truetype(BOLD if bold else FONT, size * S)


def text(d, xy, s, size=15, color=TX, bold=False, anchor="la", spacing=1.5):
    d.multiline_text((xy[0] * S, xy[1] * S), s, font=font(size, bold), fill=color,
                     anchor=anchor, spacing=int(size * S * spacing) - size * S + 4)


def width(s, size=15, bold=False):
    d = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    return (d.textbbox((0, 0), s, font=font(size, bold))[2]) / S


def box(d, xy, r=14, fill=PANEL, outline=LINE, w=1):
    x0, y0, x1, y1 = (v * S for v in xy)
    d.rounded_rectangle((x0, y0, x1, y1), radius=r * S, fill=fill, outline=outline, width=w * S)


def arrow(d, x0, y, x1, color=LINE2, w=3):
    """오른쪽을 가리키는 화살표"""
    d.line((x0 * S, y * S, x1 * S, y * S), fill=color, width=w * S)
    h = 7 * S
    d.polygon([(x1 * S, y * S), (x1 * S - h, y * S - h * 0.6), (x1 * S - h, y * S + h * 0.6)], fill=color)


def canvas(w, h):
    img = Image.new("RGB", (w * S, h * S), BG)
    return img, ImageDraw.Draw(img)


def save(img, name):
    img.resize((img.width // S, img.height // S), Image.LANCZOS).save(OUT / name)
    print("wrote", OUT / name)


def step_badge(d, x, y, n):
    """번호 동그라미"""
    d.ellipse((x * S, y * S, (x + 26) * S, (y + 26) * S), fill=LAV)
    text(d, (x + 13, y + 13), str(n), 14, INK, True, "mm")


# --------------------------------------------------------------------------
# 1. 북마클릿 — 끌어다 놓고, 넥슨에서 누른다
# --------------------------------------------------------------------------
def bookmarklet():
    W, H = 900, 400
    img, d = canvas(W, H)

    text(d, (W / 2, 34), "구매내역 가져오기 — 처음 한 번만 설정하면 됩니다", 19, TX, True, "mm")

    cw, gap = 262, 27
    x0 = (W - cw * 3 - gap * 2) / 2
    top, ch = 74, 250

    # --- 1. 끌어다 놓기 ---
    x = x0
    box(d, (x, top, x + cw, top + ch))
    step_badge(d, x + 18, top + 18, 1)
    text(d, (x + 54, top + 31), "북마크바에 끌어다 놓기", 14, TX, True, "lm")

    bar_y = top + 74
    box(d, (x + 18, bar_y, x + cw - 18, bar_y + 30), 8, PANEL2, LINE, 1)
    text(d, (x + 30, bar_y + 15), "★  북마크바", 11, TX3, False, "lm")

    btn_w = 140
    bx = x + (cw - btn_w) / 2
    by = bar_y + 68
    box(d, (bx, by, bx + btn_w, by + 34), 9, LAV, LAV, 1)
    text(d, (bx + btn_w / 2, by + 17), "구매내역 가져오기", 12, INK, True, "mm")

    # 위로 끌어올리는 화살표
    d.line(((x + cw / 2) * S, (by - 6) * S, (x + cw / 2) * S, (bar_y + 38) * S), fill=LAV, width=3 * S)
    d.polygon([((x + cw / 2) * S, (bar_y + 32) * S),
               ((x + cw / 2 - 6) * S, (bar_y + 44) * S),
               ((x + cw / 2 + 6) * S, (bar_y + 44) * S)], fill=LAV)

    text(d, (x + cw / 2, top + ch - 38), "사이트에 있는 단추를\n북마크바로 끌어다 놓습니다", 12, TX2, False, "ma")

    # --- 2. 넥슨에서 누르기 ---
    x = x0 + cw + gap
    arrow(d, x - gap + 5, top + ch / 2, x - 6)
    box(d, (x, top, x + cw, top + ch))
    step_badge(d, x + 18, top + 18, 2)
    text(d, (x + 54, top + 31), "넥슨 결제내역에서 누르기", 14, TX, True, "lm")

    box(d, (x + 18, bar_y, x + cw - 18, bar_y + 30), 8, PANEL2, LINE, 1)
    text(d, (x + 30, bar_y + 15), "★  구매내역 가져오기", 11, LAV, True, "lm")
    # 누르는 자리: 화살표 커서
    cx0, cy0 = x + 112, bar_y + 20
    d.polygon([(cx0 * S, cy0 * S), (cx0 * S, (cy0 + 15) * S), ((cx0 + 4) * S, (cy0 + 11) * S),
               ((cx0 + 7) * S, (cy0 + 17) * S), ((cx0 + 10) * S, (cy0 + 15) * S),
               ((cx0 + 7) * S, (cy0 + 9) * S), ((cx0 + 11) * S, (cy0 + 9) * S)],
              fill=TX, outline=INK, width=1 * S)

    page_y = bar_y + 48
    box(d, (x + 18, page_y, x + cw - 18, page_y + 84), 9, PANEL2, LINE, 1)
    text(d, (x + 32, page_y + 20), "넥슨  결제내역", 12, TX2, True, "lm")
    for i, w2 in enumerate((150, 120, 168)):
        yy = page_y + 42 + i * 15
        d.rounded_rectangle(((x + 32) * S, yy * S, (x + 32 + w2) * S, (yy + 7) * S),
                            radius=3 * S, fill=LINE)

    text(d, (x + cw / 2, top + ch - 38), "로그인한 상태로\n북마크를 한 번 누릅니다", 12, TX2, False, "ma")

    # --- 3. 끝 ---
    x = x0 + (cw + gap) * 2
    arrow(d, x - gap + 5, top + ch / 2, x - 6)
    box(d, (x, top, x + cw, top + ch))
    step_badge(d, x + 18, top + 18, 3)
    text(d, (x + 54, top + 31), "끝", 14, TX, True, "lm")

    box(d, (x + 18, bar_y, x + cw - 18, bar_y + 132), 9, PANEL2, LINE, 1)
    text(d, (x + cw / 2, bar_y + 40), "최근 13주", 12, TX3, False, "mm")
    text(d, (x + cw / 2, bar_y + 68), "2,009,440원", 22, MINT, True, "mm")
    box(d, (x + cw / 2 - 34, bar_y + 92, x + cw / 2 + 34, bar_y + 114), 7, "#3a3140", "#6a5a4a", 1)
    text(d, (x + cw / 2, bar_y + 103), "다이아", 11, "#9fe0f2", True, "mm")

    text(d, (x + cw / 2, top + ch - 38), "읽는 즉시 화면에 반영됩니다\n다음부터는 2번만 하면 됩니다", 12, TX2, False, "ma")

    save(img, "bookmarklet.png")


# --------------------------------------------------------------------------
# 2. PC에서 모으고, 휴대폰에서 본다
# --------------------------------------------------------------------------
def flow():
    W, H = 900, 300
    img, d = canvas(W, H)

    text(d, (W / 2, 34), "PC에서 모으고, 휴대폰에서 봅니다", 19, TX, True, "mm")

    cw, ch, top = 300, 176, 76
    gap = 96
    x0 = (W - cw * 2 - gap) / 2

    # PC
    x = x0
    box(d, (x, top, x + cw, top + ch))
    # 모니터
    mx, my = x + cw / 2 - 52, top + 28
    box(d, (mx, my, mx + 104, my + 64), 7, PANEL2, LINE2, 1)
    d.line(((mx + 52) * S, (my + 64) * S, (mx + 52) * S, (my + 76) * S), fill=LINE2, width=3 * S)
    d.line(((mx + 32) * S, (my + 76) * S, (mx + 72) * S, (my + 76) * S), fill=LINE2, width=3 * S)
    for i, w2 in enumerate((64, 44, 72)):
        yy = my + 18 + i * 13
        d.rounded_rectangle(((mx + 16) * S, yy * S, (mx + 16 + w2) * S, (yy + 6) * S),
                            radius=3 * S, fill=LAV if i == 0 else LINE)
    text(d, (x + cw / 2, top + ch - 44), "PC", 15, TX, True, "ma")
    text(d, (x + cw / 2, top + ch - 24), "북마클릿으로 구매내역을 모읍니다", 12, TX2, False, "ma")

    # 가운데 화살표 + 설명
    cx = x0 + cw
    arrow(d, cx + 14, top + ch / 2 - 6, cx + gap - 14, LAV)
    text(d, (cx + gap / 2, top + ch / 2 + 16), "카카오\n로그인", 11, LAV, True, "ma")

    # 휴대폰
    x = x0 + cw + gap
    box(d, (x, top, x + cw, top + ch))
    px, py = x + cw / 2 - 30, top + 22
    box(d, (px, py, px + 60, py + 100), 10, PANEL2, LINE2, 1)
    for i, w2 in enumerate((34, 26, 40, 30)):
        yy = py + 20 + i * 15
        d.rounded_rectangle(((px + 12) * S, yy * S, (px + 12 + w2) * S, (yy + 6) * S),
                            radius=3 * S, fill=MINT if i == 0 else LINE)
    text(d, (x + cw / 2, top + ch - 44), "휴대폰", 15, TX, True, "ma")
    text(d, (x + cw / 2, top + ch - 24), "같은 계정으로 로그인하면 그대로 보입니다", 12, TX2, False, "ma")

    text(d, (W / 2, H - 26), "로그인은 안 해도 됩니다. 안 하면 PC에만 저장되고 서버에는 아무것도 남지 않습니다.",
         11, TX3, False, "mm")

    save(img, "flow.png")


# --------------------------------------------------------------------------
# 3. PC방 보정 — 창 모드여야 하는 까닭
# --------------------------------------------------------------------------
def pcroom():
    W, H = 900, 360
    img, d = canvas(W, H)

    text(d, (W / 2, 34), "프리미엄 PC방 접속분 맞추기", 19, TX, True, "mm")
    text(d, (W / 2, 62), "PC방 접속 시간은 구매내역에 안 잡혀서, 게임 안 숫자보다 적게 나옵니다",
         12.5, TX2, False, "mm")

    cw, gap = 396, 40
    x0 = (W - cw * 2 - gap) / 2
    top, ch = 96, 214

    # 화면공유
    x = x0
    box(d, (x, top, x + cw, top + ch))
    box(d, (x + 16, top + 16, x + 90, top + 40), 7, "#2f3a42", "#4a6270", 1)
    text(d, (x + 53, top + 28), "권장", 11, MINT, True, "mm")
    text(d, (x + 104, top + 28), "화면공유", 15, TX, True, "lm")
    text(d, (x + 18, top + 58),
         "메이플을 창 모드로 띄우고 그 창을 공유합니다.\n"
         "MVP 패널에 마우스를 올린 채로 두면\n"
         "알아서 읽습니다. 읽는 동안 게임 위에\n"
         "작은 안내창이 떠서 지금 무엇이 보이는지\n"
         "알려줍니다.",
         12.5, TX2)
    text(d, (x + 18, top + ch - 30), "전체화면이면 공유 목록에 안 뜹니다", 11.5, "#ffc29e", True)

    # 스크린샷
    x = x0 + cw + gap
    box(d, (x, top, x + cw, top + ch))
    box(d, (x + 16, top + 16, x + 90, top + 40), 7, PANEL2, LINE, 1)
    text(d, (x + 53, top + 28), "간단", 11, TX3, True, "mm")
    text(d, (x + 104, top + 28), "캡처 붙여넣기", 15, TX, True, "lm")
    text(d, (x + 18, top + 58),
         "MVP 패널 툴팁이 보이게 화면을 찍어서\n"
         "붙여넣습니다. 전체화면이어도 됩니다.\n\n"
         "한 장으로 끝나지만, 툴팁이 가려졌으면\n"
         "다시 찍어야 합니다.",
         12.5, TX2)
    text(d, (x + 18, top + ch - 30), "Print Screen 또는 Win+Shift+S", 11.5, TX3, True)

    text(d, (W / 2, H - 24), "한 번 맞춰 두면 되고, 주가 지나 빈 주가 생기면 앱이 알려줍니다.",
         11, TX3, False, "mm")

    save(img, "pcroom.png")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    bookmarklet()
    flow()
    pcroom()
