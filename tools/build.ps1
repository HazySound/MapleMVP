# 단일 exe 빌드: 프론트엔드 빌드 → PyInstaller onefile → dist\MapleMVP.exe
# (--specpath를 쓰면 상대 경로가 spec 기준이 되므로 데이터 경로는 절대 경로로 넘긴다)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

# README는 venv로 만들라고 하지만 .venv를 쓰는 사람도 있다. 있는 쪽을 쓴다
$py = "venv\Scripts\python.exe"
if (-not (Test-Path $py)) { $py = ".venv\Scripts\python.exe" }
if (-not (Test-Path $py)) { throw "가상환경을 찾지 못했습니다 (venv 또는 .venv)" }

Push-Location frontend
npm run build
if ($LASTEXITCODE -ne 0) { throw "프론트엔드 빌드 실패" }
Pop-Location

& $py -m PyInstaller --noconfirm --clean --onefile --windowed `
    --name MapleMVP `
    --icon "$root\app\icon.ico" `
    --add-data "$root\frontend\dist;frontend\dist" `
    --add-data "$root\app\scrape.js;app" `
    --add-data "$root\app\usage.js;app" `
    --add-data "$root\app\ocr_templates.npz;app" `
    --add-data "$root\app\icon.ico;app" `
    --workpath build --specpath build `
    run.py
if ($LASTEXITCODE -ne 0) { throw "PyInstaller 빌드 실패" }

Write-Output "완료: $(Join-Path $root 'dist\MapleMVP.exe')"
