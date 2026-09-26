"""인벤 글쓰기의 html 모드에 그대로 붙여넣을 본문을 만든다.

인벤은 글쓰기 화면에서 Text / html / 웹에디터 중 하나를 고르게 되어 있고,
html을 고르면 적은 그대로 렌더링된다. 다만 <style> 블록이나 class는 기대하지
않는 편이 안전해서, 꾸밈은 전부 태그에 붙는 style 속성으로만 넣는다.
(실제 인벤 글의 저장된 본문을 열어 보면 style 속성은 그대로 살아 있다.)

이미지는 인벤에 올린 주소를 써야 한다. 그래서 두 벌을 만든다.

  미리보기.html  — 이 컴퓨터의 캡처를 그대로 걸어 둔 것. 열어서 눈으로 확인용
  인벤붙여넣기.html — 그림 자리를 {{1}}~{{8}}로 비워 둔 것. 올린 주소로 바꿔 넣는다

    .venv\\Scripts\\python tools\\inven_post.py
"""
from pathlib import Path

DESK = Path.home() / "Desktop" / "인벤글"

SITE = "https://maple-mvp.com"
REPO = "https://github.com/HazySound/MapleMVP"
MAIL = "cemigs1@gmail.com"

# 글에 들어갈 차례대로. (파일명, 설명)
SHOTS = [
    ("대시보드.png", "현황"),
    ("대시보드_라이트.png", "라이트 모드"),
    ("목표계획_목표설정.png", "목표 설정"),
    ("목표계획_결과.png", "계획 결과"),
    ("목표계획_주차별계획.png", "주차별 계획"),
    ("pc방보정.png", "PC방 보정"),
    ("구매내역 가져오기_북마클릿.png", "북마클릿"),
    ("구매내역 전체보기.png", "구매내역 보관함"),
]

# ---- 조각 ----

TX = "#22252b"
TX2 = "#5a6070"
LINE = "#e3e6ec"
LAV = "#6a4fd6"


def h2(t):
    return (f'<div style="margin:38px 0 14px;padding-left:11px;'
            f'border-left:4px solid {LAV};font-size:20px;font-weight:700;color:{TX};">{t}</div>')


def p(t, top=0):
    return (f'<div style="margin:{top}px 0 0;font-size:15px;line-height:1.75;color:{TX};">{t}</div>')


def small(t):
    return (f'<div style="margin:7px 0 0;font-size:13px;line-height:1.7;color:{TX2};">{t}</div>')


def cap(t):
    return (f'<div style="margin:8px 0 30px;font-size:13px;color:{TX2};text-align:center;">{t}</div>')


def img(src):
    return (f'<div style="margin:18px 0 0;text-align:center;">'
            f'<img src="{src}" style="max-width:100%;border-radius:8px;"></div>')


def bullets(items):
    li = "".join(
        f'<li style="margin:0 0 9px;line-height:1.7;">{x}</li>' for x in items)
    return f'<ul style="margin:14px 0 0;padding-left:22px;font-size:15px;color:{TX};">{li}</ul>'


