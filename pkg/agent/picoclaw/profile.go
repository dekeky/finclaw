package picoclaw

import (
	"bytes"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"strings"
)

const (
	AvatarFilename = "avatar.png"
	maxAvatarBytes = 512 * 1024
	maxAvatarDim   = 512
)

// AgentDir returns the on-disk directory for one agent under a user home.
func AgentDir(home, agentName string) string {
	return filepath.Join(home, agentName)
}

// AvatarPath returns the stored avatar file path for an agent.
func AvatarPath(home, agentName string) string {
	return filepath.Join(AgentDir(home, agentName), AvatarFilename)
}

// HasAvatar reports whether the agent has a non-empty avatar file.
func HasAvatar(home, agentName string) bool {
	st, err := os.Stat(AvatarPath(home, agentName))
	return err == nil && st.Size() > 0
}

// SaveAvatar validates image bytes and writes a normalized PNG avatar.
func SaveAvatar(home, agentName string, data []byte) error {
	if len(data) == 0 {
		return fmt.Errorf("avatar data is empty")
	}
	if len(data) > maxAvatarBytes {
		return fmt.Errorf("avatar exceeds max size (%d KB)", maxAvatarBytes/1024)
	}

	normalized, err := normalizeAvatarPNG(data)
	if err != nil {
		return err
	}

	dir := AgentDir(home, agentName)
	if st, err := os.Stat(dir); err != nil || !st.IsDir() {
		return fmt.Errorf("agent %q not found", agentName)
	}

	path := AvatarPath(home, agentName)
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, normalized, 0o644); err != nil {
		return fmt.Errorf("write avatar: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("commit avatar: %w", err)
	}
	return nil
}

// DeleteAvatar removes a custom avatar if present.
func DeleteAvatar(home, agentName string) error {
	path := AvatarPath(home, agentName)
	err := os.Remove(path)
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove avatar: %w", err)
	}
	return nil
}

// RenameAgentDir renames an agent directory on disk.
func RenameAgentDir(home, oldName, newName string) error {
	oldName = strings.TrimSpace(oldName)
	newName = strings.TrimSpace(newName)
	if oldName == "" || newName == "" {
		return fmt.Errorf("agent name is required")
	}
	if oldName == newName {
		return nil
	}

	oldDir := AgentDir(home, oldName)
	newDir := AgentDir(home, newName)

	if st, err := os.Stat(oldDir); err != nil || !st.IsDir() {
		return fmt.Errorf("agent %q not found", oldName)
	}
	if _, err := os.Stat(newDir); err == nil {
		return fmt.Errorf("agent %q already exists", newName)
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("stat target dir: %w", err)
	}

	if err := os.Rename(oldDir, newDir); err != nil {
		return fmt.Errorf("rename agent directory: %w", err)
	}
	return nil
}

func normalizeAvatarPNG(data []byte) ([]byte, error) {
	img, err := decodeAvatarImage(data)
	if err != nil {
		return nil, err
	}
	bounds := img.Bounds()
	if bounds.Dx() > maxAvatarDim || bounds.Dy() > maxAvatarDim {
		return nil, fmt.Errorf("avatar dimensions exceed %dx%d", maxAvatarDim, maxAvatarDim)
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, fmt.Errorf("encode avatar: %w", err)
	}
	if buf.Len() > maxAvatarBytes {
		return nil, fmt.Errorf("avatar exceeds max size (%d KB)", maxAvatarBytes/1024)
	}
	return buf.Bytes(), nil
}

func decodeAvatarImage(data []byte) (image.Image, error) {
	img, format, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("invalid image: %w", err)
	}
	switch format {
	case "jpeg", "png", "gif":
		return img, nil
	default:
		return nil, fmt.Errorf("unsupported image format %q (use JPEG, PNG, or GIF)", format)
	}
}
