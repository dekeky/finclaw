package auth

import (
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"net/mail"
	"strings"
	"time"
)

const (
	PurposeRegister      = "register"
	PurposeResetPassword = "reset_password"

	codeLength   = 6
	codeTTL      = 10 * time.Minute
	sendCooldown = 60 * time.Second
)

var (
	ErrInvalidEmail       = errors.New("invalid email address")
	ErrCodeExpired        = errors.New("verification code expired or not found")
	ErrCodeInvalid        = errors.New("invalid verification code")
	ErrSendTooFrequent    = errors.New("please wait before requesting another code")
	ErrEmailAlreadyExists          = errors.New("email already registered")
	ErrAccountAlreadyExists        = errors.New("account already registered")
	ErrInvalidAccount              = errors.New("account must be 3-64 characters and cannot be an email address")
	ErrEmailNotFound               = errors.New("email not registered")
	ErrVerificationNotConfigured  = errors.New("email verification is not configured")
	ErrSMTPSendFailed             = errors.New("failed to send verification email")
)

func NormalizeEmail(email string) (string, error) {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" {
		return "", ErrInvalidEmail
	}
	addr, err := mail.ParseAddress(email)
	if err != nil {
		return "", ErrInvalidEmail
	}
	return strings.ToLower(addr.Address), nil
}

func NormalizeAccountName(account string) (string, error) {
	account = strings.TrimSpace(account)
	if len(account) < 3 || len(account) > 64 {
		return "", ErrInvalidAccount
	}
	if strings.Contains(account, "@") {
		return "", ErrInvalidAccount
	}
	return strings.ToLower(account), nil
}

func (s *Store) CreateVerificationCode(email, purpose string) (string, error) {
	email, err := NormalizeEmail(email)
	if err != nil {
		return "", err
	}
	if purpose != PurposeRegister && purpose != PurposeResetPassword {
		return "", fmt.Errorf("unsupported verification purpose: %s", purpose)
	}

	var last EmailVerificationCode
	err = s.db.Where("email = ? AND purpose = ?", email, purpose).
		Order("created_at DESC").
		Limit(1).
		Find(&last).Error
	if err != nil {
		return "", err
	}
	if last.ID > 0 && time.Since(last.CreatedAt) < sendCooldown {
		return "", ErrSendTooFrequent
	}

	code, err := generateNumericCode(codeLength)
	if err != nil {
		return "", err
	}

	record := EmailVerificationCode{
		Email:     email,
		Code:      code,
		Purpose:   purpose,
		ExpiresAt: time.Now().Add(codeTTL),
		CreatedAt: time.Now(),
	}
	if err := s.db.Create(&record).Error; err != nil {
		return "", fmt.Errorf("insert verification code: %w", err)
	}
	return code, nil
}

func (s *Store) VerifyCode(email, purpose, code string) error {
	email, err := NormalizeEmail(email)
	if err != nil {
		return err
	}
	code = strings.TrimSpace(code)
	if code == "" {
		return ErrCodeInvalid
	}

	var record EmailVerificationCode
	err = s.db.Where("email = ? AND purpose = ?", email, purpose).
		Order("created_at DESC").
		Limit(1).
		Find(&record).Error
	if err != nil {
		return err
	}
	if record.ID == 0 {
		return ErrCodeExpired
	}
	if time.Now().After(record.ExpiresAt) {
		return ErrCodeExpired
	}
	if record.Code != code {
		return ErrCodeInvalid
	}
	return nil
}

func (s *Store) ConsumeVerificationCode(email, purpose, code string) error {
	if err := s.VerifyCode(email, purpose, code); err != nil {
		return err
	}
	email, err := NormalizeEmail(email)
	if err != nil {
		return err
	}
	return s.db.Where("email = ? AND purpose = ?", email, purpose).
		Delete(&EmailVerificationCode{}).Error
}

func (s *Store) DeleteVerificationCodes(email, purpose string) error {
	email, err := NormalizeEmail(email)
	if err != nil {
		return err
	}
	return s.db.Where("email = ? AND purpose = ?", email, purpose).
		Delete(&EmailVerificationCode{}).Error
}

func generateNumericCode(length int) (string, error) {
	const digits = "0123456789"
	out := make([]byte, length)
	for i := range out {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(digits))))
		if err != nil {
			return "", err
		}
		out[i] = digits[n.Int64()]
	}
	return string(out), nil
}