def body(src):
    """src(i) -> 이미지 주소. 미리보기와 붙여넣기용이 여기만 다르다."""
    o = []

    # 맨 위: 주소부터
    o.append(
        f'<div style="margin:0 0 26px;padding:22px;border-radius:12px;'
        f'background:#1b1c21;text-align:center;">'
        f'<a href="{SITE}" target="_blank" '
        f'style="font-size:27px;font-weight:700;color:#b8a8ff;text-decoration:none;">'
        f'maple-mvp.com</a>'
        f'<div style="margin:9px 0 0;font-size:14px;color:#9096a5;">'
        f'설치 없이 브라우저에서 바로 씁니다 &middot; 무료</div></div>')

    o.append(p(
        "안녕하세요. MVP 등급을 계획적으로 관리해 보려고 만든 사이트입니다."))
    o.append(p(
        "인게임에서는 지금 등급과 이번 주에 얼마가 더 필요한지 정도만 알려주는데, "
        "다음 주에 등급이 유지되는지, 왜 떨어지는지, 목표 등급까지 매주 얼마씩 "
        "결제해야 하는지는 직접 계산해야 하더라고요. 그걸 대신 해 주는 사이트입니다.", 14))

    o.append(bullets([
        "지금 등급과 <b>다음 주 목요일에 적용될 등급</b>",
        "더 결제하지 않으면 <b>언제 어느 등급으로 떨어지는지</b>",
        "<b>특정 날짜까지 특정 등급</b>을 찍으려면 매주 얼마씩 결제해야 하는지",
        "최근 13주 동안 <b>프리미엄 PC방으로 반영된 금액</b>이 주차별로 얼마인지",
        "얼마를 더 결제하면 등급과 합계가 어떻게 바뀌는지 (시뮬레이터)",
        "지난 구매내역 검색 &middot; 엑셀로 내보내기",
    ]))

    o.append(small(
        "넥슨 공식 도구가 아니고, 본인 계정의 구매내역을 읽어서 계산해 보여주는 것이 전부입니다."))

    # 현황
    o.append(h2("현황"))
    o.append(p(
        "최근 13주 합계와 지금 등급, 다음 주에 적용될 등급을 한 화면에 보여줍니다. "
        "등급이 떨어질 예정이면 <b>무엇 때문에 떨어지는지</b>까지 같이 알려줍니다 — "
        "13주 창에서 어느 주의 얼마가 빠지는지요."))
    o.append(img(src(0)))
    o.append(cap("이번 주 마감까지 남은 시간, 유지에 필요한 금액, 등급별로 얼마가 더 필요한지"))

    o.append(p(
        "밝은 화면도 됩니다. 오른쪽 위 토글로 바꿉니다."))
    o.append(img(src(1)))
    o.append(cap("라이트 모드"))

    # 목표 계획
    o.append(h2("목표 계획"))
    o.append(p(
        "언제까지 어떤 등급을 찍고 싶은지 정하면, 남은 주에 금액을 나눠 줍니다. "
        "이번 주는 더 결제하지 않는 것으로 두고 계산할 수도 있습니다."))
    o.append(img(src(2)))
    o.append(cap("목표 등급과 날짜를 고릅니다"))

    o.append(img(src(3)))
    o.append(cap("달성이 가능한지, 매주 얼마씩 결제하면 되는지"))

    o.append(p(
        "특정 주의 금액을 직접 넣으면 그 주는 고정되고 나머지 주가 다시 나뉩니다. "
        "그 주에 13주 합계가 얼마가 되고 등급이 무엇이 되는지도 같이 나옵니다."))
    o.append(img(src(4)))
    o.append(cap("주차별 계획 — 빈칸은 자동 분배, 숫자를 넣으면 고정"))

    # PC방
    o.append(h2("프리미엄 PC방 접속분"))
    o.append(p(
        "PC방 접속 시간은 6분마다 100캐시씩 MVP 금액에 반영되는데, "
        "구매내역에는 안 잡힙니다. 그래서 결제 내역만 더하면 게임 안 숫자보다 적게 나옵니다."))
    o.append(p(
        "인게임 MVP 패널을 읽어서 그 차이를 채웁니다. "
        "<b>화면을 공유해 두고 패널에 마우스만 올렸다 치우면</b> 알아서 읽습니다. "
        "읽는 동안 게임 위에 작은 안내창이 떠서 지금 무엇을 할 차례인지 알려줍니다. "
        "캡처를 찍어 붙여넣어도 됩니다.", 12))
    o.append(img(src(5)))
    o.append(cap("한 번 맞춰 두면 되고, 주가 지나 빈 주가 생기면 알려줍니다"))

    # 가져오기
    o.append(h2("구매내역 가져오기"))
    o.append(p(
        "브라우저는 다른 사이트의 응답을 읽지 못해서, 이 사이트가 넥슨을 직접 볼 수 없습니다. "
        "대신 <b>넥슨 페이지에서 실행되는 북마크</b>를 하나 만들어 두면 거기서 읽어 보내 줍니다."))
    o.append(p(
        "처음 한 번만 단추를 북마크바로 끌어다 놓고, 그다음부터는 "
        "넥슨 결제내역 페이지에서 그 북마크를 누르면 끝입니다.", 12))
    o.append(img(src(6)))
    o.append(cap("처음 한 번만 끌어다 놓으면 됩니다"))

    o.append(p(
        "받아온 내역은 <b>이 브라우저에만</b> 저장됩니다. 검색하고 엑셀로 내보낼 수 있습니다."))
    o.append(img(src(7)))
    o.append(cap("구매내역 보관함"))

    # 휴대폰
    o.append(h2("휴대폰에서 보기"))
    o.append(p(
        "휴대폰에는 북마크바가 없어서 가져오기는 PC에서만 됩니다. "
        "대신 PC에서 <b>카카오로 로그인</b>해 두면 받아둔 내역이 계정에 저장되고, "
        "휴대폰에서 같은 계정으로 로그인하면 그대로 보입니다."))
    o.append(small(
        "로그인은 안 해도 됩니다. 안 하면 PC에만 저장되고 서버에는 아무것도 남지 않습니다."))

    # 그 외
    o.append(h2("그 밖에"))
    o.append(p(
        "구매내역을 읽는 코드가 신경 쓰이실 텐데, 전체를 공개해 두었습니다. "
        f'<a href="{REPO}" target="_blank" style="color:{LAV};">{REPO.replace("https://", "")}</a>'))
    o.append(small(
        "비밀번호가 지나가는 자리는 없습니다. 이미 로그인해 있는 본인 브라우저에서 "
        "본인 구매내역을 읽는 것뿐입니다."))
    o.append(p(
        "윈도우 앱도 있습니다. 북마크 없이 앱이 알아서 읽어 옵니다. "
        "매번 켜서 쓸 생각이면 그쪽이 손이 덜 갑니다. (위 저장소에서 받을 수 있습니다)", 14))

    o.append(
        f'<div style="margin:34px 0 0;padding:17px 19px;border-radius:10px;'
        f'background:#f4f5f8;border:1px solid {LINE};font-size:14px;line-height:1.75;color:{TX2};">'
        "혼자 만든 거라 오류가 있을 수 있습니다. 숫자가 이상하거나 안 되는 게 있으면 "
        "댓글이나 화면 맨 아래 메일로 알려주시면 고치겠습니다.<br>"
        "필요한 기능 있으시면 그것도 말씀해 주세요."
        "</div>")

    o.append(
        f'<div style="margin:26px 0 0;text-align:center;">'
        f'<a href="{SITE}" target="_blank" '
        f'style="display:inline-block;padding:15px 40px;border-radius:10px;'
        f'background:#6a4fd6;color:#ffffff;font-size:18px;font-weight:700;'
        f'text-decoration:none;">maple-mvp.com</a></div>')

    return "\n".join(o)


