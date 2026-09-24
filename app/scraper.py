"""maplestory.nexon.com을 띄운 숨김 창으로 구매내역을 가져온다."""
from __future__ import annotations

import logging
import re
import threading
import time
from typing import Callable
from urllib.parse import quote, urlparse

import webview

from . import paths

log = logging.getLogger(__name__)

HOME = "https://maplestory.nexon.com/Home/Main"
MAPLE_HOST = "maplestory.nexon.com"
# 넥슨 통합 캐시 사용내역. 이 페이지 안에서만 public.api.nexon.com 호출이 허용된다 (CORS)
USAGE = "https://payment.nexon.com/usage/?pagecode=2"
USAGE_HOST = "payment.nexon.com"
LOGIN = "https://nxlogin.nexon.com/common/login.aspx?redirect=" + quote(HOME, safe="")
DATE_RE = re.compile(r"(\d{4})\D+(\d{1,2})\D+(\d{1,2})")

# 넥슨 로그인 창의 '로그인 상태 유지'를 켠다. 일반 체크박스가 아니라 role=checkbox 버튼이다
KEEP_JS = """Promise.resolve((function () {
  var boxes = document.querySelectorAll('button[role="checkbox"]');
  for (var i = 0; i < boxes.length; i++) {
    var b = boxes[i];
    var around = b.parentElement ? b.parentElement.innerText || '' : '';
    if (around.indexOf('유지') < 0) continue;
    if (b.getAttribute('aria-checked') === 'true') return 'already';
    b.click();
    return 'checked';
  }
  return 'none';
})())"""


class NeedsLogin(Exception):
    pass


class ScrapeError(Exception):
    pass


