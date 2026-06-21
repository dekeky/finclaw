package auth

import (
	"database/sql"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

func TestNormalizeEmail(t *testing.T) {
	tests := []struct {
		in    string
		want  string
		valid bool
	}{
		{" User@Example.com ", "user@example.com", true},
		{"bad-email", "", false},
		{"", "", false},
	}
	for _, tt := range tests {
		got, err := NormalizeEmail(tt.in)
		if tt.valid && err != nil {
			t.Fatalf("NormalizeEmail(%q) unexpected error: %v", tt.in, err)
		}
		if !tt.valid && err == nil {
			t.Fatalf("NormalizeEmail(%q) expected error", tt.in)
		}
		if tt.valid && got != tt.want {
			t.Fatalf("NormalizeEmail(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestVerificationCodeFlow(t *testing.T) {
	t.Setenv("FINCLAW_HOME", t.TempDir())

	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })

	email := "test@example.com"
	code, err := store.CreateVerificationCode(email, PurposeRegister)
	if err != nil {
		t.Fatalf("CreateVerificationCode: %v", err)
	}
	if len(code) != codeLength {
		t.Fatalf("code length = %d, want %d", len(code), codeLength)
	}
	if err := store.VerifyCode(email, PurposeRegister, code); err != nil {
		t.Fatalf("VerifyCode: %v", err)
	}
	if err := store.ConsumeVerificationCode(email, PurposeRegister, code); err != nil {
		t.Fatalf("ConsumeVerificationCode: %v", err)
	}
	if err := store.VerifyCode(email, PurposeRegister, code); err == nil {
		t.Fatal("expected code to be consumed")
	}
}

func TestMigrateLegacyUsersSchema(t *testing.T) {
	home := t.TempDir()
	t.Setenv("FINCLAW_HOME", home)

	dbPath := filepath.Join(home, "users.db")
	sqlDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	_, err = sqlDB.Exec(`
		CREATE TABLE users (
			id TEXT PRIMARY KEY,
			password_hash TEXT NOT NULL,
			created_at DATETIME NOT NULL
		);
		INSERT INTO users (id, password_hash, created_at) VALUES ('u_legacy', 'hash', datetime('now'));
	`)
	if err != nil {
		t.Fatalf("seed legacy schema: %v", err)
	}
	_ = sqlDB.Close()

	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore on legacy schema: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })

	user, err := store.GetUserByID("u_legacy")
	if err != nil {
		t.Fatalf("GetUserByID: %v", err)
	}
	if user == nil {
		t.Fatal("expected legacy user")
	}
	if user.Account != "u_legacy" {
		t.Fatalf("account = %q, want u_legacy", user.Account)
	}
}

func TestNormalizeAccountName(t *testing.T) {
	got, err := NormalizeAccountName(" Alice_01 ")
	if err != nil {
		t.Fatalf("NormalizeAccountName: %v", err)
	}
	if got != "alice_01" {
		t.Fatalf("got %q, want alice_01", got)
	}
	if _, err := NormalizeAccountName("bad@email.com"); err == nil {
		t.Fatal("expected error for email-like account")
	}
}

func TestGetUserByLogin(t *testing.T) {
	t.Setenv("FINCLAW_HOME", t.TempDir())

	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })

	_, err = store.CreateUser("alice", "alice@example.com", "secret123", "Alice")
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	byAccount, err := store.GetUserByLogin("Alice")
	if err != nil || byAccount == nil {
		t.Fatalf("GetUserByLogin by account: %v", err)
	}
	byEmail, err := store.GetUserByLogin("alice@example.com")
	if err != nil || byEmail == nil {
		t.Fatalf("GetUserByLogin by email: %v", err)
	}
	if byAccount.ID != byEmail.ID {
		t.Fatal("expected same user")
	}
}

func TestRegisterWithoutVerification(t *testing.T) {
	t.Setenv("FINCLAW_HOME", t.TempDir())

	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })

	handler := NewHandler(store, nil)
	if handler.verificationEnabled() {
		t.Fatal("expected verification disabled without SMTP config")
	}

	user, err := store.CreateUser("alice", "", "secret123", "Alice")
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	if user.Account != "alice" {
		t.Fatalf("account = %q, want alice", user.Account)
	}
}
