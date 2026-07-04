package agentruntime

import (
	"os"
	"path/filepath"
	"testing"
)

func TestValidateShareAssetSkillFile(t *testing.T) {
	tmp := t.TempDir()
	skillDir := filepath.Join(tmp, "workspace", "skills", "demo-skill")
	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(skillDir, "SKILL.md"), []byte("# Demo"), 0o644); err != nil {
		t.Fatal(err)
	}

	workspace := filepath.Join(tmp, "workspace")
	if err := ValidateShareAsset(workspace, "skill", "SKILL.md", "workspace", "demo-skill"); err != nil {
		t.Fatalf("ValidateShareAsset skill file: %v", err)
	}
}

func TestValidateShareAssetSkillDirRejected(t *testing.T) {
	tmp := t.TempDir()
	skillDir := filepath.Join(tmp, "workspace", "skills", "demo-skill")
	if err := os.MkdirAll(filepath.Join(skillDir, "refs"), 0o755); err != nil {
		t.Fatal(err)
	}

	workspace := filepath.Join(tmp, "workspace")
	err := ValidateShareAsset(workspace, "skill", "refs", "workspace", "demo-skill")
	if err == nil || err.Error() != "folder sharing is not supported" {
		t.Fatalf("expected folder rejection, got %v", err)
	}
}
