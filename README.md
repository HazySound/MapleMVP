<h1 align="center">MapleMVP</h1>

<p align="center">메이플스토리 결제 내역을 읽어서 MVP 등급 현황과 목표 계획을 보여준다</p>

<p align="center">
  <a href="https://maple-mvp.com"><img src="https://img.shields.io/badge/%EB%B0%94%EB%A1%9C%20%EC%93%B0%EA%B8%B0-maple--mvp.com-b8a8ff?style=for-the-badge&logo=googlechrome&logoColor=1b1c21&labelColor=2a2b33" alt="maple-mvp.com"></a>
  <a href="https://github.com/HazySound/MapleMVP/releases/latest/download/MapleMVP.zip"><img src="https://img.shields.io/badge/Windows%20%EB%8B%A4%EC%9A%B4%EB%A1%9C%EB%93%9C-MapleMVP.zip-8a8f9e?style=for-the-badge&logo=windows&logoColor=1b1c21&labelColor=2a2b33" alt="Windows 다운로드"></a>
</p>

<p align="center">
  <img src="docs/dashboard.png" width="920" alt="현황 화면">
</p>

넥슨 공식 도구가 아니다. 본인 계정의 구매내역 페이지를 읽어서 계산해 보여주는 것이 전부다.

**웹**과 **윈도우 앱** 두 가지가 있다. 계산하는 내용은 같고, 구매내역을 어떻게 읽어 오는지가 다르다.

