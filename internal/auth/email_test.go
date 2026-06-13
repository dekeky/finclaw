package auth

import (
	"errors"
	"strings"
	"testing"

	finclawconfig "github.com/finclaw/internal/config"
)

func TestFormatMailError(t *testing.T) {
	msg := formatMailError(errors.New("dial tcp: i/o timeout"))
	if msg == "" {
		t.Fatal("expected message")
	}
	if got := formatMailError(ErrSMTPSendFailed); got == "" {
		t.Fatal("expected default message")
	}
}

func TestMailerBuildFromWithExplicitFrom(t *testing.T) {
	m := NewMailer(&finclawconfig.SMTPSettings{
		Username: "user@example.com",
		From:     "Finclaw <notify@example.com>",
	})
	header, envelope := m.buildFrom()
	if envelope != "notify@example.com" {
		t.Fatalf("envelope = %q, want notify@example.com", envelope)
	}
	if !strings.Contains(header, "notify@example.com") {
		t.Fatalf("header = %q, want sender email", header)
	}
}

func TestMailerBuildFromDefaultsDisplayName(t *testing.T) {
	m := NewMailer(&finclawconfig.SMTPSettings{
		Username: "user@example.com",
	})
	header, envelope := m.buildFrom()
	if envelope != "user@example.com" {
		t.Fatalf("envelope = %q", envelope)
	}
	if !strings.Contains(header, "Finclaw") {
		t.Fatalf("header = %q, want default display name", header)
	}
}

func TestEncodeMIMEHeaderChinese(t *testing.T) {
	encoded := encodeMIMEHeader("Finclaw 注册验证码")
	if encoded == "Finclaw 注册验证码" {
		t.Fatal("expected RFC 2047 encoding for non-ASCII subject")
	}
	if !strings.HasPrefix(encoded, "=?utf-8?") {
		t.Fatalf("encoded = %q", encoded)
	}
}
