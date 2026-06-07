package agentruntime

import (
	"os"
	"path/filepath"
	"testing"
)

func TestListDocFilesRootMergesScanRoots(t *testing.T) {
	tmp := t.TempDir()
	if err := os.MkdirAll(filepath.Join(tmp, "reports"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(tmp, "reports", "daily.md"), []byte("# daily"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(tmp, "docs"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(tmp, "docs", "notes.md"), []byte("notes"), 0o644); err != nil {
		t.Fatal(err)
	}

	files, err := ListDocFiles(tmp, "")
	if err != nil {
		t.Fatalf("ListDocFiles: %v", err)
	}
	names := map[string]bool{}
	for _, f := range files {
		names[f.Name] = true
		if f.Name == "docs" || f.Name == "reports" {
			t.Fatalf("scan root %q should not appear in merged listing", f.Name)
		}
	}
	if !names["daily.md"] || !names["notes.md"] {
		t.Fatalf("merged files = %+v", files)
	}
}

func TestListDocFilesMergedNestedDir(t *testing.T) {
	tmp := t.TempDir()
	nested := filepath.Join(tmp, "analysis", "2026")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(nested, "stock.md"), []byte("stock"), 0o644); err != nil {
		t.Fatal(err)
	}

	rootFiles, err := ListDocFiles(tmp, "")
	if err != nil {
		t.Fatalf("ListDocFiles root: %v", err)
	}
	var has2026 bool
	for _, f := range rootFiles {
		if f.Name == "2026" && f.IsDir {
			has2026 = true
		}
	}
	if !has2026 {
		t.Fatalf("root files = %+v", rootFiles)
	}

	files, err := ListDocFiles(tmp, "2026")
	if err != nil {
		t.Fatalf("ListDocFiles nested: %v", err)
	}
	if len(files) != 1 || files[0].Name != "stock.md" {
		t.Fatalf("nested files = %+v", files)
	}
}

func TestReadDocFileFindsAcrossScanRoots(t *testing.T) {
	tmp := t.TempDir()
	reportDir := filepath.Join(tmp, "reports")
	if err := os.MkdirAll(reportDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(reportDir, "daily.md"), []byte("# daily"), 0o644); err != nil {
		t.Fatal(err)
	}

	read, err := ReadDocFile(tmp, "daily.md")
	if err != nil {
		t.Fatalf("ReadDocFile: %v", err)
	}
	if read.Content != "# daily" {
		t.Fatalf("content = %q", read.Content)
	}
}

func TestListDocFilesVirtualReportsDirNotScanRoot(t *testing.T) {
	tmp := t.TempDir()
	if err := os.MkdirAll(filepath.Join(tmp, "docs", "reports"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(tmp, "docs", "reports", "from-docs.md"), []byte("a"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(tmp, "reports"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(tmp, "reports", "from-root.md"), []byte("b"), 0o644); err != nil {
		t.Fatal(err)
	}

	files, err := ListDocFiles(tmp, "reports")
	if err != nil {
		t.Fatalf("ListDocFiles: %v", err)
	}
	names := map[string]bool{}
	for _, f := range files {
		names[f.Name] = true
	}
	if !names["from-docs.md"] || names["from-root.md"] {
		t.Fatalf("virtual reports folder should only contain nested docs, got = %+v", files)
	}

	rootFiles, err := ListDocFiles(tmp, "")
	if err != nil {
		t.Fatalf("ListDocFiles root: %v", err)
	}
	for _, f := range rootFiles {
		if f.Name == "from-root.md" && !f.IsDir {
			return
		}
	}
	t.Fatalf("from-root.md should appear at merged root, got = %+v", rootFiles)
}

func TestReadWriteDocFileExplicitScanRootPath(t *testing.T) {
	tmp := t.TempDir()

	written, err := WriteDocFile(tmp, "reports/explicit.md", "# explicit")
	if err != nil {
		t.Fatalf("WriteDocFile: %v", err)
	}
	if written.Name != "reports/explicit.md" {
		t.Fatalf("written name = %q", written.Name)
	}

	read, err := ReadDocFile(tmp, "reports/explicit.md")
	if err != nil {
		t.Fatalf("ReadDocFile: %v", err)
	}
	if read.Content != "# explicit" {
		t.Fatalf("content = %q", read.Content)
	}
}

func TestWriteDocFileDefaultsToDocs(t *testing.T) {
	tmp := t.TempDir()
	if _, err := WriteDocFile(tmp, "legacy.md", "# legacy"); err != nil {
		t.Fatalf("WriteDocFile: %v", err)
	}
	if _, err := os.Stat(filepath.Join(tmp, "docs", "legacy.md")); err != nil {
		t.Fatalf("legacy file missing under docs/: %v", err)
	}
}

func TestDeleteDocPathRemovesAcrossScanRoots(t *testing.T) {
	tmp := t.TempDir()
	for _, root := range []string{"docs", "reports"} {
		dir := filepath.Join(tmp, root, "shared")
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "note.md"), []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if err := DeleteDocPath(tmp, "shared"); err != nil {
		t.Fatalf("DeleteDocPath: %v", err)
	}
	if _, err := os.Stat(filepath.Join(tmp, "docs", "shared")); !os.IsNotExist(err) {
		t.Fatalf("docs/shared still exists")
	}
	if _, err := os.Stat(filepath.Join(tmp, "reports", "shared")); !os.IsNotExist(err) {
		t.Fatalf("reports/shared still exists")
	}
}
