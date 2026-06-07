package market

import (
	"archive/zip"
	"os"
	"path/filepath"
	"testing"
)

func TestInstallTemplateZip_workspaceDir(t *testing.T) {
	tmp := t.TempDir()
	zipPath := filepath.Join(tmp, "pkg.zip")
	wsRoot := filepath.Join(tmp, "pkg", "workspace")
	if err := os.MkdirAll(filepath.Join(wsRoot, "memory"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(wsRoot, "memory", "notes.txt"), []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}

	f, err := os.Create(zipPath)
	if err != nil {
		t.Fatal(err)
	}
	zw := zip.NewWriter(f)
	addZipDir(t, zw, filepath.Join(tmp, "pkg"), "pkg")
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}

	dest := filepath.Join(tmp, "agent-ws")
	result, err := InstallTemplateZip(zipPath, dest, "demo")
	if err != nil {
		t.Fatalf("InstallTemplateZip: %v", err)
	}
	if result.Kind != "workspace" {
		t.Fatalf("kind = %q, want workspace", result.Kind)
	}
	if _, err := os.Stat(filepath.Join(dest, "memory", "notes.txt")); err != nil {
		t.Fatalf("expected workspace file: %v", err)
	}
}

func addZipDir(t *testing.T, zw *zip.Writer, root, prefix string) {
	t.Helper()
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		name := filepath.ToSlash(filepath.Join(prefix, rel))
		if d.IsDir() {
			_, err = zw.Create(name + "/")
			return err
		}
		w, err := zw.Create(name)
		if err != nil {
			return err
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		_, err = w.Write(data)
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
}
