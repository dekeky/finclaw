package agentruntime

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type agentMeta struct {
	ModelProfile string `json:"model_profile,omitempty"`
}

func agentMetaPath(home, agentName string) string {
	return filepath.Join(home, agentName, "finclaw.json")
}

func readAgentMeta(home, agentName string) (agentMeta, error) {
	path := agentMetaPath(home, agentName)
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return agentMeta{}, nil
		}
		return agentMeta{}, fmt.Errorf("read agent meta: %w", err)
	}
	var meta agentMeta
	if err := json.Unmarshal(data, &meta); err != nil {
		return agentMeta{}, fmt.Errorf("parse agent meta: %w", err)
	}
	meta.ModelProfile = strings.TrimSpace(meta.ModelProfile)
	return meta, nil
}

func writeAgentMeta(home, agentName string, meta agentMeta) error {
	path := agentMetaPath(home, agentName)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("mkdir agent meta dir: %w", err)
	}
	meta.ModelProfile = strings.TrimSpace(meta.ModelProfile)
	data, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal agent meta: %w", err)
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return fmt.Errorf("write agent meta: %w", err)
	}
	return nil
}

func setAgentModelProfile(home, agentName, profileName string) error {
	return writeAgentMeta(home, agentName, agentMeta{ModelProfile: strings.TrimSpace(profileName)})
}

func renameModelProfileReferences(home, oldName, newName string) error {
	oldName = strings.TrimSpace(oldName)
	newName = strings.TrimSpace(newName)
	if oldName == "" || newName == "" || oldName == newName {
		return nil
	}
	entries, err := os.ReadDir(home)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		meta, err := readAgentMeta(home, e.Name())
		if err != nil || meta.ModelProfile != oldName {
			continue
		}
		if err := setAgentModelProfile(home, e.Name(), newName); err != nil {
			return err
		}
	}
	return nil
}

func countAgentsUsingModelProfile(home, profileName string) (int, error) {
	profileName = strings.TrimSpace(profileName)
	if profileName == "" {
		return 0, nil
	}
	entries, err := os.ReadDir(home)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, err
	}
	count := 0
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		meta, err := readAgentMeta(home, e.Name())
		if err != nil {
			continue
		}
		if meta.ModelProfile == profileName {
			count++
		}
	}
	return count, nil
}
