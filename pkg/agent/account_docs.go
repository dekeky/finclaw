package agentruntime

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/finclaw/pkg/agent/picoclaw"
	"github.com/sipeed/picoclaw/pkg/logger"
)

// AccountDocsDirName is the account-level directory that hosts the shared
// document roots (docs/reports/analysis/...) for every agent under the account.
// It mirrors the virtual roots previously scanned from each agent's own
// workspace, so a document's logical path (e.g. "reports/x.md") stays stable.
const AccountDocsDirName = "docs"

// AccountDocsDir returns the account-level shared docs directory for an
// account home (the argument to UserAgentHome).
func AccountDocsDir(home string) string {
	return filepath.Join(home, AccountDocsDirName)
}

// AccountDocsRootForUser returns the account-level shared docs directory for
// the authenticated user.
func AccountDocsRootForUser(userID string) string {
	return AccountDocsDir(UserAgentHome(userID))
}

// EnsureAccountDocsSwept migrates legacy agent-local docs into the shared
// account docs directory (throttled). Exported for public share resolution.
func EnsureAccountDocsSwept(userID string) {
	ensureAccountDocsSwept(UserAgentHome(userID))
}

var (
	docsSweepMu   sync.Mutex
	docsSweptAt   = map[string]time.Time{}
	docsSweepStep = 15 * time.Second
)

// ensureAccountDocsSwept moves agent-local documents (legacy workspace
// locations) into the shared account docs directory. It runs at most once per
// account per docsSweepStep so frequently refreshing the docs tree stays cheap.
// Failures are logged and non-fatal: leftover agent-local files simply wait for
// the next sweep.
func ensureAccountDocsSwept(home string) {
	docsSweepMu.Lock()
	last, ok := docsSweptAt[home]
	docsSweepMu.Unlock()
	if ok && time.Since(last) < docsSweepStep {
		return
	}
	if err := SweepLegacyAgentDocsIntoAccount(home); err != nil {
		logger.WarnCF("agent", "Failed to sweep legacy agent docs into account docs", map[string]any{
			"home":  home,
			"error": err.Error(),
		})
	}
	docsSweepMu.Lock()
	docsSweptAt[home] = time.Now()
	docsSweepMu.Unlock()
}

// SweepLegacyAgentDocsIntoAccount migrates documents that an agent previously
// created inside its own workspace (under one of the DocScanRoots folders) into
// the account-level shared docs directory. The scan roots are the same, so the
// relative document path is preserved and all agents share the same files.
//
// Collision policy: when both the source and the destination exist, the newer
// file wins and the other copy is removed. Empty source folders are cleaned up.
func SweepLegacyAgentDocsIntoAccount(home string) error {
	docRoot := AccountDocsDir(home)
	agentNames, err := agentNamesFromDisk(home)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(docRoot, 0o755); err != nil {
		return fmt.Errorf("create account docs dir: %w", err)
	}
	for _, agentName := range agentNames {
		workspace := picoclaw.AgentWorkspacePath(home, agentName)
		for _, root := range DocScanRoots {
			srcDir := filepath.Join(workspace, root)
			info, err := os.Stat(srcDir)
			if err != nil {
				if os.IsNotExist(err) {
					continue
				}
				return err
			}
			if !info.IsDir() {
				continue
			}
			destDir := filepath.Join(docRoot, root)
			if err := mergeDirInto(srcDir, destDir); err != nil {
				return fmt.Errorf("merge agent %q docs dir %q: %w", agentName, root, err)
			}
			removeEmptyDirs(srcDir)
		}
	}
	return nil
}

// mergeDirInto moves every regular file under srcDir into destDir (creating
// nested directories as needed). When both sides have the same relative file
// the newer copy wins.
func mergeDirInto(srcDir, destDir string) error {
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return err
	}
	return filepath.WalkDir(srcDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if path == srcDir {
			return nil
		}
		rel, err := filepath.Rel(srcDir, path)
		if err != nil {
			return err
		}
		dest := filepath.Join(destDir, rel)
		if d.IsDir() {
			return os.MkdirAll(dest, 0o755)
		}
		// Never follow symlinks out of the source tree.
		if d.Type()&os.ModeSymlink != 0 {
			return os.Remove(path)
		}
		return mergeMoveFile(path, dest)
	})
}

func mergeMoveFile(src, dest string) error {
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return err
	}
	destInfo, err := os.Stat(dest)
	if err != nil {
		if os.IsNotExist(err) {
			return os.Rename(src, dest)
		}
		return err
	}
	if destInfo.IsDir() {
		return fmt.Errorf("cannot merge file into existing directory %q", dest)
	}
	srcInfo, err := os.Stat(src)
	if err != nil {
		return err
	}
	// Keep whichever is newer; drop the older copy so the shared folder stays
	// the single source of truth.
	if !srcInfo.ModTime().After(destInfo.ModTime()) {
		return os.Remove(src)
	}
	if err := os.Remove(dest); err != nil {
		return err
	}
	return os.Rename(src, dest)
}

// removeEmptyDirs prunes empty directories under root (bottom-up).
func removeEmptyDirs(root string) {
	var dirs []string
	_ = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err == nil && d.IsDir() && path != root {
			dirs = append(dirs, path)
		}
		return nil
	})
	for i := len(dirs) - 1; i >= 0; i-- {
		entries, err := os.ReadDir(dirs[i])
		if err == nil && len(entries) == 0 {
			_ = os.Remove(dirs[i])
		}
	}
	// Also drop the top-level root folder itself when it became empty.
	if entries, err := os.ReadDir(root); err == nil && len(entries) == 0 {
		_ = os.Remove(root)
	}
}
