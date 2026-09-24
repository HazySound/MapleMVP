import os
import sys
from pathlib import Path

# PyInstaller로 묶였을 때는 번들 폴더 기준
ROOT = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))
DIST = ROOT / "frontend" / "dist"
SCRAPE_JS = ROOT / "app" / "scrape.js"
USAGE_JS = ROOT / "app" / "usage.js"
ICON = ROOT / "app" / "icon.ico"

DATA = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "MapleMVP"
DATA.mkdir(parents=True, exist_ok=True)
CACHE = DATA / "cache.json"
SETTINGS = DATA / "settings.json"
PLAN = DATA / "plan.json"
PCROOM = DATA / "pcroom.json"
UI = DATA / "ui.json"
LOG = DATA / "log.txt"
WEBVIEW = DATA / "webview"
