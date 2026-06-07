package agentruntime

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const maxDocFileSize = 5 << 20 // 5MB

type DocFileEntry struct {
	Name    string `json:"name"`
	Size    int64  `json:"size"`
	ModTime string `json:"mod_time"`
	IsDir   bool   `json:"is_dir"`
}

type DocFileContent struct {
	Name    string `json:"name"`
	Content string `json:"content"`
	Size    int64  `json:"size"`
}

func ListDocFiles(workspace, subpath string) ([]DocFileEntry, error) {
	if strings.TrimSpace(workspace) == "" {
		return nil, fmt.Errorf("workspace path is required")
	}
	if subpath != "" {
		if err := validateDocPath(subpath); err != nil {
			return nil, err
		}
	}
	dir := filepath.Join(workspace, "docs", subpath)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return []DocFileEntry{}, nil
		}
		return nil, fmt.Errorf("read docs directory: %w", err)
	}
	out := make([]DocFileEntry, 0, len(entries))
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		out = append(out, DocFileEntry{
			Name:    e.Name(),
			Size:    info.Size(),
			ModTime: info.ModTime().Format("2006-01-02T15:04:05Z07:00"),
			IsDir:   e.IsDir(),
		})
	}
	return out, nil
}

func ReadDocFile(workspace, filename string) (*DocFileContent, error) {
	if strings.TrimSpace(workspace) == "" {
		return nil, fmt.Errorf("workspace path is required")
	}
	if err := validateDocPath(filename); err != nil {
		return nil, err
	}
	path := filepath.Join(workspace, "docs", filename)
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("file %q not found", filename)
		}
		return nil, fmt.Errorf("stat file: %w", err)
	}
	if info.IsDir() {
		return nil, fmt.Errorf("%q is a directory", filename)
	}
	if info.Size() > maxDocFileSize {
		return nil, fmt.Errorf("file %q exceeds 5MB size limit", filename)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read file: %w", err)
	}
	return &DocFileContent{
		Name:    filename,
		Content: string(data),
		Size:    info.Size(),
	}, nil
}

// WriteDocFile creates or overwrites a file under the agent's docs/ directory.
func WriteDocFile(workspace, filename, content string) (*DocFileContent, error) {
	if strings.TrimSpace(workspace) == "" {
		return nil, fmt.Errorf("workspace path is required")
	}
	if err := validateDocPath(filename); err != nil {
		return nil, err
	}
	if len(content) > maxDocFileSize {
		return nil, fmt.Errorf("content exceeds 5MB size limit")
	}
	path := filepath.Join(workspace, "docs", filename)
	if info, err := os.Stat(path); err == nil && info.IsDir() {
		return nil, fmt.Errorf("%q is a directory", filename)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("create directory: %w", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		return nil, fmt.Errorf("write file: %w", err)
	}
	return &DocFileContent{
		Name:    filename,
		Content: content,
		Size:    int64(len(content)),
	}, nil
}

// DeleteDocPath removes a file or directory (recursively) under docs/.
func DeleteDocPath(workspace, name string) error {
	if strings.TrimSpace(workspace) == "" {
		return fmt.Errorf("workspace path is required")
	}
	if err := validateDocPath(name); err != nil {
		return err
	}
	path := filepath.Join(workspace, "docs", name)
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("%q not found", name)
		}
		return fmt.Errorf("stat path: %w", err)
	}
	if info.IsDir() {
		return os.RemoveAll(path)
	}
	return os.Remove(path)
}

func validateDocPath(name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("path is required")
	}
	if strings.HasPrefix(name, "/") || strings.Contains(name, "\\") {
		return fmt.Errorf("path %q contains invalid characters", name)
	}
	segs := strings.Split(name, "/")
	for _, s := range segs {
		s = strings.TrimSpace(s)
		if s == "" || s == "." || s == ".." {
			return fmt.Errorf("path %q contains invalid segments", name)
		}
	}
	return nil
}
