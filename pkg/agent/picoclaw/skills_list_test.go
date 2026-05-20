package picoclaw

import (
	"os"
	"path/filepath"
	"testing"
)

func TestListAgentSkillsWorkspaceOnly(t *testing.T) {
	tmp := t.TempDir()
	workspace := filepath.Join(tmp, "workspace")
	skillDir := filepath.Join(workspace, "skills", "demo-skill")
	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		t.Fatal(err)
	}
	content := "---\nname: demo-skill\ndescription: A demo skill for testing.\n---\n\n# Demo\n"
	if err := os.WriteFile(filepath.Join(skillDir, "SKILL.md"), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(skillDir, "helper.md"), []byte("# Helper\n\nSub skill.\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	summary, err := ListAgentSkills(workspace)
	if err != nil {
		t.Fatalf("ListAgentSkills: %v", err)
	}
	if len(summary.Skills) != 1 {
		t.Fatalf("skills count = %d, want 1", len(summary.Skills))
	}
	if summary.TotalCount < 2 {
		t.Fatalf("total_count = %d, want at least 2 (package + sub)", summary.TotalCount)
	}
	s := summary.Skills[0]
	if s.Name != "demo-skill" || s.Source != "workspace" || !s.Active {
		t.Fatalf("unexpected skill item: %+v", s)
	}
	if len(s.SubSkills) != 1 || s.SubSkills[0].Name != "helper" {
		t.Fatalf("sub_skills = %+v", s.SubSkills)
	}
}

func TestListAgentSkillsRespectsFrontmatterFilter(t *testing.T) {
	tmp := t.TempDir()
	workspace := filepath.Join(tmp, "workspace")
	for _, name := range []string{"alpha-skill", "beta-skill"} {
		dir := filepath.Join(workspace, "skills", name)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		body := "---\nname: " + name + "\ndescription: " + name + " description.\n---\n"
		if err := os.WriteFile(filepath.Join(dir, "SKILL.md"), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	agentMD := "---\nname: test\ndescription: test agent\nskills:\n  - alpha-skill\n---\n\n# Agent\n"
	if err := os.WriteFile(filepath.Join(workspace, "AGENT.md"), []byte(agentMD), 0o644); err != nil {
		t.Fatal(err)
	}

	summary, err := ListAgentSkills(workspace)
	if err != nil {
		t.Fatalf("ListAgentSkills: %v", err)
	}
	if len(summary.ConfiguredSkills) != 1 || summary.ConfiguredSkills[0] != "alpha-skill" {
		t.Fatalf("configured_skills = %v", summary.ConfiguredSkills)
	}
	active := map[string]bool{}
	for _, s := range summary.Skills {
		active[s.Name] = s.Active
	}
	if !active["alpha-skill"] || active["beta-skill"] {
		t.Fatalf("active map = %v", active)
	}
}
