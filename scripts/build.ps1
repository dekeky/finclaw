# Finclaw 多平台发布构建：先构建前端 embed，再交叉编译至 bin/
# 用法（仓库根目录）: .\scripts\build.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$BinDir = Join-Path $Root "bin"
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

Write-Host "==> frontend build (internal/webui/dist)"
Push-Location (Join-Path $Root "frontend")
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
Pop-Location

$env:CGO_ENABLED = "0"
$Main = "./cmd/agent"

$Targets = @(
    @{ GOOS = "linux";   GOARCH = "amd64"; Out = "finclaw-linux-amd64" },
    @{ GOOS = "darwin";  GOARCH = "amd64"; Out = "finclaw-darwin-amd64" },
    @{ GOOS = "darwin";  GOARCH = "arm64"; Out = "finclaw-darwin-arm64" },
    @{ GOOS = "windows"; GOARCH = "amd64"; Out = "finclaw-windows-amd64.exe" }
)

foreach ($t in $Targets) {
    $outPath = Join-Path $BinDir $t.Out
    Write-Host "==> go build $($t.GOOS)/$($t.GOARCH) -> bin/$($t.Out)"
    $env:GOOS = $t.GOOS
    $env:GOARCH = $t.GOARCH
    go build -trimpath "-ldflags=-s -w" -o $outPath $Main
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $mb = [math]::Round((Get-Item $outPath).Length / 1MB, 2)
    Write-Host "    OK ($mb MB)"
}

Write-Host ""
Write-Host "Done. Artifacts in bin/:"
Get-ChildItem $BinDir -File | Sort-Object Name | ForEach-Object {
    $mb = [math]::Round($_.Length / 1MB, 2)
    Write-Host ("  {0,-30} {1,6} MB" -f $_.Name, $mb)
}
