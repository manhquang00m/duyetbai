# Tao shortcut "Thread Affiliate Launcher" tren Desktop de mo launcher GUI (khong hien console).
# Chay 1 lan:  powershell -ExecutionPolicy Bypass -File launcher\create_shortcut.ps1
$ErrorActionPreference = 'Stop'

$pythonw = (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source
if (-not $pythonw) {
    Write-Error 'Khong tim thay pythonw.exe trong PATH. Cai Python (co tick "Add to PATH") roi chay lai.'
    exit 1
}

$launcher = Join-Path $PSScriptRoot 'duyetbai_launcher.pyw'
$repo = Split-Path $PSScriptRoot -Parent
$lnkPath = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Thread Affiliate Launcher.lnk'

$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($lnkPath)
$lnk.TargetPath = $pythonw
$lnk.Arguments = "`"$launcher`""
$lnk.WorkingDirectory = $repo
$lnk.Description = 'Thread Affiliate Launcher'
$icon = Join-Path $PSScriptRoot 'app.ico'
$lnk.IconLocation = if (Test-Path $icon) { "$icon,0" } else { "$pythonw,0" }
$lnk.Save()

# Xoa shortcut ten cu (ban dau dat la duyetbai.lnk) neu con
$old = Join-Path ([Environment]::GetFolderPath('Desktop')) 'duyetbai.lnk'
if (Test-Path $old) { Remove-Item $old }

Write-Host "Da tao shortcut: $lnkPath"