| | [웹](https://maple-mvp.com) | [윈도우 앱](https://github.com/HazySound/MapleMVP/releases/latest/download/MapleMVP.zip) |
| --- | --- | --- |
| 설치 | 없음 | exe 하나 |
| 구매내역 읽기 | 북마클릿을 눌러서 | 앱이 알아서 |
| 저장되는 곳 | 이 브라우저 (로그인하면 서버에도) | 이 PC |
| 휴대폰에서 보기 | 로그인하면 된다 | 안 된다 |

처음이라면 **웹**이 편하다. 매번 켜서 쓸 생각이면 윈도우 앱이 손이 덜 간다.

## 할 수 있는 것

- 최근 13주 결제 합계와 현재 등급, 다음 목요일에 적용될 등급
- 이번 주 마감까지 남은 시간, 등급을 유지하거나 올리는 데 더 필요한 금액
- 이번 주에 얼마를 더 결제하면 무엇이 달라지는지 (시뮬레이터)
- 언제까지 어떤 등급을 달성하려면 매주 얼마씩 결제해야 하는지 (목표 계획)
- 지난 구매내역 전체를 검색·정렬하고 엑셀로 내보내기 (보관함)
- 프리미엄 PC방 접속분 보정 (아래 참고)
- 블랙 기준을 넘긴 금액의 이월 계산

<table>
<tr>
<td width="50%">
<img src="docs/plan.png" alt="목표 계획 화면">
<sub><b>목표 계획</b> — 목표 등급과 날짜를 정하면 남은 주에 금액을 나눠준다. 특정 주의 금액을 직접 입력해 고정하면 나머지 주가 다시 계산된다. 이번 주는 더 결제하지 않는 것으로 두고 계산할 수도 있다.</sub>
</td>
<td width="50%">
<img src="docs/forecast.png" alt="하락 예측과 시뮬레이터">
<sub><b>하락 예측 · 시뮬레이터</b> — 더 결제하지 않으면 언제 어느 등급으로 내려가는지, 추가 결제가 등급·합계·하락 시점을 어떻게 바꾸는지 보여준다.</sub>
</td>
</tr>
<tr>
<td colspan="2">
<img src="docs/history.png" alt="구매내역 보관함">
<sub><b>구매내역 보관함</b> — 받아둔 지난 구매내역 전체. 아이템 이름 검색, 기간 필터, 헤더를 눌러 정렬, 보고 있는 목록 그대로 엑셀 저장.</sub>
</td>
</tr>
</table>

<sub>스크린샷은 모두 예시 데이터(`python run.py --demo`)로 찍은 것이다.</sub>

## MVP 등급 기준

앱이 계산에 쓰는 규칙이다.

| 등급 | 13주 합계 |
| --- | --- |
| 브론즈 | 150,000원 |
| 실버 | 300,000원 |
| 골드 | 600,000원 |
| 다이아 | 900,000원 |
| 레드 | 1,500,000원 |
| 블랙 | 2,500,000원 |

- 한 주는 목요일 00:00에 시작해서 수요일 23:59에 끝난다.
- 판정에 쓰는 13주는 **이번 주를 포함한** 최근 13주다.
- 결제하면 등급은 바로 오르고, 목요일마다 가장 오래된 주가 빠지면서 다시 계산된다.
- 블랙 기준(250만원)을 넘긴 금액은 이월되어, 나중에 기준에 모자랄 때 부족분을 메운다. 이월 한도는 1,000만원이다.

## 웹으로 쓰기

<p align="center">
  <a href="https://maple-mvp.com"><img src="https://img.shields.io/badge/%EB%B0%94%EB%A1%9C%20%EC%93%B0%EA%B8%B0-maple--mvp.com-b8a8ff?style=for-the-badge&logo=googlechrome&logoColor=1b1c21&labelColor=2a2b33" alt="maple-mvp.com"></a>
</p>

브라우저는 남의 사이트에서 온 응답을 마음대로 읽지 못한다. 그래서 웹에서는 **북마클릿**을 쓴다. 넥슨 페이지에서 그 단추를 누르면, 이미 로그인해 있는 본인 브라우저가 본인 구매내역을 읽어서 이 앱으로 넘겨준다.

1. [maple-mvp.com](https://maple-mvp.com)에서 **구매내역 가져오기**를 누른다.
2. 안내대로 북마클릿을 북마크바에 끌어다 놓는다. 한 번만 하면 된다.
3. 넥슨 결제내역 페이지를 열고 북마클릿을 누른다. 로그인이 안 돼 있으면 로그인부터 하라고 알려준다.
4. 읽는 동안 진행 상황이 보이고, 끝나면 화면에 바로 반영된다.

다음부터는 3번만 하면 된다.

받아온 내역은 **이 브라우저에만** 저장된다. 서버로 가는 것은 없다.

### 휴대폰에서 보기

휴대폰 브라우저에는 북마크바가 없어서 구매내역을 가져올 수 없다. 대신 PC에서 가져온 것을 휴대폰에서 볼 수는 있다.

PC에서 **카카오로 로그인**해 두면 받아둔 내역이 계정에 저장되고, 휴대폰에서 같은 계정으로 로그인하면 그대로 보인다. 이때만 구매내역이 서버에 저장되며, 무엇을 어떻게 다루는지는 [개인정보 처리방침](https://maple-mvp.com/privacy.html)에 적어 두었다.

로그인은 안 해도 된다. 안 하면 PC에서 혼자 쓰는 것이고, 서버에는 아무것도 남지 않는다.

## 프리미엄 PC방 접속분

프리미엄 PC방에서 접속한 시간도 MVP 등급 합계에 들어가는데, 이건 구매내역에 안 잡힌다. 그래서 맞추기 전까지는 앱이 보여주는 금액이 게임 안보다 적게 나온다.

인게임 MVP 패널에 마우스를 올리면 뜨는 툴팁에 주차별 금액이 적혀 있다. 그 화면을 읽어서 차이를 메운다. 두 가지 방법이 있다.

- **화면공유** — 창 모드로 띄운 메이플 창을 공유하면, 툴팁을 띄운 채로 두기만 해도 알아서 읽는다. 읽는 동안 게임 위에 작은 안내창이 떠서 지금 무엇이 보이는지 알려준다.
- **캡처 붙여넣기** — 툴팁이 보이게 찍은 화면을 앱에 붙여넣는다.

한 번 맞춰 놔도 주가 지나면 새 주가 비므로 가끔 다시 맞춰야 한다. 아직 비어 있는 주가 있으면 앱이 알려준다.

휴대폰에서는 맞출 수 없고(메이플이 없으니까) 맞춰 둔 금액만 보인다.

## 윈도우 앱으로 쓰기

<p align="center">
  <a href="https://github.com/HazySound/MapleMVP/releases/latest/download/MapleMVP.zip"><img src="https://img.shields.io/badge/Windows%20%EB%8B%A4%EC%9A%B4%EB%A1%9C%EB%93%9C-MapleMVP.zip-b8a8ff?style=for-the-badge&logo=windows&logoColor=1b1c21&labelColor=2a2b33" alt="Windows 다운로드"></a>
</p>

압축을 풀면 나오는 `MapleMVP.exe` 하나가 전부다. 설치 과정은 없고 아무 폴더에 두고 실행하면 된다. 코드 서명이 없어서 처음 실행할 때 윈도우 SmartScreen 경고가 뜨는데, `추가 정보` → `실행`을 누르면 된다.

[지난 버전 모아보기](https://github.com/HazySound/MapleMVP/releases)

### 처음 실행할 때

1. 넥슨 로그인 창이 뜬다. 넥슨 공식 로그인 페이지이고, 로그인하면 창이 알아서 닫힌다.
2. 구매내역을 받아오기 시작한다. 처음 한 번은 지난 구매내역을 전부 받아오기 때문에 몇 분 걸릴 수 있다. 진행 상황에 지금까지 받은 건수가 표시된다.
3. 그 다음부터는 이번 달치만 새로 읽어서 몇 초면 끝난다.

첫 수집 도중에 창을 닫아도 받은 만큼은 저장되고, 다음에 켜면 끊긴 지점부터 이어받는다.

### 저장되는 파일

전부 `%LOCALAPPDATA%\MapleMVP\` 안에 있다. 이 폴더를 지우면 완전히 처음 상태가 된다.

| 파일 | 내용 |
| --- | --- |
| `cache.json` | 받아온 구매내역 |
| `plan.json` | 목표 계획 (목표 등급, 날짜, 주별 고정 금액) |
| `ui.json` | 화면 밝기, MVP 카드 가운데에 메달을 볼지 금액을 볼지 |
| `settings.json` | 창 크기·위치, 로그인 여부 |
| `webview\` | 넥슨 로그인 상태 (쿠키) |

윈도우 앱은 어디로도 데이터를 보내지 않는다. 카카오 로그인도 웹에만 있다.

## 소스에서 실행하기

필요한 것: 윈도우 10/11, Python 3.10 이상, Node.js 20 이상. WebView2 런타임은 윈도우 11에 기본으로 들어 있다.

```
python -m venv venv
venv\Scripts\pip install -r requirements.txt

cd frontend
npm install
npm run build
cd ..

venv\Scripts\python run.py
```

단일 exe로 빌드하려면 (`dist\MapleMVP.exe`가 만들어진다):

```
powershell -ExecutionPolicy Bypass -File tools\build.ps1
```

로그인이나 수집 없이 화면만 둘러보려면 `venv\Scripts\python run.py --demo`.

웹 쪽만 띄워 보려면 `cd frontend && npm run dev:web`. 서버(`functions/`)는 같이 뜨지 않으므로 로그인은 안 되고, 북마클릿과 브라우저 저장은 그대로 쓸 수 있다.

## 자주 묻는 것

**아이디와 비밀번호를 앱이 보나?**
아니다. 웹에서는 북마클릿이 이미 로그인해 있는 본인 브라우저 안에서 도는 것이고, 윈도우 앱에서는 넥슨 공식 로그인 페이지가 열린 창에서 로그인이 이뤄진다. 둘 다 비밀번호가 지나가는 자리가 없다.

**북마클릿이 뭘 하는지 어떻게 믿나?**
코드가 [`frontend/src/lib/web/import.ts`](frontend/src/lib/web/import.ts)와 [`app/scrape.js`](app/scrape.js)에 그대로 있다. 하는 일은 넥슨 결제내역 API를 부르고 그 결과를 이 앱 탭으로 넘기는 것뿐이다.

**구매내역이 서버에 저장되나?**
웹에서 **카카오로 로그인했을 때만** 저장된다. 휴대폰에서 보려면 어딘가에 두어야 해서다. 로그인하지 않으면 브라우저 밖으로 나가지 않고, 윈도우 앱은 아예 서버가 없다. 저장된 것은 계정 메뉴의 **내 데이터 지우기**나 **탈퇴**로 즉시 지울 수 있다.

**켤 때마다 넥슨에 로그인하라고 나온다면?** (윈도우 앱)
넥슨은 '로그인 상태 유지'를 켜지 않으면 창을 닫을 때 사라지는 임시 인증만 발급한다. 그러면 로그인 직후에는 잘 되다가 앱을 끄면 로그인이 풀린다. 그래서 앱이 로그인 창을 열 때 이 항목을 자동으로 켜 둔다. 직접 껐다면 다시 켜고 로그인하면 된다.

**다른 브라우저에서 넥슨에 로그인하면?** (윈도우 앱)
중복 로그인으로 처리되어 앱의 세션이 끊긴다. 다음에 실행하면 받아둔 내역으로 화면은 먼저 뜨고, 그 위에 로그인 안내가 나온다. 다시 로그인하면 이번 달치만 새로 읽으므로 금방 끝난다.

**이월 금액은 어디서 가져오나?**
넥슨이 알려주는 값이 아니라서 앱이 계산한다. 과거 주차별 결제액을 목요일마다 되짚으면서 블랙 기준을 넘긴 금액을 쌓고, 모자란 주에서 꺼내 쓰는 식이다. 그래서 첫 수집 때 최근 1년 이상의 기록이 필요하다.

**표시된 등급이 게임 안과 다르다면?**
먼저 구매내역을 다시 가져와 본다. 그래도 다르면 프리미엄 PC방 접속분이 빠졌을 가능성이 크다. 위의 [PC방 접속분](#프리미엄-pc방-접속분)을 맞춰보면 된다.

**맥이나 리눅스에서 되나?**
웹은 된다. 윈도우 앱은 WebView2와 Win32 API를 쓰기 때문에 윈도우 전용이다.

**갑자기 수집이 실패한다면?**
넥슨 구매내역 페이지의 구조가 바뀌면 읽지 못할 수 있다. 페이지를 읽는 코드는 웹이 `frontend/src/lib/web/import.ts`, 윈도우 앱이 `app/scrape.js`에 모여 있다.

## 구조

```
app/        pywebview 셸, 넥슨 구매내역 수집, 로컬 캐시 (윈도우 앱)
functions/  Cloudflare Pages Functions — 카카오 로그인, 계정 저장소 (웹)
frontend/
  src/lib/core/   MVP 등급·이월·목표 계획 계산, 인게임 툴팁 읽기
  src/lib/web/    브라우저에서 돌 때의 구현 (북마클릿, 브라우저 저장, 엑셀)
  src/lib/        Svelte 5 + Vite + Tailwind 대시보드
tools/      exe 빌드, 아이콘·바로가기 생성 스크립트
tests/      등급·이월·목표 계획 계산 테스트 (파이썬)
```

등급·이월·목표 계획을 계산하는 곳은 `frontend/src/lib/core/` 한 군데다. 웹이든 윈도우 앱이든 화면은 같은 코드를 쓰고, 파이썬 쪽은 넥슨에서 읽어 오는 일과 주차 계산 규칙(`app/mvp.py`)을 맡는다.

```
cd frontend && npm test        # 계산·인식기·엑셀·이름·속도 제한
venv\Scripts\python -m pytest  # 파이썬 쪽 등급·이월 계산
```

## 문의

무엇이 안 되거나 숫자가 이상하면 <cemigs1@gmail.com>으로 알려주면 된다. 화면 맨 아래에 적힌 빌드 표시(`2026-09-26 · abc1234`)를 같이 보내주면 어느 버전인지 바로 알 수 있다.

## 라이선스

[MIT](LICENSE)
