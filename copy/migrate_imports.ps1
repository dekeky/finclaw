# 迁移脚本：替换 import 路径 (Windows PowerShell)
# 使用方法: .\migrate_imports.ps1 -SourcePath "xxx" -TargetPath "yyy"

param(
    [Parameter(Mandatory=$true)]
    [string]$SourcePath,

    [Parameter(Mandatory=$true)]
    [string]$TargetPath
)

Write-Host "Replacing import paths..." -ForegroundColor Cyan
Write-Host "  Source: $SourcePath"
Write-Host "  Target: $TargetPath"
Write-Host ""

Get-ChildItem -Path . -Filter "*.go" -Recurse | ForEach-Object {
    $file = $_.FullName

    # 读取文件内容
    $content = Get-Content -Path $file -Raw -Encoding UTF8

    # 替换路径
    $newContent = $content -replace [regex]::Escape($SourcePath), $TargetPath

    # 如果内容有变化，写回文件
    if ($content -ne $newContent) {
        Set-Content -Path $file -Value $newContent -Encoding UTF8 -NoNewline
        Write-Host "  Processed: $file" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Migration complete!" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Review the changes: git diff"
Write-Host "2. Run 'go mod tidy' to update dependencies"
Write-Host "3. Verify compilation: go build ./..."
Write-Host "4. Add external dependencies to go.mod"
