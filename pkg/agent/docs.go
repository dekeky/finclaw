package agentruntime

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"time"
)

const maxDocFileSize = 5 << 20 // 5MB

// DocScanRoots lists workspace subdirectories scanned for agent document assets.
var DocScanRoots = []string{
	"docs",
	"doc",
	"reports",
	"report",
	"analysis",
	"research",
	"memos",
	"screening",
}

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

func isDocScanRoot(name string) bool {
	return slices.Contains(DocScanRoots, name)
}

func isExplicitScanRootPath(relPath string) bool {
	segs := strings.Split(strings.TrimSpace(relPath), "/")
	return len(segs) > 0 && isDocScanRoot(segs[0])
}

func docDirsForVirtualSubpath(workspace, subpath string) []string {
	dirs := make([]string, 0, len(DocScanRoots))
	for _, root := range DocScanRoots {
		dir := filepath.Join(workspace, root)
		if subpath != "" {
			dir = filepath.Join(dir, subpath)
		}
		dirs = append(dirs, dir)
	}
	return dirs
}

func findExistingDocPaths(workspace, relPath string) []string {
	out := make([]string, 0, len(DocScanRoots))
	for _, root := range DocScanRoots {
		p := filepath.Join(workspace, root, relPath)
		if _, err := os.Stat(p); err == nil {
			out = append(out, p)
		}
	}
	return out
}

func pickPreferredDocPath(paths []string) string {
	if len(paths) == 0 {
		return ""
	}
	if len(paths) == 1 {
		return paths[0]
	}
	best := paths[0]
	var bestTime time.Time
	if info, err := os.Stat(best); err == nil {
		bestTime = info.ModTime()
	}
	for _, p := range paths[1:] {
		info, err := os.Stat(p)
		if err != nil {
			continue
		}
		if info.ModTime().After(bestTime) {
			best = p
			bestTime = info.ModTime()
		}
	}
	return best
}

func mergeDocEntries(entries []DocFileEntry) []DocFileEntry {
	byName := make(map[string]DocFileEntry, len(entries))
	for _, entry := range entries {
		existing, ok := byName[entry.Name]
		if !ok {
			byName[entry.Name] = entry
			continue
		}
		existingTime, _ := time.Parse(time.RFC3339, existing.ModTime)
		entryTime, _ := time.Parse(time.RFC3339, entry.ModTime)
		switch {
		case existing.IsDir || entry.IsDir:
			merged := existing
			merged.IsDir = true
			if entryTime.After(existingTime) {
				merged.ModTime = entry.ModTime
			}
			byName[entry.Name] = merged
		case entryTime.After(existingTime):
			byName[entry.Name] = entry
		}
	}
	out := make([]DocFileEntry, 0, len(byName))
	for _, entry := range byName {
		out = append(out, entry)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].IsDir != out[j].IsDir {
			return out[i].IsDir
		}
		return out[i].Name < out[j].Name
	})
	return out
}

func ListDocFiles(workspace, subpath string) ([]DocFileEntry, error) {
	if strings.TrimSpace(workspace) == "" {
		return nil, fmt.Errorf("workspace path is required")
	}
	subpath = strings.TrimSpace(subpath)
	if subpath != "" {
		if err := validateDocPath(subpath); err != nil {
			return nil, err
		}
	}

	merged := make([]DocFileEntry, 0)
	for _, dir := range docDirsForVirtualSubpath(workspace, subpath) {
		entries, err := listSingleDocDir(dir)
		if err != nil {
			return nil, err
		}
		merged = append(merged, entries...)
	}
	return mergeDocEntries(merged), nil
}

func listSingleDocDir(dir string) ([]DocFileEntry, error) {
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
			ModTime: info.ModTime().Format(time.RFC3339),
			IsDir:   e.IsDir(),
		})
	}
	return out, nil
}

func resolveDocLocation(workspace, relPath string) (string, error) {
	if strings.TrimSpace(workspace) == "" {
		return "", fmt.Errorf("workspace path is required")
	}
	relPath = strings.TrimSpace(relPath)
	if relPath == "" {
		return "", fmt.Errorf("path is required")
	}
	if err := validateDocPath(relPath); err != nil {
		return "", err
	}
	if isExplicitScanRootPath(relPath) {
		return filepath.Join(append([]string{workspace}, strings.Split(relPath, "/")...)...), nil
	}
	matches := findExistingDocPaths(workspace, relPath)
	if len(matches) > 0 {
		return pickPreferredDocPath(matches), nil
	}
	return filepath.Join(workspace, "docs", relPath), nil
}

func readDocFileBytes(workspace, filename string) ([]byte, int64, error) {
	path, err := resolveDocLocation(workspace, filename)
	if err != nil {
		return nil, 0, err
	}
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, 0, fmt.Errorf("file %q not found", filename)
		}
		return nil, 0, fmt.Errorf("stat file: %w", err)
	}
	if info.IsDir() {
		return nil, 0, fmt.Errorf("%q is a directory", filename)
	}
	if info.Size() > maxDocFileSize {
		return nil, 0, fmt.Errorf("file %q exceeds 5MB size limit", filename)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, 0, fmt.Errorf("read file: %w", err)
	}
	return data, info.Size(), nil
}

func ReadDocFile(workspace, filename string) (*DocFileContent, error) {
	data, size, err := readDocFileBytes(workspace, filename)
	if err != nil {
		return nil, err
	}
	return &DocFileContent{
		Name:    filename,
		Content: string(data),
		Size:    size,
	}, nil
}

// WriteDocFile creates or overwrites a file under one of the agent document scan roots.
func WriteDocFile(workspace, filename, content string) (*DocFileContent, error) {
	if len(content) > maxDocFileSize {
		return nil, fmt.Errorf("content exceeds 5MB size limit")
	}
	path, err := resolveDocLocation(workspace, filename)
	if err != nil {
		return nil, err
	}
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

// DeleteDocPath removes a file or directory (recursively) under a document scan root.
func DeleteDocPath(workspace, name string) error {
	if strings.TrimSpace(workspace) == "" {
		return fmt.Errorf("workspace path is required")
	}
	if err := validateDocPath(name); err != nil {
		return err
	}
	if isExplicitScanRootPath(name) {
		path := filepath.Join(append([]string{workspace}, strings.Split(name, "/")...)...)
		return deleteDocPathAt(path, name)
	}
	matches := findExistingDocPaths(workspace, name)
	if len(matches) == 0 {
		return fmt.Errorf("%q not found", name)
	}
	for _, path := range matches {
		if err := deleteDocPathAt(path, name); err != nil {
			return err
		}
	}
	return nil
}

func deleteDocPathAt(path, name string) error {
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