class Scraper:
    def __init__(self, on_logged_in: Callable[[], None]):
        self._on_logged_in = on_logged_in
        self._window: webview.Window | None = None
        self._login_mode = False
        self._quitting = False
        self._js = paths.SCRAPE_JS.read_text(encoding="utf-8")
        self._usage_js = paths.USAGE_JS.read_text(encoding="utf-8")

    def create(self) -> None:
        self._window = webview.create_window(
            "넥슨 로그인 · MapleMVP", HOME, hidden=True,
            width=520, height=780, background_color="#1b1c21",
        )
        self._window.events.loaded += self._on_loaded
        self._window.events.closing += self._on_closing

    def destroy(self) -> None:
        self._quitting = True
        if self._window:
            self._window.destroy()

    # ---- 수집 ----
    def fetch_month(self, year: int, month: int) -> list[dict]:
        res = self._run(self._js.replace("__YEAR__", str(year)).replace("__MONTH__", str(month)),
                        host=MAPLE_HOST)
        if not isinstance(res, dict):
            raise ScrapeError("넥슨 페이지에서 알 수 없는 응답이 왔어요.")
        if res.get("needsLogin"):
            raise NeedsLogin()
        if res.get("error") == "layout":
            raise ScrapeError("구매내역 페이지 구조가 바뀌어서 읽지 못했어요.")
        rows = []
        for r in res.get("rows", []):
            m = DATE_RE.search(r["date"])
            if not m:
                continue
            y, mo, d = map(int, m.groups())
            rows.append({"date": f"{y:04d}-{mo:02d}-{d:02d}", "item": r["item"], "price": int(r["price"] or 0)})
        return rows

    def fetch_usage_month(self, year: int, month: int) -> list[dict]:
        """넥슨 통합 사용내역에서 한 달치 원본 행을 가져온다 (게임 구분·상태값 그대로)."""
        res = self._run(self._usage_js.replace("__YEAR__", str(year)).replace("__MONTH__", str(month)),
                        host=USAGE_HOST)
        if not isinstance(res, dict):
            raise ScrapeError("넥슨 결제 페이지에서 알 수 없는 응답이 왔어요.")
        if res.get("needsLogin"):
            log.warning("사용내역 %d-%02d: 로그인 필요 (status=%s) / 창 상태: %s",
                        year, month, res.get("status"), self.page_hint())
            raise NeedsLogin()
        if res.get("error"):
            log.error("사용내역 %d-%02d 실패: error=%s status=%s detail=%s",
                      year, month, res.get("error"), res.get("status"), res.get("detail"))
            log.error("그때 창 상태: %s", self.page_hint())
            raise ScrapeError(f"넥슨 사용내역을 읽지 못했어요. ({res.get('error')} {res.get('status') or ''})".strip())
        rows = res.get("rows", [])
        log.info("사용내역 %d-%02d: 원본 %d건", year, month, len(rows))
        return rows

    def goto(self, url: str, host: str) -> None:
        """숨김 창을 다른 오리진으로 옮긴다. 이미 그 호스트면 아무것도 하지 않는다."""
        w = self._window
        if not w.events.loaded.wait(30):
            raise ScrapeError("넥슨 페이지가 열리지 않아요. 인터넷 연결을 확인해 주세요.")
        if (urlparse(w.get_current_url() or "").hostname or "") == host:
            return
        log.info("숨김 창 이동: %s -> %s", urlparse(w.get_current_url() or "").hostname, host)
        w.events.loaded.clear()
        w.load_url(url)
        if not w.events.loaded.wait(30):
            raise ScrapeError("넥슨 페이지가 열리지 않아요. 인터넷 연결을 확인해 주세요.")
        landed = urlparse(w.get_current_url() or "").hostname or ""
        if landed != host:
            # 로그인 페이지 등 다른 곳으로 밀려났다
            log.warning("%s로 가려 했는데 %s에 도착했어요 — 로그인이 필요해 보입니다", host, landed)
            raise NeedsLogin()

    PAGE_HINT_JS = r"""Promise.resolve((function () {
  var t = (document.body && document.body.innerText || '').replace(/\s+/g, ' ').trim();
  return { url: location.href, title: document.title, text: t.slice(0, 400) };
})())"""

    def page_hint(self) -> dict | None:
        """지금 창에 뭐가 떠 있는지. 수집이 실패했을 때 원인 파악용으로 로그에 남긴다."""
        return self._eval(self.PAGE_HINT_JS)

    def _eval(self, script: str, timeout: float = 5):
        """결과를 기다리되, 실패하면 None을 돌려준다."""
        done = threading.Event()
        box = {}
        try:
            self._window.evaluate_js(script, lambda v: (box.update(v=v), done.set()))
        except Exception:
            return None
        return box.get("v") if done.wait(timeout) else None

    def _run(self, script: str, timeout: float = 60, host: str = MAPLE_HOST):
        w = self._window
        if not w.events.loaded.wait(30):
            raise ScrapeError("넥슨 페이지가 열리지 않아요. 인터넷 연결을 확인해 주세요.")
        if (urlparse(w.get_current_url() or "").hostname or "") != host:
            # 로그인 창에 머물러 있으면 같은 오리진 요청이 불가능
            raise NeedsLogin()
        done = threading.Event()
        box = {}

        def cb(value):
            box["v"] = value
            done.set()

        w.evaluate_js(script, cb)
        if not done.wait(timeout):
            raise ScrapeError("넥슨 페이지가 응답하지 않아요. 잠시 후 다시 시도해 주세요.")
        return box.get("v")

    # ---- 로그인 ----
    def open_login(self) -> None:
        self._login_mode = True
        self._window.load_url(LOGIN)
        self._window.show()
        threading.Thread(target=self._keep_signed_in, daemon=True).start()

    def _keep_signed_in(self) -> None:
        """'로그인 상태 유지'를 미리 켜 둔다. 넥슨이 이 선택을 기억해 주지 않아서 매번 켜 줘야 한다."""
        for _ in range(30):
            time.sleep(0.5)
            if not self._login_mode:
                return
            if self._eval(KEEP_JS) in ("checked", "already"):
                return

    def _on_loaded(self) -> None:
        if not self._login_mode:
            return
        url = self._window.get_current_url() or ""
        if (urlparse(url).hostname or "") != "maplestory.nexon.com":
            return
        # 로그인 후 메이플 홈으로 돌아왔다 → 세션 확인
        threading.Thread(target=self._confirm_login, daemon=True).start()

    def _confirm_login(self) -> None:
        from datetime import datetime
        from .mvp import KST
        now = datetime.now(KST)
        try:
            self.fetch_month(now.year, now.month)
        except NeedsLogin:
            return
        except ScrapeError as e:
            log.warning("login check failed: %s", e)
            return
        self._login_mode = False
        self._window.hide()
        self._on_logged_in()

    def park(self) -> None:
        """로그인 창을 숨기고 원래 페이지로 돌려놓는다 (세션 유지를 위해 창을 없애지는 않는다)."""
        self._login_mode = False

        def run():
            self._window.hide()
            self._window.load_url(HOME)

        threading.Thread(target=run, daemon=True).start()

    def _on_closing(self):
        if self._quitting:
            return True
        self.park()
        return False
