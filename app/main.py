"""MapleMVP 실행 진입점.

python run.py            일반 실행
python run.py --demo     예시 데이터로 실행 (로그인·수집 없음)
python run.py --dev      Vite dev server(http://localhost:5173)를 띄워서 실행
"""
import hashlib
import logging
import socket
import sys

import webview

from . import cache, paths
from .api import MIN_SIZE, Api

DEV_URL = "http://localhost:5173"


def _http_port() -> int | None:
    """화면 파일이 바뀌면 내부 서버 포트도 바뀌게 한다.

    pywebview는 private_mode=False면 포트를 42001로 고정하는데, 그 서버가 캐시 금지 헤더를 주지 않아서
    WebView2가 예전 index.html을 계속 캐시에서 꺼내 쓴다. 새로 빌드하면 스크립트 파일 이름이 바뀌므로
    빈 화면이 된다. 빌드 내용으로 포트를 정하면 새 빌드는 새 주소가 되어 예전 캐시를 쓰지 않는다.
    """
    try:
        digest = hashlib.sha1((paths.DIST / "index.html").read_bytes()).digest()
    except OSError:
        return None
    base = 42100 + int.from_bytes(digest[:2], "big") % 2000
    for i in range(20):
        port = 42100 + (base - 42100 + i * 7) % 2000
        with socket.socket() as s:
            try:
                s.bind(("127.0.0.1", port))
            except OSError:
                continue
            return port
    return None


def main() -> None:
    demo = "--demo" in sys.argv
    dev = "--dev" in sys.argv
    logging.basicConfig(level=logging.INFO if dev else logging.WARNING)

    settings = cache.load(paths.SETTINGS)
    geo = settings.get("window", {})
    api = Api(demo)
    size = (geo.get("width", 1280), geo.get("height", 900))
    win = webview.create_window(
        "MapleMVP",
        DEV_URL if dev else str(paths.DIST / "index.html"),
        js_api=api,
        width=size[0], height=size[1],
        x=geo.get("x"), y=geo.get("y"),
        min_size=MIN_SIZE,
        frameless=True, easy_drag=False,
        background_color="#1b1c21",
    )
    api._attach(win)
    if api._scraper:
        api._scraper.create()

    # 프레임 없는 창은 보고되는 크기가 지정한 크기보다 작게 나와서, 그 차이를 기억해 두고 되돌린다
    offset = [0, 0]

    def measure_offset():
        offset[:] = [size[0] - win.width, size[1] - win.height]

    def remember_geometry():
        if not api._maximized:
            settings = cache.load(paths.SETTINGS)   # 그 사이 다른 값이 저장됐을 수 있다
            settings["window"] = {"width": win.width + offset[0], "height": win.height + offset[1],
                                  "x": win.x, "y": win.y}
            cache.save(paths.SETTINGS, settings)

    win.events.shown += measure_offset
    win.events.closing += remember_geometry
    win.events.closed += api._shutdown

    webview.start(private_mode=False, storage_path=str(paths.WEBVIEW), debug=dev, icon=str(paths.ICON),
                  http_port=None if dev else _http_port())


if __name__ == "__main__":
    main()
