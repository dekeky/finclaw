package agentruntime

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// ModelProfile is a reusable model provider configuration stored per user.
// DisplayName is the unique identifier within a user's model list.
type ModelProfile struct {
	// Name is deprecated; kept only for migrating legacy models.json entries.
	Name        string `json:"name,omitempty"`
	DisplayName string `json:"display_name"`
	ModelName   string `json:"model_name,omitempty"`
	Model       string `json:"model"`
	ApiBase     string `json:"api_base"`
	ApiKey      string `json:"api_key"`
}

type modelProfileSummary struct {
	DisplayName string `json:"display_name"`
	Model       string `json:"model"`
	ApiBase     string `json:"api_base"`
	HasApiKey   bool   `json:"has_api_key"`
}

type modelProfilePublic struct {
	DisplayName string `json:"display_name"`
	ModelName   string `json:"model_name,omitempty"`
	Model       string `json:"model"`
	ApiBase     string `json:"api_base"`
	HasApiKey   bool   `json:"has_api_key"`
}

// modelProfileDetail includes the stored API key for the authenticated detail view.
type modelProfileDetail struct {
	modelProfilePublic
	ApiKey string `json:"api_key,omitempty"`
}

type modelStoreFile struct {
	Profiles []ModelProfile `json:"profiles"`
}

// ModelStore persists model profiles for a user under ~/.finclaw/{userID}/models.json.
type ModelStore struct {
	mu   sync.Mutex
	path string
	home string
}

func NewModelStore(userID string) *ModelStore {
	return &ModelStore{
		path: modelStorePath(userID),
		home: UserAgentHome(userID),
	}
}

func modelStorePath(userID string) string {
	return filepath.Join(UserAgentHome(userID), "models.json")
}

func migrateModelProfile(p *ModelProfile) {
	if p == nil {
		return
	}
	if strings.TrimSpace(p.DisplayName) == "" && strings.TrimSpace(p.Name) != "" {
		p.DisplayName = strings.TrimSpace(p.Name)
	}
	p.Name = ""
}

func (s *ModelStore) load() (*modelStoreFile, error) {
	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return &modelStoreFile{Profiles: []ModelProfile{}}, nil
		}
		return nil, fmt.Errorf("read models: %w", err)
	}
	var file modelStoreFile
	if err := json.Unmarshal(data, &file); err != nil {
		return nil, fmt.Errorf("parse models: %w", err)
	}
	if file.Profiles == nil {
		file.Profiles = []ModelProfile{}
	}
	for i := range file.Profiles {
		migrateModelProfile(&file.Profiles[i])
	}
	return &file, nil
}

func (s *ModelStore) save(file *modelStoreFile) error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return fmt.Errorf("mkdir models dir: %w", err)
	}
	data, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal models: %w", err)
	}
	if err := os.WriteFile(s.path, data, 0o600); err != nil {
		return fmt.Errorf("write models: %w", err)
	}
	return nil
}

func normalizeModelProfile(p *ModelProfile) error {
	if p == nil {
		return fmt.Errorf("model profile is required")
	}
	migrateModelProfile(p)
	p.DisplayName = strings.TrimSpace(p.DisplayName)
	p.Model = strings.TrimSpace(p.Model)
	p.ApiBase = strings.TrimSpace(p.ApiBase)
	p.ApiKey = strings.TrimSpace(p.ApiKey)
	if p.DisplayName == "" {
		return fmt.Errorf("display_name is required")
	}
	if err := validateAgentName(p.DisplayName); err != nil {
		return fmt.Errorf("invalid display_name: %w", err)
	}
	if p.Model == "" {
		return fmt.Errorf("model is required")
	}
	if p.ApiBase == "" {
		return fmt.Errorf("api_base is required")
	}
	if strings.TrimSpace(p.ModelName) == "" {
		p.ModelName = p.Model
	} else {
		p.ModelName = strings.TrimSpace(p.ModelName)
	}
	return nil
}

func profileKey(p ModelProfile) string {
	return strings.TrimSpace(p.DisplayName)
}

func findProfileIndex(profiles []ModelProfile, displayName string) int {
	displayName = strings.TrimSpace(displayName)
	for i, p := range profiles {
		if profileKey(p) == displayName {
			return i
		}
	}
	return -1
}

func (s *ModelStore) List() ([]modelProfileSummary, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	file, err := s.load()
	if err != nil {
		return nil, err
	}
	out := make([]modelProfileSummary, 0, len(file.Profiles))
	for _, p := range file.Profiles {
		out = append(out, modelProfileSummary{
			DisplayName: profileKey(p),
			Model:       p.Model,
			ApiBase:     p.ApiBase,
			HasApiKey:   strings.TrimSpace(p.ApiKey) != "",
		})
	}
	return out, nil
}

func (s *ModelStore) Get(displayName string) (modelProfileDetail, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	file, err := s.load()
	if err != nil {
		return modelProfileDetail{}, err
	}
	idx := findProfileIndex(file.Profiles, displayName)
	if idx < 0 {
		return modelProfileDetail{}, fmt.Errorf("model profile %q not found", strings.TrimSpace(displayName))
	}
	return toDetailProfile(file.Profiles[idx]), nil
}

