<#
.SYNOPSIS
  备份 SQLite 开发库（prisma/dev.db）到 backups/ 目录。

.DESCRIPTION
  Phase 13 数据库备份保障（SQLite 场景实测）。
  SQLite 是单文件库，备份即文件复制；复制后比对 SHA-256 确保字节级一致。
  备份文件名带时间戳，便于按时间点回滚。

.PARAMETER SourceDb
  源库路径，默认 prisma/dev.db（相对项目根）。

.EXAMPLE
  pwsh scripts/backup-sqlite.ps1
#>
param(
  [string]$SourceDb = "prisma/dev.db"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path $SourceDb)) {
  Write-Error "未找到源库：$SourceDb（请先 npm run db:dev:push 与 db:dev:seed）"
  exit 1
}

$backupDir = Join-Path $root "backups"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dest = Join-Path $backupDir "dev-$stamp.db"

Copy-Item -Path $SourceDb -Destination $dest -Force

$srcHash = (Get-FileHash $SourceDb -Algorithm SHA256).Hash
$dstHash = (Get-FileHash $dest -Algorithm SHA256).Hash
if ($srcHash -ne $dstHash) {
  Write-Error "备份校验失败：源与备份 SHA256 不一致"
  exit 1
}

Write-Output "备份完成：$dest"
Write-Output "SHA256: $dstHash"