def main():
    # 1) 붙여넣기용 — 그림 자리는 비워 둔다
    paste = body(lambda i: "{{%d}}" % (i + 1))
    guide = ["<!--",
             "  인벤 글쓰기에서 'html'을 고르고 아래 전체를 붙여넣으세요.",
             "  {{1}} ~ {{%d}} 자리에 인벤에 올린 이미지 주소를 넣으면 됩니다." % len(SHOTS),
             "",
             "  주소 얻는 법: 먼저 '웹에디터'로 아래 순서대로 그림만 올리고 임시저장한 다음,",
             "  'html'로 바꾸면 <img src=\"...\"> 가 보입니다. 그 주소를 하나씩 옮겨 넣으세요.",
             ""]
    for i, (f, d) in enumerate(SHOTS):
        guide.append(f"  {{{{{i + 1}}}}}  {f}   ({d})")
    guide.append("-->")
    (DESK / "인벤붙여넣기.html").write_text(
        "\n".join(guide) + "\n\n" + paste + "\n", encoding="utf-8")

    # 2) 미리보기 — 이 컴퓨터의 캡처를 그대로 건다
    prev = body(lambda i: SHOTS[i][0].replace(" ", "%20"))
    page = (
        '<!doctype html><meta charset="utf-8"><title>인벤 글 미리보기</title>'
        '<div style="background:#e9ecf1;padding:26px 0;min-height:100vh;">'
        '<div style="max-width:800px;margin:0 auto;background:#ffffff;padding:30px 24px 60px;'
        'border:1px solid #d5d9e0;'
        'font-family:\'맑은 고딕\',Malgun Gothic,sans-serif;font-size:15px;color:#22252b;">'
        '<div style="padding:0 0 18px;margin:0 0 22px;border-bottom:2px solid #22252b;'
        'font-size:22px;font-weight:700;">'
        'MVP현황/목표 계산기(효율계산X) 웹으로 만들어왔습니다!</div>'
        + prev +
        '</div></div>')
    (DESK / "미리보기.html").write_text(page, encoding="utf-8")

    print("만들었습니다:")
    print(" ", DESK / "미리보기.html", "  <- 더블클릭해서 확인")
    print(" ", DESK / "인벤붙여넣기.html")


if __name__ == "__main__":
    main()
