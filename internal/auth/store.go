package auth

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/finclaw/internal/config"
)

type Store struct {
	db *gorm.DB
}

func NewStore() (*Store, error) {
	dbPath := dbPath()
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		return nil, fmt.Errorf("create db directory: %w", err)
	}

	sqlDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	db, err := gorm.Open(sqlite.Dialector{Conn: sqlDB}, &gorm.Config{})
	if err != nil {
		_ = sqlDB.Close()
		return nil, fmt.Errorf("open gorm: %w", err)
	}

	if err := migrate(db); err != nil {
		_ = closeDB(db)
		return nil, fmt.Errorf("migrate: %w", err)
	}

	return &Store{db: db}, nil
}

func (s *Store) Close() error {
	return closeDB(s.db)
}

func closeDB(db *gorm.DB) error {
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	return sqlDB.Close()
}

func (s *Store) CreateUser(account, email, password, displayName string) (*User, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	user := &User{
		ID:           generateUserID(),
		Account:      account,
		Email:        email,
		PasswordHash: string(hash),
		DisplayName:  displayName,
		CreatedAt:    time.Now(),
	}
	if err := s.db.Create(user).Error; err != nil {
		return nil, fmt.Errorf("insert user: %w", err)
	}

	userDir := userHomeDir(user.ID)
	if err := os.MkdirAll(userDir, 0755); err != nil {
		return nil, fmt.Errorf("create user directory: %w", err)
	}

	return user, nil
}

func (s *Store) GetUserByAccount(account string) (*User, error) {
	var user User
	if err := s.db.Where("account = ?", account).Limit(1).Find(&user).Error; err != nil {
		return nil, err
	}
	if user.ID == "" {
		return nil, nil
	}
	return &user, nil
}

func (s *Store) GetUserByEmail(email string) (*User, error) {
	if email == "" {
		return nil, nil
	}
	var user User
	if err := s.db.Where("email = ?", email).Limit(1).Find(&user).Error; err != nil {
		return nil, err
	}
	if user.ID == "" {
		return nil, nil
	}
	return &user, nil
}

func (s *Store) GetUserByLogin(login string) (*User, error) {
	login = strings.TrimSpace(login)
	if login == "" {
		return nil, nil
	}

	if strings.Contains(login, "@") {
		email, err := NormalizeEmail(login)
		if err == nil {
			user, err := s.GetUserByEmail(email)
			if err != nil || user != nil {
				return user, err
			}
			user, err = s.GetUserByAccount(email)
			if err != nil || user != nil {
				return user, err
			}
		}
	}

	account, err := NormalizeAccountName(login)
	if err != nil {
		return s.GetUserByAccount(strings.ToLower(login))
	}
	return s.GetUserByAccount(account)
}

func (s *Store) GetUserByID(id string) (*User, error) {
	var user User
	if err := s.db.Where("id = ?", id).Limit(1).Find(&user).Error; err != nil {
		return nil, err
	}
	if user.ID == "" {
		return nil, nil
	}
	return &user, nil
}

func (s *Store) UpdatePasswordByEmail(email, password string) error {
	email, err := NormalizeEmail(email)
	if err != nil {
		return err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	result := s.db.Model(&User{}).Where("email = ?", email).Update("password_hash", string(hash))
	if result.Error != nil {
		return fmt.Errorf("update password: %w", result.Error)
	}
	if result.RowsAffected > 0 {
		return nil
	}

	result = s.db.Model(&User{}).Where("account = ?", email).Update("password_hash", string(hash))
	if result.Error != nil {
		return fmt.Errorf("update password: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrEmailNotFound
	}
	return nil
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

func generateUserID() string {
	return fmt.Sprintf("u_%d", time.Now().UnixNano())
}
