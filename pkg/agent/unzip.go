package agentruntime

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// ExtractZipBytes safely unpacks a ZIP archive into destDir, guarding against zip slip.
func ExtractZipBytes(data []byte, destDir string) error {
	if len(data) == 0 {
		return fmt.Errorf("empty zip archive")
	}
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return fmt.Errorf("open zip: %w", err)
	}
	return extractZipReader(zr, destDir)
}

// ExtractZipFile safely unpacks a ZIP file from disk into destDir.
func ExtractZipFile(zipPath, destDir string) error {
	zr, err := zip.OpenReader(zipPath)
	if err != nil {
		return fmt.Errorf("open zip: %w", err)
	}
	defer zr.Close()
	return extractZipReader(&zr.Reader, destDir)
}

func extractZipReader(zr *zip.Reader, destDir string) error {
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

func isZipFilename(name string) bool {
	return strings.EqualFold(filepath.Ext(strings.TrimSpace(name)), ".zip")
}
