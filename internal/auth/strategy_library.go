package auth

import (
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

func generateLibraryEntryID() string {
	return fmt.Sprintf("sl_%d", time.Now().UnixNano())
}

// StrategyLibrarySummary is the list view of a shared strategy.
type StrategyLibrarySummary struct {
	ID           string    `json:"id"`
	AuthorName   string    `json:"author_name"`
	Title        string    `json:"title"`
	Summary      string    `json:"summary"`
	Platform     string    `json:"platform"`
	SourceName   string    `json:"source_name,omitempty"`
	InstallCount int       `json:"install_count"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// StrategyLibraryDetail includes the full script.
type StrategyLibraryDetail struct {
	StrategyLibrarySummary
	Script string `json:"script"`
	UserID string `json:"user_id"`
}

func entryToSummary(e StrategyLibraryEntry) StrategyLibrarySummary {
	return StrategyLibrarySummary{
		ID:           e.ID,
		AuthorName:   e.AuthorName,
		Title:        e.Title,
		Summary:      e.Summary,
		Platform:     e.Platform,
		SourceName:   e.SourceName,
		InstallCount: e.InstallCount,
		CreatedAt:    e.CreatedAt,
		UpdatedAt:    e.UpdatedAt,
	}
}

func entryToDetail(e StrategyLibraryEntry) StrategyLibraryDetail {
	return StrategyLibraryDetail{
		StrategyLibrarySummary: entryToSummary(e),
		Script:                 e.Script,
		UserID:                 e.UserID,
	}
}

// ListStrategyLibrary returns shared strategies ordered by newest first.
func (s *Store) ListStrategyLibrary(search string) ([]StrategyLibrarySummary, error) {
	search = strings.TrimSpace(search)
	q := s.db.Model(&StrategyLibraryEntry{}).Order("created_at DESC")
	if search != "" {
		like := "%" + search + "%"
		q = q.Where("title LIKE ? OR summary LIKE ? OR author_name LIKE ?", like, like, like)
	}
	var entries []StrategyLibraryEntry
	if err := q.Find(&entries).Error; err != nil {
		return nil, fmt.Errorf("list strategy library: %w", err)
	}
	out := make([]StrategyLibrarySummary, 0, len(entries))
	for _, e := range entries {
		out = append(out, entryToSummary(e))
	}
	return out, nil
}

// GetStrategyLibraryEntry returns one library entry with script.
func (s *Store) GetStrategyLibraryEntry(id string) (*StrategyLibraryDetail, error) {
	var entry StrategyLibraryEntry
	if err := s.db.Where("id = ?", id).Limit(1).Find(&entry).Error; err != nil {
		return nil, fmt.Errorf("get strategy library entry: %w", err)
	}
	if entry.ID == "" {
		return nil, nil
	}
	detail := entryToDetail(entry)
	return &detail, nil
}

// CreateStrategyLibraryEntryParams holds fields for sharing a strategy.
type CreateStrategyLibraryEntryParams struct {
	UserID     string
	AuthorName string
	Title      string
	Summary    string
	Platform   string
	Script     string
	SourceName string
}

// CreateStrategyLibraryEntry adds a strategy to the community library.
func (s *Store) CreateStrategyLibraryEntry(p CreateStrategyLibraryEntryParams) (*StrategyLibraryDetail, error) {
	now := time.Now().UTC()
	entry := StrategyLibraryEntry{
		ID:         generateLibraryEntryID(),
		UserID:     p.UserID,
		AuthorName: strings.TrimSpace(p.AuthorName),
		Title:      strings.TrimSpace(p.Title),
		Summary:    strings.TrimSpace(p.Summary),
		Platform:   strings.TrimSpace(p.Platform),
		Script:     p.Script,
		SourceName: strings.TrimSpace(p.SourceName),
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	if entry.Title == "" {
		return nil, fmt.Errorf("title is required")
	}
	if strings.TrimSpace(entry.Script) == "" {
		return nil, fmt.Errorf("script is required")
	}
	if err := s.db.Create(&entry).Error; err != nil {
		return nil, fmt.Errorf("create strategy library entry: %w", err)
	}
	detail := entryToDetail(entry)
	return &detail, nil
}

// IncrementStrategyLibraryInstallCount bumps install count after a successful install.
func (s *Store) IncrementStrategyLibraryInstallCount(id string) error {
	result := s.db.Model(&StrategyLibraryEntry{}).Where("id = ?", id).
		UpdateColumn("install_count", gorm.Expr("install_count + 1"))
	if result.Error != nil {
		return fmt.Errorf("increment install count: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("strategy library entry not found")
	}
	return nil
}

// DeleteStrategyLibraryEntry removes an entry; only the owner may delete.
func (s *Store) DeleteStrategyLibraryEntry(userID, id string) error {
	result := s.db.Where("id = ? AND user_id = ?", id, userID).Delete(&StrategyLibraryEntry{})
	if result.Error != nil {
		return fmt.Errorf("delete strategy library entry: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("strategy library entry not found or not owned by you")
	}
	return nil
}
