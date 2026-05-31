# Windows 请用:  powershell -ExecutionPolicy Bypass -File .\build.ps1
# Linux/macOS: bash scripts/build.sh
powershell -ExecutionPolicy Bypass -File "$PWD/build.ps1" "$@"
