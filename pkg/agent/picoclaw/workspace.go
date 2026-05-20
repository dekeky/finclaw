package picoclaw

import (
	"embed"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"strings"
)

//go:embed templates/*
var personaTemplates embed.FS

// Persona file names injected into the agent system prompt (PicoClaw workspace convention).
var PersonaFilenames = []string{"AGENT.md", "SOUL.md", "USER.md"}

// PersonaFile holds one workspace persona markdown file.
type PersonaFile struct {
	Name    string `json:"name"`
	Content string `json:"content"`
	Exists  bool   `json:"exists"`
}

// EnsurePersonaFiles creates missing AGENT.md / SOUL.md / USER.md from embedded templates.
// Existing files are never overwritten.
func EnsurePersonaFiles(workspace string) error {
	if strings.TrimSpace(workspace) == "" {
		return fmt.Errorf("workspace path is required")
	}
	if err := os.MkdirAll(workspace, 0o755); err != nil {
		return fmt.Errorf("create workspace: %w", err)
	}
	for _, name := range PersonaFilenames {
		target := filepath.Join(workspace, name)
		if _, err := os.Stat(target); err == nil {
			continue
		} else if !os.IsNotExist(err) {
			return fmt.Errorf("stat %s: %w", name, err)
		}
		data, err := personaTemplates.ReadFile(path.Join("templates", name))
		if err != nil {
			return fmt.Errorf("read template %s: %w", name, err)
		}
		if err := os.WriteFile(target, data, 0o644); err != nil {
			return fmt.Errorf("write %s: %w", name, err)
		}
	}
	return nil
}

// ReadPersonaFiles returns persona markdown files from workspace (empty content when missing).
func ReadPersonaFiles(workspace string) ([]PersonaFile, error) {
	if strings.TrimSpace(workspace) == "" {
		return nil, fmt.Errorf("workspace path is required")
	}
	out := make([]PersonaFile, 0, len(PersonaFilenames))
	for _, name := range PersonaFilenames {
		path := filepath.Join(workspace, name)
		data, err := os.ReadFile(path)
		if err != nil {
			if os.IsNotExist(err) {
				out = append(out, PersonaFile{Name: name, Content: "", Exists: false})
				continue
			}
			return nil, fmt.Errorf("read %s: %w", name, err)
		}
		out = append(out, PersonaFile{Name: name, Content: string(data), Exists: true})
	}
	return out, nil
}

// WritePersonaFile writes one persona file; name must be an allowed basename.
func WritePersonaFile(workspace, name, content string) error {
	if err := validatePersonaFilename(name); err != nil {
		return err
	}
	if strings.TrimSpace(workspace) == "" {
		return fmt.Errorf("workspace path is required")
	}
	if err := os.MkdirAll(workspace, 0o755); err != nil {
		return fmt.Errorf("create workspace: %w", err)
	}
	path := filepath.Join(workspace, name)
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		return fmt.Errorf("write %s: %w", name, err)
	}
	return nil
}

func validatePersonaFilename(name string) error {
	name = strings.TrimSpace(name)
	for _, allowed := range PersonaFilenames {
		if name == allowed {
			return nil
		}
	}
	return fmt.Errorf("unsupported persona file %q", name)
}

// ValidatePersonaFilename checks that name is AGENT.md, SOUL.md, or USER.md.
func ValidatePersonaFilename(name string) error {
	return validatePersonaFilename(name)
}

// ListEmbeddedPersonaNames returns template basenames (for tests).
func ListEmbeddedPersonaNames() ([]string, error) {
	entries, err := fs.ReadDir(personaTemplates, "templates")
	if err != nil {
		return nil, err
	}
	var names []string
	for _, e := range entries {
		if !e.IsDir() {
			names = append(names, e.Name())
		}
	}
	return names, nil
}