func toPublicProfile(p ModelProfile) modelProfilePublic {
	return modelProfilePublic{
		DisplayName: profileKey(p),
		ModelName:   strings.TrimSpace(p.ModelName),
		Model:       p.Model,
		ApiBase:     p.ApiBase,
		HasApiKey:   strings.TrimSpace(p.ApiKey) != "",
	}
}

func toDetailProfile(p ModelProfile) modelProfileDetail {
	return modelProfileDetail{
		modelProfilePublic: toPublicProfile(p),
		ApiKey:             strings.TrimSpace(p.ApiKey),
	}
}

func (s *ModelStore) Create(p ModelProfile) (modelProfilePublic, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := normalizeModelProfile(&p); err != nil {
		return modelProfilePublic{}, err
	}
	if strings.TrimSpace(p.ApiKey) == "" {
		return modelProfilePublic{}, fmt.Errorf("api_key is required")
	}
	file, err := s.load()
	if err != nil {
		return modelProfilePublic{}, err
	}
	if findProfileIndex(file.Profiles, p.DisplayName) >= 0 {
		return modelProfilePublic{}, fmt.Errorf("model profile %q already exists", p.DisplayName)
	}
	file.Profiles = append(file.Profiles, p)
	if err := s.save(file); err != nil {
		return modelProfilePublic{}, err
	}
	return toPublicProfile(p), nil
}

func (s *ModelStore) Update(displayName string, patch ModelProfile) (modelProfilePublic, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	displayName = strings.TrimSpace(displayName)
	if displayName == "" {
		return modelProfilePublic{}, fmt.Errorf("display_name is required")
	}
	file, err := s.load()
	if err != nil {
		return modelProfilePublic{}, err
	}
	idx := findProfileIndex(file.Profiles, displayName)
	if idx < 0 {
		return modelProfilePublic{}, fmt.Errorf("model profile %q not found", displayName)
	}
	current := file.Profiles[idx]
	updated := ModelProfile{
		DisplayName: patch.DisplayName,
		ModelName:   patch.ModelName,
		Model:       patch.Model,
		ApiBase:     patch.ApiBase,
		ApiKey:      patch.ApiKey,
	}
	if strings.TrimSpace(updated.DisplayName) == "" {
		updated.DisplayName = current.DisplayName
	}
	if strings.TrimSpace(updated.Model) == "" {
		updated.Model = current.Model
	}
	if strings.TrimSpace(updated.ApiBase) == "" {
		updated.ApiBase = current.ApiBase
	}
	if strings.TrimSpace(updated.ApiKey) == "" {
		updated.ApiKey = current.ApiKey
	}
	if err := normalizeModelProfile(&updated); err != nil {
		return modelProfilePublic{}, err
	}
	if updated.DisplayName != displayName {
		if findProfileIndex(file.Profiles, updated.DisplayName) >= 0 {
			return modelProfilePublic{}, fmt.Errorf("model profile %q already exists", updated.DisplayName)
		}
		if err := renameModelProfileReferences(s.home, displayName, updated.DisplayName); err != nil {
			return modelProfilePublic{}, err
		}
	}
	file.Profiles[idx] = updated
	if err := s.save(file); err != nil {
		return modelProfilePublic{}, err
	}
	return toPublicProfile(updated), nil
}

func (s *ModelStore) Delete(displayName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	displayName = strings.TrimSpace(displayName)
	file, err := s.load()
	if err != nil {
		return err
	}
	next := make([]ModelProfile, 0, len(file.Profiles))
	found := false
	for _, p := range file.Profiles {
		if profileKey(p) == displayName {
			found = true
			continue
		}
		next = append(next, p)
	}
	if !found {
		return fmt.Errorf("model profile %q not found", displayName)
	}
	file.Profiles = next
	return s.save(file)
}

func (s *ModelStore) ResolveProvider(displayName string) (ModelProvider, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	file, err := s.load()
	if err != nil {
		return ModelProvider{}, err
	}
	displayName = strings.TrimSpace(displayName)
	idx := findProfileIndex(file.Profiles, displayName)
	if idx < 0 {
		return ModelProvider{}, fmt.Errorf("model profile %q not found", displayName)
	}
	p := file.Profiles[idx]
	if strings.TrimSpace(p.ApiKey) == "" {
		return ModelProvider{}, fmt.Errorf("model profile %q has no api key", displayName)
	}
	mp := ModelProvider{
		ModelName: strings.TrimSpace(p.ModelName),
		Model:     strings.TrimSpace(p.Model),
		ApiBase:   strings.TrimSpace(p.ApiBase),
		ApiKey:    strings.TrimSpace(p.ApiKey),
	}
	if err := fillModelName(&mp); err != nil {
		return ModelProvider{}, err
	}
	return mp, nil
}

func (s *ModelStore) ResolveProbeAPIKey(displayName, provided string) (string, error) {
	if k := strings.TrimSpace(provided); k != "" {
		return k, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	file, err := s.load()
	if err != nil {
		return "", err
	}
	displayName = strings.TrimSpace(displayName)
	idx := findProfileIndex(file.Profiles, displayName)
	if idx < 0 {
		return "", fmt.Errorf("model profile %q not found", displayName)
	}
	if k := strings.TrimSpace(file.Profiles[idx].ApiKey); k != "" {
		return k, nil
	}
	return "", fmt.Errorf("api_key is required: no saved key for model profile %q", displayName)
}
