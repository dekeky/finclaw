package agentruntime

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/finclaw/internal/auth"
	"github.com/finclaw/pkg/agent/picoclaw"
)

// ValidateShareAsset rejects directory targets; only files may be shared.
func ValidateShareAsset(workspace, kind, path, source, skillDir string) error {
	switch strings.TrimSpace(kind) {
	case "doc":
		relPath := strings.TrimSpace(path)
		if relPath == "" {
			return fmt.Errorf("path is required for doc shares")
		}
		absPath, err := resolveDocLocation(workspace, relPath)
		if err != nil {
			return err
		}
		info, err := os.Stat(absPath)
		if err != nil {
			if os.IsNotExist(err) {
				return fmt.Errorf("shared file not found")
			}
			return err
		}
		if info.IsDir() {
			return fmt.Errorf("folder sharing is not supported")
		}
		return nil
	case "skill":
		source = strings.TrimSpace(source)
		if source == "" {
			source = "workspace"
		}
		skillDir = strings.TrimSpace(skillDir)
		if skillDir == "" {
			return fmt.Errorf("skill_dir is required for skill shares")
		}
		relPath := strings.TrimSpace(path)
		absPath, err := picoclaw.ResolveSkillPath(workspace, source, skillDir, relPath)
		if err != nil {
			return err
		}
		info, err := os.Stat(absPath)
		if err != nil {
			if os.IsNotExist(err) {
				return fmt.Errorf("shared skill path not found")
			}
			return err
		}
		if info.IsDir() {
			return fmt.Errorf("folder sharing is not supported")
		}
		return nil
	default:
		return fmt.Errorf("unsupported share kind %q", kind)
	}
}

type ShareMeta struct {
	Token     string `json:"token"`
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Path      string `json:"path,omitempty"`
	IsDir     bool   `json:"is_dir"`
	Size      int64  `json:"size,omitempty"`
	Content   string `json:"content,omitempty"`
	AgentName string `json:"agent_name,omitempty"`
}

// ResolveShareMeta loads metadata (and text content when applicable) for a share token.
func ResolveShareMeta(share *auth.AssetShare, workspace string) (*ShareMeta, error) {
	if share == nil {
		return nil, fmt.Errorf("share is required")
	}
	switch share.Kind {
	case "doc":
		return resolveDocShareMeta(share, workspace)
	case "skill":
		return resolveSkillShareMeta(share, workspace)
	default:
		return nil, fmt.Errorf("unsupported share kind %q", share.Kind)
	}
}

func resolveDocShareMeta(share *auth.AssetShare, workspace string) (*ShareMeta, error) {
	path, err := resolveDocLocation(workspace, share.Path)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("shared file not found")
		}
		return nil, err
	}
	meta := &ShareMeta{
		Token:     share.Token,
		Kind:      share.Kind,
		Name:      filepath.Base(share.Path),
		Path:      share.Path,
		IsDir:     info.IsDir(),
		AgentName: share.AgentName,
	}
	if info.IsDir() {
		return meta, nil
	}
	meta.Size = info.Size()
	if info.Size() > maxDocFileSize {
		return meta, nil
	}
	if isTextLikeDoc(share.Path) {
		data, _, err := readDocFileBytes(workspace, share.Path)
		if err != nil {
			return nil, err
		}
		meta.Content = string(data)
	}
	return meta, nil
}

func resolveSkillShareMeta(share *auth.AssetShare, workspace string) (*ShareMeta, error) {
	source := strings.TrimSpace(share.Source)
	if source == "" {
		source = "workspace"
	}
	relPath := strings.TrimSpace(share.Path)
	path, err := picoclaw.ResolveSkillPath(workspace, source, share.SkillDir, relPath)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("shared skill path not found")
		}
		return nil, err
	}
	displayPath := share.SkillDir
	if relPath != "" {
		displayPath = share.SkillDir + "/" + relPath
	}
	meta := &ShareMeta{
		Token:     share.Token,
		Kind:      share.Kind,
		Name:      filepath.Base(displayPath),
		Path:      displayPath,
		IsDir:     info.IsDir(),
		AgentName: share.AgentName,
	}
	if info.IsDir() {
		return meta, nil
	}
	meta.Size = info.Size()
	if info.Size() > maxSkillFileSize {
		return meta, nil
	}
	if isTextLikeDoc(displayPath) {
		content, err := picoclaw.ReadSkillFile(workspace, source, share.SkillDir, relPath)
		if err != nil {
			return nil, err
		}
		meta.Content = content.Content
	}
	return meta, nil
}

// ServeShareDownload writes the shared asset as a download response payload.
func ServeShareDownload(share *auth.AssetShare, workspace string) (data []byte, filename string, contentType string, err error) {
	switch share.Kind {
	case "doc":
		return serveDocShareDownload(workspace, share.Path)
	case "skill":
		return serveSkillShareDownload(workspace, share)
	default:
		return nil, "", "", fmt.Errorf("unsupported share kind %q", share.Kind)
	}
}

func serveDocShareDownload(workspace, relPath string) ([]byte, string, string, error) {
	path, err := resolveDocLocation(workspace, relPath)
	if err != nil {
		return nil, "", "", err
	}
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, "", "", fmt.Errorf("shared file not found")
		}
		return nil, "", "", err
	}
	if info.IsDir() {
		return nil, "", "", fmt.Errorf("folder sharing is not supported")
	}
	data, _, err := readDocFileBytes(workspace, relPath)
	if err != nil {
		return nil, "", "", err
	}
	return data, filepath.Base(relPath), docDownloadContentType(relPath), nil
}

func serveSkillShareDownload(workspace string, share *auth.AssetShare) ([]byte, string, string, error) {
	source := strings.TrimSpace(share.Source)
	if source == "" {
		source = "workspace"
	}
	relPath := strings.TrimSpace(share.Path)
	path, err := picoclaw.ResolveSkillPath(workspace, source, share.SkillDir, relPath)
	if err != nil {
		return nil, "", "", err
	}
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, "", "", fmt.Errorf("shared skill path not found")
		}
		return nil, "", "", err
	}
	if info.IsDir() {
		return nil, "", "", fmt.Errorf("folder sharing is not supported")
	}
	content, err := picoclaw.ReadSkillFile(workspace, source, share.SkillDir, relPath)
	if err != nil {
		return nil, "", "", err
	}
	name := filepath.Base(relPath)
	if name == "" {
		name = "SKILL.md"
	}
	return []byte(content.Content), name, docDownloadContentType(name), nil
}

func isTextLikeDoc(name string) bool {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".md", ".markdown", ".txt", ".json", ".csv", ".html", ".htm", ".yaml", ".yml":
		return true
	default:
		return false
	}
}

const maxSkillFileSize = 5 << 20
