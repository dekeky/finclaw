package webui

import "embed"

// 构建产物写入本目录 dist/，由 Vite outDir 指定。
// 发布：先 frontend 执行 npm run build，再在仓库根执行 go build（或 go generate ./internal/webui）
//
//go:generate npm --prefix ../../frontend run build

//go:embed all:dist
var distRoot embed.FS
