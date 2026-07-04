package auth

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"strings"
	"time"
)

// CreateAssetShare stores a new public share link for an agent asset.
func (s *Store) CreateAssetShare(share *AssetShare) (*AssetShare, error) {
	if share == nil {
		return nil, fmt.Errorf("share is required")
	}
	share.UserID = strings.TrimSpace(share.UserID)
	share.AgentName = strings.TrimSpace(share.AgentName)
	share.Kind = strings.TrimSpace(share.Kind)
	share.Path = strings.TrimSpace(share.Path)
	share.Source = strings.TrimSpace(share.Source)
	share.SkillDir = strings.TrimSpace(share.SkillDir)
	if share.UserID == "" || share.AgentName == "" || share.Kind == "" {
		return nil, fmt.Errorf("user_id, agent_name and kind are required")
	}
	switch share.Kind {
	case "doc", "skill":
	default:
		return nil, fmt.Errorf("invalid share kind %q", share.Kind)
	}
	if share.Kind == "skill" && share.SkillDir == "" {
		return nil, fmt.Errorf("skill_dir is required for skill shares")
	}
	token, err := newShareToken()
	if err != nil {
		return nil, err
	}
	share.Token = token
	if share.CreatedAt.IsZero() {
		share.CreatedAt = time.Now()
	}
	if err := s.db.Create(share).Error; err != nil {
		return nil, fmt.Errorf("create share: %w", err)
	}
	return share, nil
}

// GetAssetShare returns a share by token.
func (s *Store) GetAssetShare(token string) (*AssetShare, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, fmt.Errorf("token is required")
	}
	var share AssetShare
	if err := s.db.Where("token = ?", token).First(&share).Error; err != nil {
		return nil, fmt.Errorf("share not found")
	}
	return &share, nil
}

func newShareToken() (string, error) {
	buf := make([]byte, 24)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
