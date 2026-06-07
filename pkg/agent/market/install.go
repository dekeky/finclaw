package market

import (
	"archive/zip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// extractZip safely unpacks a ZIP file into destDir, guarding against
// path-traversal ("zip slip") entries.
func extractZip(zipPath, destDir string) error {
	zr, err := zip.OpenReader(zipPath)
	if err != nil {
		return fmt.Errorf("open zip: %w", err)
	}
	defer zr.Close()

	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return err
	}
	destClean := filepath.Clean(destDir)
	for _, f := range zr.File {
		target := filepath.Clean(filepath.Join(destClean, f.Name))
		rel, err := filepath.Rel(destClean, target)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			return fmt.Errorf("zip entry %q escapes destination", f.Name)
		}
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		if err := writeZipEntry(f, target); err != nil {
			return err
		}
	}
	return nil
}

func writeZipEntry(f *zip.File, target string) error {
	rc, err := f.Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	out, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, rc)
	return err
}

// findShallowestDir walks root and returns the shallowest directory whose
// base name equals dirName (case-insensitive).
func findShallowestDir(root, dirName string) (string, bool) {
	best := ""
	bestDepth := -1
	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() || !strings.EqualFold(d.Name(), dirName) {
			return nil
		}
		rel, _ := filepath.Rel(root, path)
		depth := strings.Count(filepath.ToSlash(rel), "/")
		if bestDepth == -1 || depth < bestDepth {
			best = path
			bestDepth = depth
		}
		return nil
	})
	if bestDepth == -1 {
		return "", false
	}
	return best, true
}

// singleTopLevelDir returns the sole immediate subdirectory under root, if
// the zip was packaged with one wrapper folder.
func singleTopLevelDir(root string) (string, bool) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return "", false
	}
	var dir string
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		if dir != "" {
			return "", false
		}
		dir = filepath.Join(root, e.Name())
	}
	return dir, dir != ""
}

// findShallowest walks root and returns the directory containing the
// shallowest file whose base name equals baseName (case-insensitive), plus
// whether it was found.
func findShallowest(root, baseName string) (string, bool) {
	best := ""
	bestDepth := -1
	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		if !strings.EqualFold(d.Name(), baseName) {
			return nil
		}
		rel, _ := filepath.Rel(root, path)
		depth := strings.Count(filepath.ToSlash(rel), "/")
		if bestDepth == -1 || depth < bestDepth {
			best = filepath.Dir(path)
			bestDepth = depth
		}
		return nil
	})
	if bestDepth == -1 {
		return "", false
	}
	return best, true
}

// sanitizeSkillDir converts an arbitrary template name into a safe directory
// name (lowercase alphanumeric, dash and underscore).
func sanitizeSkillDir(name string) string {
	name = strings.TrimSpace(strings.ToLower(name))
	var b strings.Builder
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9', r == '-', r == '_':
			b.WriteRune(r)
		case r == ' ' || r == '.':
			b.WriteRune('-')
		}
	}
	out := strings.Trim(b.String(), "-_")
	if out == "" {
		out = "template"
	}
	return out
}

// InstallResult describes how a template was applied to an agent workspace.
type InstallResult struct {
	// Kind is "workspace" (package had AGENT.md, copied to workspace root) or
	// "skill" (package had SKILL.md, copied under workspace/skills/<dir>).
	Kind     string `json:"kind"`
	SkillDir string `json:"skill_dir,omitempty"`
}

// InstallTemplateZip extracts a downloaded template ZIP and routes its files
// into the agent workspace:
//   - if the package contains AGENT.md it is treated as a workspace package and
//     copied into the workspace root (persona files, skills, etc.);
//   - otherwise if it contains SKILL.md it is treated as a skill package and
//     copied into workspace/skills/<templateName>/.
//
// The workspace directory must already exist (or will be created).
func InstallTemplateZip(zipPath, workspace, templateName string) (InstallResult, error) {
	if strings.TrimSpace(workspace) == "" {
		return InstallResult{}, fmt.Errorf("workspace path is required")
	}
	tmpDir, err := os.MkdirTemp("", "finclaw-template-extract-*")
	if err != nil {
		return InstallResult{}, err
	}
	defer os.RemoveAll(tmpDir)

	if err := extractZip(zipPath, tmpDir); err != nil {
		return InstallResult{}, err
	}

	if src, ok := findShallowest(tmpDir, "AGENT.md"); ok {
		if err := os.MkdirAll(workspace, 0o755); err != nil {
			return InstallResult{}, err
		}
		if err := copyTree(src, workspace); err != nil {
			return InstallResult{}, fmt.Errorf("apply workspace template: %w", err)
		}
		return InstallResult{Kind: "workspace"}, nil
	}

	if src, ok := findShallowest(tmpDir, "SKILL.md"); ok {
		skillDir := sanitizeSkillDir(templateName)
		dest := filepath.Join(workspace, "skills", skillDir)
		if err := os.MkdirAll(dest, 0o755); err != nil {
			return InstallResult{}, err
		}
		if err := copyTree(src, dest); err != nil {
			return InstallResult{}, fmt.Errorf("apply skill template: %w", err)
		}
		return InstallResult{Kind: "skill", SkillDir: skillDir}, nil
	}

	// OpenClaw-style packages often ship a workspace/ directory without AGENT.md
	// at the archive root.
	if wsDir, ok := findShallowestDir(tmpDir, "workspace"); ok {
		if err := os.MkdirAll(workspace, 0o755); err != nil {
			return InstallResult{}, err
		}
		if err := copyTree(wsDir, workspace); err != nil {
			return InstallResult{}, fmt.Errorf("apply workspace template: %w", err)
		}
		return InstallResult{Kind: "workspace"}, nil
	}

	// Last resort: single wrapper folder (e.g. my-agent/... with mixed files).
	if wrapper, ok := singleTopLevelDir(tmpDir); ok {
		if err := os.MkdirAll(workspace, 0o755); err != nil {
			return InstallResult{}, err
		}
		if err := copyTree(wrapper, workspace); err != nil {
			return InstallResult{}, fmt.Errorf("apply template bundle: %w", err)
		}
		return InstallResult{Kind: "workspace"}, nil
	}

	return InstallResult{}, fmt.Errorf("template package is not installable: missing AGENT.md, SKILL.md, or workspace/")
}

// copyTree recursively copies the contents of src into dst (merging into
// existing directories, overwriting existing files).
func copyTree(src, dst string) error {
	return filepath.WalkDir(src, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		return copyFile(path, target)
	})
}

func copyFile(src, dst string) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}
