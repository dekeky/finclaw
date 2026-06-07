package picoclaw

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"

	picoagent "github.com/sipeed/picoclaw/pkg/agent"
	picoclawconfig "github.com/sipeed/picoclaw/pkg/config"
	"github.com/sipeed/picoclaw/pkg/skills"
)

const maxSkillFileSize = 5 << 20 // 5MB

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
	// Dir is the on-disk folder name under the source root (used to read files).
	Dir       string              `json:"dir"`
	Active    bool                `json:"active"`
	SubSkills []AgentSubSkillItem `json:"sub_skills,omitempty"`
}

// SkillFileContent is the raw content of one skill markdown file.
type SkillFileContent struct {
	Name    string `json:"name"`
	Content string `json:"content"`
	Size    int64  `json:"size"`
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
			Dir:         filepath.Base(filepath.Dir(s.Path)),
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

// skillRootForSource resolves the root skills directory for a given source.
func skillRootForSource(workspace, source string) (string, error) {
	switch source {
	case "workspace":
		return filepath.Join(workspace, "skills"), nil
	case "global":
		return filepath.Join(picoclawconfig.GetHome(), "skills"), nil
	case "builtin":
		builtin := strings.TrimSpace(os.Getenv(picoclawconfig.EnvBuiltinSkills))
		if builtin == "" {
			wd, _ := os.Getwd()
			builtin = filepath.Join(wd, "skills")
		}
		return builtin, nil
	default:
		return "", fmt.Errorf("invalid skill source %q", source)
	}
}

// validateSkillSegment rejects empty, relative or nested path segments.
func validateSkillSegment(seg string) error {
	seg = strings.TrimSpace(seg)
	if seg == "" || seg == "." || seg == ".." {
		return fmt.Errorf("invalid path segment %q", seg)
	}
	if strings.ContainsAny(seg, `/\`) {
		return fmt.Errorf("invalid path segment %q", seg)
	}
	return nil
}

// ReadSkillFile reads one markdown file inside a skill directory.
// The (source, skillDir, file) triple is validated and confined to its skill root
// to prevent path traversal / arbitrary file reads.
func ReadSkillFile(workspace, source, skillDir, file string) (*SkillFileContent, error) {
	workspace = strings.TrimSpace(workspace)
	if workspace == "" {
		return nil, errWorkspaceRequired()
	}
	if err := validateSkillSegment(skillDir); err != nil {
		return nil, err
	}
	if strings.TrimSpace(file) == "" {
		file = "SKILL.md"
	}
	if err := validateSkillSegment(file); err != nil {
		return nil, err
	}

	root, err := skillRootForSource(workspace, source)
	if err != nil {
		return nil, err
	}
	rootClean := filepath.Clean(root)
	path := filepath.Clean(filepath.Join(rootClean, skillDir, file))

	rel, err := filepath.Rel(rootClean, path)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return nil, fmt.Errorf("path %q escapes skill root", file)
	}

	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("skill file %q not found", file)
		}
		return nil, fmt.Errorf("stat skill file: %w", err)
	}
	if info.IsDir() {
		return nil, fmt.Errorf("%q is a directory", file)
	}
	if info.Size() > maxSkillFileSize {
		return nil, fmt.Errorf("skill file %q exceeds 5MB size limit", file)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read skill file: %w", err)
	}
	return &SkillFileContent{Name: file, Content: string(data), Size: info.Size()}, nil
}

// skillDirWithinRoot resolves and confines a skill directory to its source root.
func skillDirWithinRoot(workspace, source, skillDir string) (string, error) {
	root, err := skillRootForSource(workspace, source)
	if err != nil {
		return "", err
	}
	rootClean := filepath.Clean(root)
	dir := filepath.Clean(filepath.Join(rootClean, skillDir))
	rel, err := filepath.Rel(rootClean, dir)
	if err != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("path %q escapes skill root", skillDir)
	}
	return dir, nil
}

// WriteSkillFile creates or overwrites one markdown file inside a skill directory.
func WriteSkillFile(workspace, source, skillDir, file, content string) (*SkillFileContent, error) {
	workspace = strings.TrimSpace(workspace)
	if workspace == "" {
		return nil, errWorkspaceRequired()
	}
	if err := validateSkillSegment(skillDir); err != nil {
		return nil, err
	}
	if strings.TrimSpace(file) == "" {
		file = "SKILL.md"
	}
	if err := validateSkillSegment(file); err != nil {
		return nil, err
	}
	if len(content) > maxSkillFileSize {
		return nil, fmt.Errorf("content exceeds 5MB size limit")
	}
	dir, err := skillDirWithinRoot(workspace, source, skillDir)
	if err != nil {
		return nil, err
	}
	path := filepath.Join(dir, file)
	if info, err := os.Stat(path); err == nil && info.IsDir() {
		return nil, fmt.Errorf("%q is a directory", file)
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("create directory: %w", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		return nil, fmt.Errorf("write skill file: %w", err)
	}
	return &SkillFileContent{Name: file, Content: content, Size: int64(len(content))}, nil
}

// DeleteSkill removes an entire skill package directory and all its files.
func DeleteSkill(workspace, source, skillDir string) error {
	workspace = strings.TrimSpace(workspace)
	if workspace == "" {
		return errWorkspaceRequired()
	}
	if err := validateSkillSegment(skillDir); err != nil {
		return err
	}
	dir, err := skillDirWithinRoot(workspace, source, skillDir)
	if err != nil {
		return err
	}
	if _, err := os.Stat(dir); err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("skill %q not found", skillDir)
		}
		return fmt.Errorf("stat skill: %w", err)
	}
	return os.RemoveAll(dir)
}

func errWorkspaceRequired() error {
	return &workspaceError{msg: "workspace path is required"}
}

type workspaceError struct{ msg string }

func (e *workspaceError) Error() string { return e.msg }
