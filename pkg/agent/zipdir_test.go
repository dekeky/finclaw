package agentruntime

import (
	"archive/zip"
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestZipDirectoryToBytes(t *testing.T) {
	tmp := t.TempDir()
	sub := filepath.Join(tmp, "nested")
	if err := os.MkdirAll(sub, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(tmp, "readme.md"), []byte("# Hi"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(sub, "note.txt"), []byte("ok"), 0o644); err != nil {
		t.Fatal(err)
	}

	data, err := ZipDirectoryToBytes(tmp)
	if err != nil {
		t.Fatalf("ZipDirectoryToBytes: %v", err)
	}
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatalf("zip reader: %v", err)
	}
	names := make(map[string]bool, len(zr.File))
	for _, f := range zr.File {
		names[f.Name] = true
	}
	for _, want := range []string{"readme.md", "nested/", "nested/note.txt"} {
		if !names[want] {
			t.Fatalf("missing zip entry %q, got %v", want, names)
		}
	}
}

func TestAttachmentContentDispositionUTF8(t *testing.T) {
	got := attachmentContentDisposition("中文报告.zip")
	if !strings.Contains(got, `filename*=UTF-8''`) {
		t.Fatalf("missing filename* UTF-8: %q", got)
	}
	if !strings.Contains(got, "%E4%B8%AD%E6%96%87") {
		t.Fatalf("missing UTF-8 percent encoding: %q", got)
	}
	if !strings.Contains(got, `filename="`) {
		t.Fatalf("missing ASCII fallback filename: %q", got)
	}
}

func TestZipDownloadFilename(t *testing.T) {
	if got := zipDownloadFilename(`say"hi`); got != `say_hi.zip` {
		t.Fatalf("zipDownloadFilename = %q", got)
	}
}
