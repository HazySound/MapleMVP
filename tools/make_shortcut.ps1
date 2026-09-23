# 바탕화면에 MapleMVP 바로가기를 만든다 (콘솔 창 없이 pythonw로 실행)
$root = Split-Path $PSScriptRoot -Parent
$lnk = Join-Path ([Environment]::GetFolderPath("Desktop")) "MapleMVP.lnk"
$sc = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$sc.TargetPath = Join-Path $root "venv\Scripts\pythonw.exe"
$sc.Arguments = "`"$(Join-Path $root 'run.py')`""
$sc.WorkingDirectory = $root
$sc.IconLocation = Join-Path $root "app\icon.ico"
$sc.Description = "메이플 MVP 결제 실적"
$sc.Save()
Write-Output "만들었어요: $lnk"
