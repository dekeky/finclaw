package config

import (
	"bytes"
	"os"

	"github.com/pelletier/go-toml/v2"
)

// ensureDefaultSMTP fills in-memory defaults when [smtp] is missing from config.
// Returns true when SMTP was absent and defaults were applied.
func ensureDefaultSMTP(cfg *FinclawConfigServer) bool {
	if cfg == nil || cfg.SMTP != nil {
		return false
	}
	cfg.SMTP = defaultSMTPSettings()
	return true
}

func configHasSMTPSection(content []byte) bool {
	var raw map[string]any
	if err := toml.Unmarshal(content, &raw); err != nil {
		return bytes.Contains(content, []byte("[smtp]"))
	}
	_, ok := raw["smtp"]
	return ok
}

func appendSMTPSectionIfMissing() error {
	path := finConfigPath()
	content, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if configHasSMTPSection(content) {
		return nil
	}

	block := defaultSMTPTOMLBlock()

	updated := content
	if len(updated) > 0 && !bytes.HasSuffix(updated, []byte("\n")) {
		updated = append(updated, '\n')
	}
	updated = append(updated, block...)

	return os.WriteFile(path, updated, 0644)
}

func defaultSMTPTOMLBlock() []byte {
	return []byte(defaultSMTPTOMLTemplate)
}

const defaultSMTPTOMLTemplate = `
# 邮箱验证码（可选）。填写后启用注册/找回密码的邮箱验证。
[smtp]
# SMTP 服务器地址，如 smtp.qq.com、smtp.163.com
host = ""
# 端口：SSL 常用 465，TLS/STARTTLS 常用 587
port = 465
# 发信邮箱地址，通常填写完整邮箱
username = ""
# 邮箱授权码（非登录密码，QQ/163 等需在邮箱设置中开启 SMTP 后获取）
password = ""
# 发件人显示名称，如 "Finclaw <your@email.com>"，留空则使用 username
from = ""
`
