package picoclaw

import (
	"os"
	"path/filepath"
	"slices"
	"strings"

	picoagent "github.com/sipeed/picoclaw/pkg/agent"
	picoclawconfig "github.com/sipeed/picoclaw/pkg/config"
	"github.com/sipeed/picoclaw/pkg/skills"
)

// AgentSubSkillItem is a markdown module bundled inside a top-level skill directory.
type AgentSubSkillItem struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	File        string `json:"file"`
}

// AgentSkillItem is one skill visible to an agent (workspace / global / builtin).
type AgentSkillItem struct {
	Name        string              `json:"name"`
	Description string              `json:"description"`
	Source      string              `json:"source"`
	Active      bool                `json:"active"`
	SubSkills   []AgentSubSkillItem `json:"sub_skills,omitempty"`
}

// AgentSkillsSummary lists skills for an agent workspace plus AGENT.md frontmatter filter.
type AgentSkillsSummary struct {
	Workspace        string           `json:"workspace"`
	ConfiguredSkills []string         `json:"configured_skills,omitempty"`
	Skills           []AgentSkillItem `json:"skills"`
	TotalCount       int              `json:"total_count"`
}

var subSkillSkipFiles = map[string]struct{}{
	"SKILL.md": {}, "README.md": {}, "CLAUDE.md": {}, "ai_CLAUDE.md": {},
}

func newSkillsLoaderForWorkspace(workspace string) *skills.SkillsLoader {
	globalSkillsDir := filepath.Join(picoclawconfig.GetHome(), "skills")
	builtinSkillsDir := strings.TrimSpace(os.Getenv(picoclawconfig.EnvBuiltinSkills))
	if builtinSkillsDir == "" {
		wd, _ := os.Getwd()
		builtinSkillsDir = filepath.Join(wd, "skills")
	}
	return skills.NewSkillsLoader(workspace, globalSkillsDir, builtinSkillsDir)
}

func configuredSkillsFromWorkspace(workspace string) []string {
	def := picoagent.NewContextBuilder(workspace).LoadAgentDefinition()
	if def.Agent == nil {
		return nil
	}
	return append([]string(nil), def.Agent.Frontmatter.Skills...)
}

func skillIsActive(name string, configured []string) bool {
	if len(configured) == 0 {
		return true
	}
	return slices.Contains(configured, name)
}

func listSubSkills(skillFilePath string) []AgentSubSkillItem {
	skillDir := filepath.Dir(skillFilePath)
	entries, err := os.ReadDir(skillDir)
	if err != nil {
		return nil
	}
	out := make([]AgentSubSkillItem, 0)
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".md") {
			continue
		}
		if _, skip := subSkillSkipFiles[e.Name()]; skip {
			continue
		}
		name := strings.TrimSuffix(e.Name(), filepath.Ext(e.Name()))
		desc := subSkillDescription(filepath.Join(skillDir, e.Name()))
		out = append(out, AgentSubSkillItem{
			Name:        name,
			Description: desc,
			File:        e.Name(),
		})
	}
	return out
}

func subSkillDescription(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "# ") {
			return strings.TrimSpace(strings.TrimPrefix(line, "# "))
		}
	}
	return ""
}

func countSkills(items []AgentSkillItem) int {
	n := len(items)
	for _, item := range items {
		n += len(item.SubSkills)
	}
	return n
}

// ListAgentSkills returns all skills visible to the agent and whether each is active per AGENT.md.
func ListAgentSkills(workspace string) (AgentSkillsSummary, error) {
	workspace = strings.TrimSpace(workspace)
	if workspace == "" {
		return AgentSkillsSummary{}, errWorkspaceRequired()
	}
	configured := configuredSkillsFromWorkspace(workspace)
	raw := newSkillsLoaderForWorkspace(workspace).ListSkills()
	items := make([]AgentSkillItem, 0, len(raw))
	for _, s := range raw {
		items = append(items, AgentSkillItem{
			Name:        s.Name,
			Description: s.Description,
			Source:      s.Source,
			Active:      skillIsActive(s.Name, configured),
			SubSkills:   listSubSkills(s.Path),
		})
	}
	return AgentSkillsSummary{
		Workspace:        workspace,
		ConfiguredSkills: configured,
		Skills:           items,
		TotalCount:       countSkills(items),
	}, nil
}

func errWorkspaceRequired() error {
	return &workspaceError{msg: "workspace path is required"}
}

type workspaceError struct{ msg string }

func (e *workspaceError) Error() string { return e.msg }
