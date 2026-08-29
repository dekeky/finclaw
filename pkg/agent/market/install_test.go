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

func writeTestZip(t *testing.T, zipPath string, files map[string]string) {
	t.Helper()
	f, err := os.Create(zipPath)
	if err != nil {
		t.Fatal(err)
	}
	zw := zip.NewWriter(f)
	for name, body := range files {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := w.Write([]byte(body)); err != nil {
			t.Fatal(err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestInstallSkillZip_fromFrontmatterName(t *testing.T) {
	tmp := t.TempDir()
	zipPath := filepath.Join(tmp, "pkg.zip")
	writeTestZip(t, zipPath, map[string]string{
		"SKILL.md":  "---\nname: demo-skill\ndescription: A demo skill.\n---\n\n# Demo\n",
		"helper.md": "# Helper\n",
	})

	dest := filepath.Join(tmp, "agent-ws")
	result, err := InstallSkillZip(zipPath, dest, "fallback")
	if err != nil {
		t.Fatalf("InstallSkillZip: %v", err)
	}
	if result.Kind != "skill" || result.SkillDir != "demo-skill" {
		t.Fatalf("result = %+v, want kind=skill skill_dir=demo-skill", result)
	}
	if _, err := os.Stat(filepath.Join(dest, "skills", "demo-skill", "SKILL.md")); err != nil {
		t.Fatalf("expected SKILL.md: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dest, "skills", "demo-skill", "helper.md")); err != nil {
		t.Fatalf("expected helper.md: %v", err)
	}
}

func TestInstallSkillZip_wrappedFolder(t *testing.T) {
	tmp := t.TempDir()
	zipPath := filepath.Join(tmp, "pkg.zip")
	writeTestZip(t, zipPath, map[string]string{
		"my-wrapper/SKILL.md":     "# Nested skill\n\nDoes something.\n",
		"my-wrapper/refs/note.md": "note",
	})

	dest := filepath.Join(tmp, "agent-ws")
	result, err := InstallSkillZip(zipPath, dest, "fallback")
	if err != nil {
		t.Fatalf("InstallSkillZip: %v", err)
	}
	if result.SkillDir != "my-wrapper" {
		t.Fatalf("skill_dir = %q, want my-wrapper", result.SkillDir)
	}
	if _, err := os.Stat(filepath.Join(dest, "skills", "my-wrapper", "refs", "note.md")); err != nil {
		t.Fatalf("expected nested file: %v", err)
	}
}

func TestInstallSkillZip_missingSkillMD(t *testing.T) {
	tmp := t.TempDir()
	zipPath := filepath.Join(tmp, "pkg.zip")
	writeTestZip(t, zipPath, map[string]string{
		"AGENT.md": "# Agent\n",
	})
	_, err := InstallSkillZip(zipPath, filepath.Join(tmp, "ws"), "demo")
	if err == nil {
		t.Fatal("expected error for missing SKILL.md")
	}
}

func TestInstallSkillZip_replacesExisting(t *testing.T) {
	tmp := t.TempDir()
	dest := filepath.Join(tmp, "agent-ws")
	old := filepath.Join(dest, "skills", "demo-skill", "stale.txt")
	if err := os.MkdirAll(filepath.Dir(old), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(old, []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}

	zipPath := filepath.Join(tmp, "pkg.zip")
	writeTestZip(t, zipPath, map[string]string{
		"SKILL.md": "---\nname: demo-skill\ndescription: Replaced.\n---\n\n# New\n",
	})
	if _, err := InstallSkillZip(zipPath, dest, "demo-skill"); err != nil {
		t.Fatalf("InstallSkillZip: %v", err)
	}
	if _, err := os.Stat(old); !os.IsNotExist(err) {
		t.Fatalf("stale file should be removed, err=%v", err)
	}
}

func TestInstallSkillMarkdown(t *testing.T) {
	tmp := t.TempDir()
	mdPath := filepath.Join(tmp, "local.md")
	content := "---\nname: from-md\ndescription: Uploaded markdown.\n---\n\n# Hello\n"
	if err := os.WriteFile(mdPath, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	dest := filepath.Join(tmp, "agent-ws")
	result, err := InstallSkillMarkdown(mdPath, dest, "local")
	if err != nil {
		t.Fatalf("InstallSkillMarkdown: %v", err)
	}
	if result.SkillDir != "from-md" {
		t.Fatalf("skill_dir = %q, want from-md", result.SkillDir)
	}
	got, err := os.ReadFile(filepath.Join(dest, "skills", "from-md", "SKILL.md"))
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != content {
		t.Fatalf("SKILL.md content mismatch")
	}
}
