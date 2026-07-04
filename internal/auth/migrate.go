package auth

import (
	"fmt"

	"gorm.io/gorm"
)

func migrate(db *gorm.DB) error {
	if err := migrateUsersSchema(db); err != nil {
		return err
	}
	return db.AutoMigrate(&EmailVerificationCode{}, &AssetShare{})
}

func migrateUsersSchema(db *gorm.DB) error {
	migrator := db.Migrator()
	if !migrator.HasTable("users") {
		return migrator.CreateTable(&User{})
	}

	if err := migrateEmailColumnToAccount(db); err != nil {
		return err
	}

	if !migrator.HasColumn("users", "account") {
		if err := db.Exec(`ALTER TABLE users ADD COLUMN account TEXT`).Error; err != nil {
			return fmt.Errorf("add account column: %w", err)
		}
	}
	if !migrator.HasColumn("users", "display_name") {
		if err := db.Exec(`ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT ''`).Error; err != nil {
			return fmt.Errorf("add display_name column: %w", err)
		}
	}
	if !migrator.HasColumn("users", "email") {
		if err := db.Exec(`ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT ''`).Error; err != nil {
			return fmt.Errorf("add email column: %w", err)
		}
	}

	// Backfill legacy rows before any NOT NULL enforcement.
	if err := db.Exec(`UPDATE users SET account = id WHERE account IS NULL OR account = ''`).Error; err != nil {
		return fmt.Errorf("backfill account: %w", err)
	}
	if err := db.Exec(`UPDATE users SET display_name = '' WHERE display_name IS NULL`).Error; err != nil {
		return fmt.Errorf("backfill display_name: %w", err)
	}
	if err := db.Exec(`UPDATE users SET email = account WHERE (email IS NULL OR email = '') AND account LIKE '%@%'`).Error; err != nil {
		return fmt.Errorf("backfill email: %w", err)
	}
	if err := db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email != ''`).Error; err != nil {
		return fmt.Errorf("create email index: %w", err)
	}

	return nil
}

func migrateEmailColumnToAccount(db *gorm.DB) error {
	migrator := db.Migrator()
	if !migrator.HasTable("users") {
		return nil
	}
	if !migrator.HasColumn("users", "email") {
		return nil
	}
	if migrator.HasColumn("users", "account") {
		return nil
	}
	return db.Exec(`ALTER TABLE users RENAME COLUMN email TO account`).Error
}
