"""인벤에 붙여넣을 글이 실제로 어떻게 보일지 미리 그려 본다.

인벤 글쓰기에는 미리보기가 없다. 올려 보기 전에는 어떻게 나올지 알 수 없어서,
올리고 마음에 안 들면 지우고 다시 쓰는 수밖에 없다.

그래서 본문은 인벤붙여넣기.html 한 곳에만 둔다. 이 스크립트는 그 파일을 읽어서
{{1}} 같은 그림 자리에 이 컴퓨터의 캡처를 끼워 넣고, 인벤 글 폭(800px)과 흰
바탕을 흉내 낸 미리보기.html을 만든다.

본문을 여기서 만들지 않는 것이 중요하다. 글은 사람이 고치는 것이고, 고친 것을
그대로 보여 줘야 미리보기가 쓸모가 있다. 이 스크립트는 붙여넣기 파일을 읽기만
한다.

    .venv\\Scripts\\python tools\\inven_post.py
"""
import html
import re
import urllib.parse
from pathlib import Path

DESK = Path.home() / "Desktop" / "인벤글"
SRC = DESK / "인벤붙여넣기.html"
OUT = DESK / "미리보기.html"

TITLE = "MVP현황/목표 계산기(효율계산X) 웹으로 만들어왔습니다!"

# {{번호}} 자리에 끼울 캡처
SHOTS = {
    1: "대시보드.png",
    2: "대시보드_라이트.png",
    3: "목표계획_목표설정.png",
    4: "목표계획_결과.png",
    5: "목표계획_주차별계획_고정포함.png",
    6: "pc방보정.png",
    7: "구매내역 가져오기_북마클릿.png",
    8: "구매내역 전체보기.png",
}


def main():
    body = SRC.read_text(encoding="utf-8")

    # 맨 위 안내 주석은 글이 아니다
    body = re.sub(r"^\s*<!--.*?-->\s*", "", body, count=1, flags=re.S)

    # 그림 자리를 이 컴퓨터의 파일로 바꾼다
    missing, unused = [], set(SHOTS)
    def swap(m):
        n = int(m.group(1))
        unused.discard(n)
        name = SHOTS.get(n)
        if not name:
            missing.append(f"{{{{{n}}}}} 에 넣을 캡처가 SHOTS에 없습니다")
            return m.group(0)
        if not (DESK / name).exists():
            missing.append(f"{name} 파일이 없습니다")
        return urllib.parse.quote(name)

    body = re.sub(r"\{\{(\d+)\}\}", swap, body)

    page = f"""<!doctype html>
<meta charset="utf-8">
<title>인벤 글 미리보기</title>
<div style="background:#e9ecf1;padding:26px 0;min-height:100vh;">
<div style="max-width:800px;margin:0 auto;background:#ffffff;padding:30px 24px 60px;
border:1px solid #d5d9e0;font-family:'맑은 고딕',Malgun Gothic,sans-serif;
font-size:15px;color:#22252b;">
<div style="padding:0 0 18px;margin:0 0 22px;border-bottom:2px solid #22252b;
font-size:22px;font-weight:700;">{html.escape(TITLE)}</div>
{body}
</div>
<div style="max-width:800px;margin:14px auto 0;font-size:12px;color:#8a909e;
font-family:'맑은 고딕',Malgun Gothic,sans-serif;text-align:center;">
인벤 글 폭(800px)에 맞춘 미리보기입니다. 실제 글에는 이 줄이 안 나옵니다.</div>
</div>
"""
    OUT.write_text(page, encoding="utf-8")

    print("만들었습니다:", OUT)
    for n in sorted(unused):
        print(f"  알림: {{{{{n}}}}}({SHOTS[n]})가 글에 안 쓰였습니다")
    for m in missing:
        print("  확인:", m)


if __name__ == "__main__":
    main()
