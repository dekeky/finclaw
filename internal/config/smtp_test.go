package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAppendSMTPSectionIfMissing(t *testing.T) {
	home := t.TempDir()
	t.Setenv(FinclawHomeEnv, home)

	configPath := filepath.Join(home, FinclawConfigFile)
	initial := "serverAddr = \":8082\"\nrssServerAddr = \"http://example.com\"\n"
	if err := os.WriteFile(configPath, []byte(initial), 0644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	cfg, err := loadFinclawConfig()
	if err != nil {
		t.Fatalf("loadFinclawConfig: %v", err)
	}
	if cfg.SMTP == nil {
		t.Fatal("expected in-memory SMTP defaults")
	}
	if cfg.SMTP.Port != 465 {
		t.Fatalf("smtp port = %d, want 465", cfg.SMTP.Port)
	}

	updated, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read updated config: %v", err)
	}
	text := string(updated)
	if !strings.Contains(text, initial) {
		t.Fatal("expected original config content to be preserved")
	}
	if !strings.Contains(text, "[smtp]") {
		t.Fatal("expected [smtp] section appended")
	}
	if !strings.Contains(text, "smtp.qq.com") {
		t.Fatal("expected host comment with example")
	}
	if !strings.Contains(text, "邮箱授权码") {
		t.Fatal("expected password comment")
	}

	// Second load should not duplicate [smtp].
	beforeLen := len(updated)
	cfg2, err := loadFinclawConfig()
	if err != nil {
		t.Fatalf("reload config: %v", err)
	}
	if cfg2.SMTP == nil {
		t.Fatal("expected SMTP on reload")
	}
	updated2, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read config after reload: %v", err)
	}
	if len(updated2) != beforeLen {
		t.Fatalf("config file grew on second load: before=%d after=%d", beforeLen, len(updated2))
	}
}

func TestDefaultFinclawConfigIncludesSMTP(t *testing.T) {
	cfg := defaultFinclawConfig()
	if cfg.SMTP == nil {
		t.Fatal("expected default SMTP settings")
	}
	if cfg.SMTP.Port != 465 {
		t.Fatalf("smtp port = %d, want 465", cfg.SMTP.Port)
	}
}
