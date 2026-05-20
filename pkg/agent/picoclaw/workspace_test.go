package picoclaw

import (
	"testing"
)

func TestValidatePersonaFilename(t *testing.T) {
	for _, name := range PersonaFilenames {
		if err := validatePersonaFilename(name); err != nil {
			t.Fatalf("expected %q to be allowed: %v", name, err)
		}
	}
	if err := validatePersonaFilename("../SOUL.md"); err == nil {
		t.Fatal("expected path traversal to be rejected")
	}
	if err := validatePersonaFilename("MEMORY.md"); err == nil {
		t.Fatal("expected unknown file to be rejected")
	}
}

func TestEnsurePersonaFilesCreatesMissingOnly(t *testing.T) {
	tmp := t.TempDir()
	if err := EnsurePersonaFiles(tmp); err != nil {
		t.Fatalf("EnsurePersonaFiles: %v", err)
	}
	files, err := ReadPersonaFiles(tmp)
	if err != nil {
		t.Fatalf("ReadPersonaFiles: %v", err)
	}
	if len(files) != 3 {
		t.Fatalf("expected 3 files, got %d", len(files))
	}
	for _, f := range files {
		if !f.Exists || f.Content == "" {
			t.Fatalf("expected %s to exist with content", f.Name)
		}
	}

	custom := []byte("# custom soul")
	if err := WritePersonaFile(tmp, "SOUL.md", string(custom)); err != nil {
		t.Fatalf("WritePersonaFile: %v", err)
	}
	if err := EnsurePersonaFiles(tmp); err != nil {
		t.Fatalf("EnsurePersonaFiles second: %v", err)
	}
	files, err = ReadPersonaFiles(tmp)
	if err != nil {
		t.Fatalf("ReadPersonaFiles second: %v", err)
	}
	for _, f := range files {
		if f.Name == "SOUL.md" && f.Content != string(custom) {
			t.Fatalf("EnsurePersonaFiles overwrote SOUL.md: %q", f.Content)
		}
	}
}
