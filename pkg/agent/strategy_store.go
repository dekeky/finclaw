package agentruntime

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type strategyIndexEntry struct {
	Platform  string    `json:"platform"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type strategyIndexFile struct {
	Entries map[string]strategyIndexEntry `json:"entries"`
}

type strategySummary struct {
	Name      string    `json:"name"`
	Platform  string    `json:"platform"`
	Path      string    `json:"path"`
	UpdatedAt time.Time `json:"updated_at"`
}

type strategyDetail struct {
	strategySummary
	Script    string    `json:"script"`
	CreatedAt time.Time `json:"created_at"`
}

// StrategyStore persists quant strategies as single .py files under ~/.finclaw/{userID}/strategies/.
type StrategyStore struct {
	mu     sync.Mutex
	root   string
	userID string
}

func NewStrategyStore(userID string) *StrategyStore {
	return &StrategyStore{
		root:   strategyRoot(userID),
		userID: userID,
	}
}

func strategyRoot(userID string) string {
	return filepath.Join(UserAgentHome(userID), "strategies")
}

func normalizeStrategyName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if err := validateAgentName(name); err != nil {
		return "", fmt.Errorf("invalid strategy name: %w", err)
	}
	return name, nil
}

func (s *StrategyStore) indexPath() string {
	return filepath.Join(s.root, "index.json")
}

func (s *StrategyStore) filePath(name string) string {
	return filepath.Join(s.root, name+".py")
}

func (s *StrategyStore) loadIndex() (*strategyIndexFile, error) {
	data, err := os.ReadFile(s.indexPath())
	if err != nil {
		if os.IsNotExist(err) {
			return &strategyIndexFile{Entries: map[string]strategyIndexEntry{}}, nil
		}
		return nil, fmt.Errorf("read strategy index: %w", err)
	}
	var file strategyIndexFile
	if err := json.Unmarshal(data, &file); err != nil {
		return nil, fmt.Errorf("parse strategy index: %w", err)
	}
	if file.Entries == nil {
		file.Entries = map[string]strategyIndexEntry{}
	}
	return &file, nil
}

func (s *StrategyStore) saveIndex(file *strategyIndexFile) error {
	if err := os.MkdirAll(s.root, 0o755); err != nil {
		return fmt.Errorf("mkdir strategies: %w", err)
	}
	data, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal strategy index: %w", err)
	}
	if err := os.WriteFile(s.indexPath(), data, 0o600); err != nil {
		return fmt.Errorf("write strategy index: %w", err)
	}
	return nil
}

func (s *StrategyStore) readScript(name string) (string, error) {
	data, err := os.ReadFile(s.filePath(name))
	if err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("strategy %q not found", name)
		}
		return "", fmt.Errorf("read strategy file: %w", err)
	}
	return string(data), nil
}

func (s *StrategyStore) writeScript(name, script string) error {
	if err := os.MkdirAll(s.root, 0o755); err != nil {
		return fmt.Errorf("mkdir strategies: %w", err)
	}
	if err := os.WriteFile(s.filePath(name), []byte(script), 0o600); err != nil {
		return fmt.Errorf("write strategy file: %w", err)
	}
	return nil
}

func (s *StrategyStore) toSummary(name string, entry strategyIndexEntry) strategySummary {
	platform := entry.Platform
	if strings.TrimSpace(platform) == "" {
		platform = StrategyPlatformJoinQuant
	}
	return strategySummary{
		Name:      name,
		Platform:  platform,
		Path:      StrategyRelPath(name),
		UpdatedAt: entry.UpdatedAt,
	}
}

func (s *StrategyStore) toDetail(name string, entry strategyIndexEntry, script string) strategyDetail {
	return strategyDetail{
		strategySummary: s.toSummary(name, entry),
		Script:          script,
		CreatedAt:       entry.CreatedAt,
	}
}

func (s *StrategyStore) migrateLegacyLayout() error {
	entries, err := os.ReadDir(s.root)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	index, err := s.loadIndex()
	if err != nil {
		return err
	}
	changed := false
	for _, ent := range entries {
		if !ent.IsDir() {
			continue
		}
		name := ent.Name()
		legacyMetaPath := filepath.Join(s.root, name, "meta.json")
		legacyScriptPath := filepath.Join(s.root, name, "strategy.py")
		metaData, err := os.ReadFile(legacyMetaPath)
		if err != nil {
			continue
		}
		var legacy struct {
			Name        string    `json:"name"`
			Platform    string    `json:"platform"`
			CreatedAt   time.Time `json:"created_at"`
			UpdatedAt   time.Time `json:"updated_at"`
		}
		if err := json.Unmarshal(metaData, &legacy); err != nil {
			continue
		}
		scriptData, err := os.ReadFile(legacyScriptPath)
		if err != nil {
			continue
		}
		if _, exists := index.Entries[name]; !exists {
			platform, _ := normalizeStrategyPlatform(legacy.Platform)
			index.Entries[name] = strategyIndexEntry{
				Platform:  platform,
				CreatedAt: legacy.CreatedAt,
				UpdatedAt: legacy.UpdatedAt,
			}
			changed = true
		}
		if _, err := os.Stat(s.filePath(name)); os.IsNotExist(err) {
			if err := os.WriteFile(s.filePath(name), scriptData, 0o600); err != nil {
				return fmt.Errorf("migrate strategy file %q: %w", name, err)
			}
		}
		_ = os.RemoveAll(filepath.Join(s.root, name))
	}
	if changed {
		if err := s.saveIndex(index); err != nil {
			return err
		}
	}
	return nil
}

func (s *StrategyStore) List() ([]strategySummary, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.migrateLegacyLayout(); err != nil {
		return nil, err
	}
	index, err := s.loadIndex()
	if err != nil {
		return nil, err
	}
	out := make([]strategySummary, 0, len(index.Entries))
	for name, entry := range index.Entries {
		if _, err := os.Stat(s.filePath(name)); err != nil {
			continue
		}
		out = append(out, s.toSummary(name, entry))
	}
	return out, nil
}

func (s *StrategyStore) Get(name string) (strategyDetail, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	name, err := normalizeStrategyName(name)
	if err != nil {
		return strategyDetail{}, err
	}
	if err := s.migrateLegacyLayout(); err != nil {
		return strategyDetail{}, err
	}
	index, err := s.loadIndex()
	if err != nil {
		return strategyDetail{}, err
	}
	entry, ok := index.Entries[name]
	if !ok {
		return strategyDetail{}, fmt.Errorf("strategy %q not found", name)
	}
	script, err := s.readScript(name)
	if err != nil {
		return strategyDetail{}, err
	}
	return s.toDetail(name, entry, script), nil
}

func (s *StrategyStore) Create(name, platform, script, agentName string) (strategyDetail, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	name, err := normalizeStrategyName(name)
	if err != nil {
		return strategyDetail{}, err
	}
	platform, err = normalizeStrategyPlatform(platform)
	if err != nil {
		return strategyDetail{}, err
	}
	if err := s.migrateLegacyLayout(); err != nil {
		return strategyDetail{}, err
	}
	index, err := s.loadIndex()
	if err != nil {
		return strategyDetail{}, err
	}
	if _, exists := index.Entries[name]; exists {
		return strategyDetail{}, fmt.Errorf("strategy %q already exists", name)
	}
	if strings.TrimSpace(script) == "" {
		script = defaultStrategyScript(platform)
	}
	now := time.Now().UTC()
	entry := strategyIndexEntry{
		Platform:  platform,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := s.writeScript(name, script); err != nil {
		return strategyDetail{}, err
	}
	index.Entries[name] = entry
	if err := s.saveIndex(index); err != nil {
		_ = os.Remove(s.filePath(name))
		return strategyDetail{}, err
	}
	if err := SyncStrategyToAgentWorkspaces(s.userID, name); err != nil {
		return strategyDetail{}, err
	}
	agentName = strings.TrimSpace(agentName)
	if agentName != "" {
		if err := SyncStrategyToAgentWorkspace(s.userID, agentName, name); err != nil {
			return strategyDetail{}, err
		}
	}
	return s.toDetail(name, entry, script), nil
}

func (s *StrategyStore) Update(currentName string, patchName, platform, script string) (strategyDetail, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	currentName, err := normalizeStrategyName(currentName)
	if err != nil {
		return strategyDetail{}, err
	}
	if err := s.migrateLegacyLayout(); err != nil {
		return strategyDetail{}, err
	}
	index, err := s.loadIndex()
	if err != nil {
		return strategyDetail{}, err
	}
	entry, ok := index.Entries[currentName]
	if !ok {
		return strategyDetail{}, fmt.Errorf("strategy %q not found", currentName)
	}
	newName := strings.TrimSpace(patchName)
	if newName == "" {
		newName = currentName
	}
	newName, err = normalizeStrategyName(newName)
	if err != nil {
		return strategyDetail{}, err
	}
	if strings.TrimSpace(platform) == "" {
		platform = entry.Platform
	}
	platform, err = normalizeStrategyPlatform(platform)
	if err != nil {
		return strategyDetail{}, err
	}
	entry.Platform = platform
	entry.UpdatedAt = time.Now().UTC()

	if newName != currentName {
		if _, exists := index.Entries[newName]; exists {
			return strategyDetail{}, fmt.Errorf("strategy %q already exists", newName)
		}
		if err := os.Rename(s.filePath(currentName), s.filePath(newName)); err != nil {
			return strategyDetail{}, fmt.Errorf("rename strategy file: %w", err)
		}
		delete(index.Entries, currentName)
	}

	if script != "" {
		if err := s.writeScript(newName, script); err != nil {
			return strategyDetail{}, err
		}
	} else {
		script, err = s.readScript(newName)
		if err != nil {
			return strategyDetail{}, err
		}
	}

	index.Entries[newName] = entry
	if err := s.saveIndex(index); err != nil {
		return strategyDetail{}, err
	}
	if err := SyncStrategyToAgentWorkspaces(s.userID, newName); err != nil {
		return strategyDetail{}, err
	}
	return s.toDetail(newName, entry, script), nil
}

func (s *StrategyStore) SyncToAgent(agentName, strategyName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	strategyName, err := normalizeStrategyName(strategyName)
	if err != nil {
		return err
	}
	agentName = strings.TrimSpace(agentName)
	if agentName == "" {
		return fmt.Errorf("agent name is required")
	}
	if err := s.migrateLegacyLayout(); err != nil {
		return err
	}
	index, err := s.loadIndex()
	if err != nil {
		return err
	}
	if _, ok := index.Entries[strategyName]; !ok {
		return fmt.Errorf("strategy %q not found", strategyName)
	}
	return SyncStrategyToAgentWorkspace(s.userID, agentName, strategyName)
}

func (s *StrategyStore) PullFromAgent(agentName, strategyName string) (strategyDetail, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	strategyName, err := normalizeStrategyName(strategyName)
	if err != nil {
		return strategyDetail{}, err
	}
	if err := s.migrateLegacyLayout(); err != nil {
		return strategyDetail{}, err
	}
	index, err := s.loadIndex()
	if err != nil {
		return strategyDetail{}, err
	}
	entry, ok := index.Entries[strategyName]
	if !ok {
		return strategyDetail{}, fmt.Errorf("strategy %q not found", strategyName)
	}
	if changed, err := PullStrategyFromAgentWorkspace(s.userID, agentName, strategyName); err != nil {
		return strategyDetail{}, err
	} else if changed {
		entry.UpdatedAt = time.Now().UTC()
		index.Entries[strategyName] = entry
		if err := s.saveIndex(index); err != nil {
			return strategyDetail{}, err
		}
	}
	script, err := s.readScript(strategyName)
	if err != nil {
		return strategyDetail{}, err
	}
	return s.toDetail(strategyName, entry, script), nil
}

func (s *StrategyStore) Delete(name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	name, err := normalizeStrategyName(name)
	if err != nil {
		return err
	}
	if err := s.migrateLegacyLayout(); err != nil {
		return err
	}
	index, err := s.loadIndex()
	if err != nil {
		return err
	}
	if _, ok := index.Entries[name]; !ok {
		return fmt.Errorf("strategy %q not found", name)
	}
	delete(index.Entries, name)
	if err := s.saveIndex(index); err != nil {
		return err
	}
	if err := os.Remove(s.filePath(name)); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("delete strategy file: %w", err)
	}
	if err := RemoveStrategyFromAgentWorkspaces(s.userID, name); err != nil {
		return err
	}
	return nil
}
