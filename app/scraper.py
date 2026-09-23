"""maplestory.nexon.com을 띄운 숨김 창으로 구매내역을 가져온다."""
from __future__ import annotations

import logging
import re
import threading
from typing import Callable
from urllib.parse import quote, urlparse

import webview

from . import paths

log = logging.getLogger(__name__)

HOME = "https://maplestory.nexon.com/Home/Main"
LOGIN = "https://nxlogin.nexon.com/common/login.aspx?redirect=" + quote(HOME, safe="")
DATE_RE = re.compile(r"(\d{4})\D+(\d{1,2})\D+(\d{1,2})")


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
        res = self._run(self._js.replace("__YEAR__", str(year)).replace("__MONTH__", str(month)))
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

    def _run(self, script: str, timeout: float = 60):
        w = self._window
        if not w.events.loaded.wait(30):
            raise ScrapeError("넥슨 페이지가 열리지 않아요. 인터넷 연결을 확인해 주세요.")
        host = urlparse(w.get_current_url() or "").hostname or ""
        if host != "maplestory.nexon.com":
            # 로그인 창에 머물러 있으면 같은 도메인 fetch가 불가능
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

    def _on_closing(self):
        if self._quitting:
            return True
        # 사용자가 로그인 창을 닫아도 세션 유지를 위해 창은 숨기기만 한다
        self._login_mode = False

        def park():
            self._window.hide()
            self._window.load_url(HOME)

        threading.Thread(target=park, daemon=True).start()
        return False
