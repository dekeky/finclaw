package auth

import "time"

type User struct {
	ID           string    `gorm:"primaryKey;size:64" json:"id"`
	Account      string    `gorm:"uniqueIndex;not null;size:128" json:"account"`
	Email        string    `gorm:"size:128" json:"email,omitempty"`
	PasswordHash string    `gorm:"column:password_hash;not null" json:"-"`
	DisplayName  string    `gorm:"column:display_name;not null;default:''" json:"display_name"`
	CreatedAt    time.Time `json:"created_at"`
}

func (User) TableName() string { return "users" }

type EmailVerificationCode struct {
	ID        uint      `gorm:"primaryKey;autoIncrement"`
	Email     string    `gorm:"index:idx_verification_email_purpose,priority:1;not null;size:128"`
	Code      string    `gorm:"not null;size:6"`
	Purpose   string    `gorm:"index:idx_verification_email_purpose,priority:2;not null;size:32"`
	ExpiresAt time.Time `gorm:"not null"`
	CreatedAt time.Time
}

func (EmailVerificationCode) TableName() string { return "email_verification_codes" }

// AssetShare is a public link to an agent document or skill asset.
type AssetShare struct {
	Token     string    `gorm:"primaryKey;size:64" json:"token"`
	UserID    string    `gorm:"index;not null;size:64" json:"user_id"`
	AgentName string    `gorm:"not null;size:128" json:"agent_name"`
	Kind      string    `gorm:"not null;size:16" json:"kind"`
	Path      string    `gorm:"not null;default:''" json:"path,omitempty"`
	Source    string    `gorm:"size:32;default:''" json:"source,omitempty"`
	SkillDir  string    `gorm:"size:128;default:''" json:"skill_dir,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

func (AssetShare) TableName() string { return "asset_shares" }
