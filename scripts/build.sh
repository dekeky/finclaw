#!/usr/bin/env bash
# Finclaw 多平台发布构建：先构建前端 embed，再交叉编译至 bin/
# 用法（仓库根目录）: ./scripts/build.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BIN="$ROOT/bin"
mkdir -p "$BIN"

echo "==> frontend build (internal/webui/dist)"
(cd frontend && npm run build)

export CGO_ENABLED=0
LDFLAGS="-s -w"
MAIN="./cmd/agent"

build_one() {
  local goos="$1" goarch="$2" out="$3"
  echo "==> go build ${goos}/${goarch} -> bin/${out}"
  GOOS="$goos" GOARCH="$goarch" go build -trimpath -ldflags="$LDFLAGS" -o "$BIN/$out" "$MAIN"
  ls -lh "$BIN/$out" | awk '{print "    OK (" $5 ")"}'
}

build_one linux   amd64 finclaw-linux-amd64
build_one darwin  amd64 finclaw-darwin-amd64
build_one darwin  arm64 finclaw-darwin-arm64
build_one windows amd64 finclaw-windows-amd64.exe

echo ""
echo "Done. Artifacts in bin/:"
ls -lh "$BIN"
