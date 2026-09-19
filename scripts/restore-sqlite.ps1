<#
.SYNOPSIS
  从 backups/ 恢复 SQLite 开发库（prisma/dev.db）。

.DESCRIPTION
  Phase 13 数据库恢复保障（SQLite 场景实测）。
  把指定备份文件覆盖回 prisma/dev.db，并比对 SHA-256 校验恢复后文件与备份一致。

.PARAMETER BackupFile
  备份文件路径；不传则自动选用 backups/ 下最新的 dev-*.db。

.EXAMPLE
  pwsh scripts/restore-sqlite.ps1
  pwsh scripts/restore-sqlite.ps1 -BackupFile backups/dev-20260919-093000.db
#>
param(
  [string]$BackupFile = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$target = "prisma/dev.db"

if ([string]::IsNullOrWhiteSpace($BackupFile)) {
  $latest = Get-ChildItem -Path (Join-Path $root "backups") -Filter "dev-*.db" -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $latest) {
    Write-Error "未指定 -BackupFile 且 backups/ 下无 dev-*.db 备份"
    exit 1
  }
  $BackupFile = $latest.FullName
}

if (-not (Test-Path $BackupFile)) {
  Write-Error "未找到备份文件：$BackupFile"
  exit 1
}

Copy-Item -Path $BackupFile -Destination $target -Force

$bkHash = (Get-FileHash $BackupFile -Algorithm SHA256).Hash
$tgHash = (Get-FileHash $target -Algorithm SHA256).Hash
if ($bkHash -ne $tgHash) {
  Write-Error "恢复校验失败：备份与目标 SHA256 不一致"
  exit 1
}

Write-Output "恢复完成：$BackupFile -> $target"
Write-Output "SHA256: $tgHash"
