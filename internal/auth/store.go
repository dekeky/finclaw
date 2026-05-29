package auth

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"

	"github.com/finclaw/internal/config"
	"golang.org/x/crypto/bcrypt"
)

type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	DisplayName  string    `json:"display_name"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
}

type Store struct {
	db *sql.DB
}

func NewStore() (*Store, error) {
	dbPath := dbPath()
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		return nil, fmt.Errorf("create db directory: %w", err)
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	if err := migrate(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}

	return &Store{db: db}, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) CreateUser(email, password, displayName string) (*User, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	id := generateUserID()
	_, err = s.db.Exec(
		"INSERT INTO users (id, email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)",
		id, email, string(hash), displayName, time.Now(),
	)
	if err != nil {
		return nil, fmt.Errorf("insert user: %w", err)
	}

	userDir := userHomeDir(id)
	if err := os.MkdirAll(userDir, 0755); err != nil {
		return nil, fmt.Errorf("create user directory: %w", err)
	}

	return &User{ID: id, Email: email, DisplayName: displayName, CreatedAt: time.Now()}, nil
}

func (s *Store) GetUserByEmail(email string) (*User, error) {
	row := s.db.QueryRow(
		"SELECT id, email, password_hash, display_name, created_at FROM users WHERE email = ?",
		email,
	)
	var u User
	if err := row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.DisplayName, &u.CreatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &u, nil
}

func (s *Store) GetUserByID(id string) (*User, error) {
	row := s.db.QueryRow(
		"SELECT id, email, password_hash, display_name, created_at FROM users WHERE id = ?",
		id,
	)
	var u User
	if err := row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.DisplayName, &u.CreatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &u, nil
}

func CheckPassword(hashed, plain string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hashed), []byte(plain)) == nil
}

func UserHomeDir(userID string) string {
	return userHomeDir(userID)
}

func userHomeDir(userID string) string {
	return filepath.Join(config.FinclawHomePath(), userID)
}

func dbPath() string {
	return filepath.Join(config.FinclawHomePath(), "users.db")
}

func migrate(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS users (
			id           TEXT PRIMARY KEY,
			email        TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
			display_name TEXT NOT NULL DEFAULT '',
			created_at   DATETIME NOT NULL DEFAULT (datetime('now'))
		);
	`)
	return err
}

func generateUserID() string {
	return fmt.Sprintf("u_%d", time.Now().UnixNano())
}
