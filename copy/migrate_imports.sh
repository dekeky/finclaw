#!/bin/bash

# 迁移脚本：替换 import 路径
# 使用方法: ./migrate_imports.sh <源路径> <目标路径>

set -e

if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <source_path> <target_path>"
    echo "Example: $0 github.com/sipeed/picoclaw/pkg github.com/your-org/your-agent/pkg"
    exit 1
fi

SOURCE_PATH="$1"
TARGET_PATH="$2"

echo "Replacing import paths..."
echo "  Source: $SOURCE_PATH"
echo "  Target: $TARGET_PATH"
echo ""

# 在所有 .go 文件中替换 import 路径
find . -name "*.go" -type f | while read -r file; do
    # 使用 sed 替换（macOS 和 Linux 兼容）
    sed -i.bak "s|${SOURCE_PATH}|${TARGET_PATH}|g" "$file"

    # 删除备份文件
    rm -f "${file}.bak"

    echo "  Processed: $file"
done

echo ""
echo "Migration complete!"
echo ""
echo "Next steps:"
echo "1. Review the changes: git diff"
echo "2. Run 'go mod tidy' to update dependencies"
echo "3. Verify compilation: go build ./..."
echo "4. Add external dependencies to go.mod"
