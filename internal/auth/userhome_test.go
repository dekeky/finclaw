package auth

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/finclaw/internal/config"
)

func TestMigrateUserHomeDirsRenamesLegacyDir(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv(config.FinclawHomeEnv, tmp)

	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	defer store.Close()

	user, err := store.CreateUser("alice", "alice@example.com", "password123", "Alice")
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	newDir, err := UserHomeDirForAccount(user.Account)
	if err != nil {
		t.Fatalf("UserHomeDirForAccount: %v", err)
	}
	legacyDir := filepath.Join(tmp, user.ID)
	if err := os.Rename(newDir, legacyDir); err != nil {
		t.Fatalf("rename new dir to legacy: %v", err)
	}
	if err := os.WriteFile(filepath.Join(legacyDir, "marker.txt"), []byte("ok"), 0o644); err != nil {
		t.Fatalf("write marker: %v", err)
	}

	if err := store.MigrateUserHomeDirs(); err != nil {
		t.Fatalf("MigrateUserHomeDirs: %v", err)
	}
	if _, err := os.Stat(legacyDir); !os.IsNotExist(err) {
		t.Fatalf("legacy dir still exists: %v", err)
	}
	if _, err := os.Stat(newDir); err != nil {
		t.Fatalf("new dir missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(newDir, "marker.txt")); err != nil {
		t.Fatalf("marker not migrated: %v", err)
	}
}

func TestMigrateUserHomeDirsAllowsLegacyEmailAccount(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv(config.FinclawHomeEnv, tmp)

	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	defer store.Close()

	legacyEmail := "legacy@example.com"
	user := &User{
		ID:           "u_1780816992379716403",
		Account:      legacyEmail,
		Email:        legacyEmail,
		PasswordHash: "hash",
	}
	if err := store.db.Create(user).Error; err != nil {
		t.Fatalf("insert legacy user: %v", err)
	}

	legacyDir := filepath.Join(tmp, user.ID)
	if err := os.MkdirAll(legacyDir, 0o755); err != nil {
		t.Fatalf("mkdir legacy dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(legacyDir, "marker.txt"), []byte("ok"), 0o644); err != nil {
		t.Fatalf("write marker: %v", err)
	}

	if err := store.MigrateUserHomeDirs(); err != nil {
		t.Fatalf("MigrateUserHomeDirs: %v", err)
	}

	newDir := filepath.Join(tmp, legacyEmail)
	if _, err := os.Stat(newDir); err != nil {
		t.Fatalf("new dir missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(newDir, "marker.txt")); err != nil {
		t.Fatalf("marker not migrated: %v", err)
	}
}

func TestResolveUserHomeDirUsesAccount(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv(config.FinclawHomeEnv, tmp)

	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	defer store.Close()

	user, err := store.CreateUser("bob01", "bob@example.com", "password123", "Bob")
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	dir, err := store.ResolveUserHomeDir(user.ID)
	if err != nil {
		t.Fatalf("ResolveUserHomeDir: %v", err)
	}
	want := filepath.Join(tmp, "bob01")
	if dir != want {
		t.Fatalf("dir = %q, want %q", dir, want)
	}
}
