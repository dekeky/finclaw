package auth

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/finclaw/internal/config"
)

// UserHomeDirForAccount returns ~/.finclaw/{account} for an existing stored account.
// Unlike NormalizeAccountName, this does not enforce registration rules so legacy
// rows (e.g. email-as-account) can still resolve their home directory.
func UserHomeDirForAccount(account string) (string, error) {
	account = strings.TrimSpace(account)
	if account == "" {
		return "", fmt.Errorf("account is empty")
	}
	return filepath.Join(config.FinclawHomePath(), strings.ToLower(account)), nil
}

// ResolveUserHomeDir maps a user id to the on-disk home directory (~/.finclaw/{account}).
func (s *Store) ResolveUserHomeDir(userID string) (string, error) {
	user, err := s.GetUserByID(userID)
	if err != nil {
		return "", err
	}
	if user == nil {
		return "", fmt.Errorf("user %q not found", userID)
	}
	return UserHomeDirForAccount(user.Account)
}

// ListUserIDs returns all registered user ids.
func (s *Store) ListUserIDs() ([]string, error) {
	var users []User
	if err := s.db.Select("id").Find(&users).Error; err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	ids := make([]string, 0, len(users))
	for _, u := range users {
		if u.ID != "" {
			ids = append(ids, u.ID)
		}
	}
	return ids, nil
}

// MigrateUserHomeDirs renames legacy ~/.finclaw/{userID} directories to ~/.finclaw/{account}.
func (s *Store) MigrateUserHomeDirs() error {
	var users []User
	if err := s.db.Find(&users).Error; err != nil {
		return fmt.Errorf("list users for home migration: %w", err)
	}
	for _, user := range users {
		if err := s.migrateOneUserHome(user); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) migrateOneUserHome(user User) error {
	newDir, err := UserHomeDirForAccount(user.Account)
	if err != nil {
		return fmt.Errorf("user %q account: %w", user.ID, err)
	}
	oldDir := filepath.Join(config.FinclawHomePath(), user.ID)
	if oldDir == newDir {
		return nil
	}

	oldInfo, oldErr := os.Stat(oldDir)
	if oldErr != nil {
		if os.IsNotExist(oldErr) {
			return nil
		}
		return fmt.Errorf("stat legacy home %s: %w", oldDir, oldErr)
	}
	if !oldInfo.IsDir() {
		return nil
	}

	newInfo, newErr := os.Stat(newDir)
	switch {
	case newErr == nil:
		if !newInfo.IsDir() {
			return fmt.Errorf("target home exists and is not a directory: %s", newDir)
		}
		if err := mergeUserHomeDir(oldDir, newDir); err != nil {
			return fmt.Errorf("merge user home %s into %s: %w", oldDir, newDir, err)
		}
		if err := os.RemoveAll(oldDir); err != nil {
			return fmt.Errorf("remove legacy home %s: %w", oldDir, err)
		}
	case os.IsNotExist(newErr):
		if err := os.MkdirAll(filepath.Dir(newDir), 0o755); err != nil {
			return fmt.Errorf("mkdir finclaw home: %w", err)
		}
		if err := os.Rename(oldDir, newDir); err != nil {
			return fmt.Errorf("rename user home %s -> %s: %w", oldDir, newDir, err)
		}
	default:
		return fmt.Errorf("stat target home %s: %w", newDir, newErr)
	}
	return nil
}

func mergeUserHomeDir(src, dst string) error {
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dst, 0o755); err != nil {
		return err
	}
	for _, entry := range entries {
		from := filepath.Join(src, entry.Name())
		to := filepath.Join(dst, entry.Name())
		if _, err := os.Stat(to); err == nil {
			continue
		} else if !os.IsNotExist(err) {
			return err
		}
		if err := os.Rename(from, to); err != nil {
			return err
		}
	}
	return nil
}
