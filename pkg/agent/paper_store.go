package agentruntime

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

const (
	AccountPaperDirName = "paper"
	paperNameMaxRunes   = 64
)

const (
	paperStatusRunning    = "running"
	paperStatusPaused     = "paused"
	paperStatusCatchingUp = "catching_up"
	paperStatusFailed     = "failed"
)

type paperIndexFile struct {
	Sessions map[string]paperIndexEntry `json:"sessions"`
}

type paperIndexEntry struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Status       string `json:"status"`
	StrategyName string `json:"strategy_name"`
	StrategyID   string `json:"strategy_id,omitempty"`
	UpdatedAt    string `json:"updated_at"`
}

type paperSession struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	Status          string   `json:"status"`
	StrategyName    string   `json:"strategy_name"`
	StrategyID      string   `json:"strategy_id,omitempty"`
	GoLive          string   `json:"go_live"`
	EngineStart     string   `json:"engine_start"`
	LastBarDate     string   `json:"last_bar_date,omitempty"`
	LastRunID       string   `json:"last_run_id,omitempty"`
	LastError       string   `json:"last_error,omitempty"`
	InitialCash     float64  `json:"initial_cash"`
	Equity          float64  `json:"equity"`
	ReturnPct       float64  `json:"return_pct"`
	Universe        string   `json:"universe"`
	Symbols         []string `json:"symbols,omitempty"`
	Index           string   `json:"index,omitempty"`
	CommissionRate  *float64 `json:"commission_rate,omitempty"`
	MinCommission   *float64 `json:"min_commission,omitempty"`
	StampTaxRate    *float64 `json:"stamp_tax_rate,omitempty"`
	TransferFeeRate *float64 `json:"transfer_fee_rate,omitempty"`
	Slippage        *float64 `json:"slippage,omitempty"`
	LotSize         *int     `json:"lot_size,omitempty"`
	CreatedAt       string   `json:"created_at"`
	UpdatedAt       string   `json:"updated_at"`
}

type paperLatestFile struct {
	Result map[string]any `json:"result,omitempty"`
}

var paperStoreMu sync.Mutex

func AccountPaperRootForUser(userID string) string {
	return filepath.Join(UserAgentHome(userID), AccountPaperDirName)
}

func paperSessionDir(userID, id string) string {
	return filepath.Join(AccountPaperRootForUser(userID), id)
}

func paperToday() string {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		loc = time.Local
	}
	return time.Now().In(loc).Format("2006-01-02")
}

func paperEngineStart(goLive string) string {
	day := paperDayKey(goLive)
	if day == "" {
		return paperToday()
	}
	return day
}

func newPaperID() string {
	return uuid.NewString()
}

func normalizePaperName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", fmt.Errorf("名称不能为空")
	}
	if utf8.RuneCountInString(name) > paperNameMaxRunes {
		return "", fmt.Errorf("名称最长 %d 个字符", paperNameMaxRunes)
	}
	return name, nil
}

func uniquePaperName(used map[string]struct{}, base string) string {
	base = strings.TrimSpace(base)
	if base == "" {
		base = "实盘模拟"
	}
	if _, exists := used[base]; !exists {
		return base
	}
	for i := 2; i < 1000; i++ {
		candidate := fmt.Sprintf("%s %d", base, i)
		if _, exists := used[candidate]; !exists {
			return candidate
		}
	}
	return base + " " + newPaperID()[:8]
}

func loadPaperIndexLocked(userID string) (*paperIndexFile, error) {
	root := AccountPaperRootForUser(userID)
	data, err := os.ReadFile(filepath.Join(root, "index.json"))
	if err != nil {
		if os.IsNotExist(err) {
			return &paperIndexFile{Sessions: map[string]paperIndexEntry{}}, nil
		}
		return nil, fmt.Errorf("read paper index: %w", err)
	}
	var file paperIndexFile
	if err := json.Unmarshal(data, &file); err != nil {
		return nil, fmt.Errorf("parse paper index: %w", err)
	}
	if file.Sessions == nil {
		file.Sessions = map[string]paperIndexEntry{}
	}
	return &file, nil
}

func savePaperIndexLocked(userID string, index *paperIndexFile) error {
	root := AccountPaperRootForUser(userID)
	if err := os.MkdirAll(root, 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(index, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(root, "index.json"), data, 0o644)
}

func upsertPaperIndexLocked(userID string, sess paperSession) error {
	index, err := loadPaperIndexLocked(userID)
	if err != nil {
		return err
	}
	index.Sessions[sess.ID] = paperIndexEntry{
		ID:           sess.ID,
		Name:         sess.Name,
		Status:       sess.Status,
		StrategyName: sess.StrategyName,
		StrategyID:   sess.StrategyID,
		UpdatedAt:    sess.UpdatedAt,
	}
	return savePaperIndexLocked(userID, index)
}

func writePaperSessionLocked(userID string, sess paperSession) error {
	dir := paperSessionDir(userID, sess.ID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(sess, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(dir, "session.json"), data, 0o644); err != nil {
		return err
	}
	return upsertPaperIndexLocked(userID, sess)
}

func savePaperSession(userID string, sess paperSession) error {
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(sess.ID) == "" {
		return fmt.Errorf("missing user or session id")
	}
	paperStoreMu.Lock()
	defer paperStoreMu.Unlock()
	return writePaperSessionLocked(userID, sess)
}

func savePaperSource(userID, id, source string) error {
	paperStoreMu.Lock()
	defer paperStoreMu.Unlock()
	dir := paperSessionDir(userID, id)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, "source.py"), []byte(source), 0o644)
}

func loadPaperSource(userID, id string) string {
	paperStoreMu.Lock()
	defer paperStoreMu.Unlock()
	data, err := os.ReadFile(filepath.Join(paperSessionDir(userID, id), "source.py"))
	if err != nil {
		return ""
	}
	return string(data)
}

func savePaperLatest(userID, id string, result map[string]any) error {
	paperStoreMu.Lock()
	defer paperStoreMu.Unlock()
	dir := paperSessionDir(userID, id)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(paperLatestFile{Result: result}, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, "latest.json"), data, 0o644)
}

func loadPaperLatest(userID, id string) (map[string]any, bool) {
	paperStoreMu.Lock()
	defer paperStoreMu.Unlock()
	data, err := os.ReadFile(filepath.Join(paperSessionDir(userID, id), "latest.json"))
	if err != nil {
		return nil, false
	}
	var file paperLatestFile
	if json.Unmarshal(data, &file) != nil || file.Result == nil {
		return nil, false
	}
	return file.Result, true
}

func loadPaperSession(userID, id string) (paperSession, error) {
	id = strings.TrimSpace(id)
	if userID == "" || id == "" {
		return paperSession{}, fmt.Errorf("实盘模拟不存在")
	}
	paperStoreMu.Lock()
	defer paperStoreMu.Unlock()
	return readPaperSessionLocked(userID, id)
}

func readPaperSessionLocked(userID, id string) (paperSession, error) {
	data, err := os.ReadFile(filepath.Join(paperSessionDir(userID, id), "session.json"))
	if err != nil {
		if os.IsNotExist(err) {
			return paperSession{}, fmt.Errorf("实盘模拟不存在")
		}
		return paperSession{}, err
	}
	var sess paperSession
	if err := json.Unmarshal(data, &sess); err != nil {
		return paperSession{}, fmt.Errorf("parse paper session: %w", err)
	}
	if sess.ID == "" {
		sess.ID = id
	}
	return sess, nil
}

func listPaperSessions(userID string) ([]paperSession, error) {
	paperStoreMu.Lock()
	defer paperStoreMu.Unlock()
	index, err := loadPaperIndexLocked(userID)
	if err != nil {
		return nil, err
	}
	out := make([]paperSession, 0, len(index.Sessions))
	for id := range index.Sessions {
		sess, err := readPaperSessionLocked(userID, id)
		if err != nil {
			continue
		}
		out = append(out, sess)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].UpdatedAt == out[j].UpdatedAt {
			return out[i].Name < out[j].Name
		}
		return out[i].UpdatedAt > out[j].UpdatedAt
	})
	return out, nil
}

func deletePaperSession(userID, id string) error {
	id = strings.TrimSpace(id)
	if userID == "" || id == "" {
		return fmt.Errorf("实盘模拟不存在")
	}
	paperStoreMu.Lock()
	defer paperStoreMu.Unlock()
	if _, err := readPaperSessionLocked(userID, id); err != nil {
		return err
	}
	index, err := loadPaperIndexLocked(userID)
	if err != nil {
		return err
	}
	delete(index.Sessions, id)
	if err := savePaperIndexLocked(userID, index); err != nil {
		return err
	}
	if err := os.RemoveAll(paperSessionDir(userID, id)); err != nil {
		return fmt.Errorf("remove paper session: %w", err)
	}
	return nil
}

func paperNameSet(sessions []paperSession, exceptID string) map[string]struct{} {
	used := make(map[string]struct{}, len(sessions))
	for _, sess := range sessions {
		if sess.ID == exceptID {
			continue
		}
		used[sess.Name] = struct{}{}
	}
	return used
}

func strategyStillExists(userID, strategyID, strategyName string) bool {
	store := NewStrategyStore(userID)
	name := strings.TrimSpace(strategyName)
	if name != "" {
		if _, err := store.Get(name); err == nil {
			return true
		}
	}
	id := strings.TrimSpace(strategyID)
	if id == "" {
		return false
	}
	for existingName, existingID := range store.NameToIDMap() {
		if existingID == id {
			if _, err := store.Get(existingName); err == nil {
				return true
			}
		}
	}
	return false
}

func currentStrategyScript(userID, strategyID, strategyName string) (strategyDetail, error) {
	store := NewStrategyStore(userID)
	name := strings.TrimSpace(strategyName)
	if name != "" {
		if detail, err := store.Get(name); err == nil {
			return detail, nil
		}
	}
	id := strings.TrimSpace(strategyID)
	if id != "" {
		for existingName, existingID := range store.NameToIDMap() {
			if existingID == id {
				return store.Get(existingName)
			}
		}
	}
	return strategyDetail{}, fmt.Errorf("策略不存在")
}

func rebindPaperForStrategy(userID, strategyID, oldName, newName string) error {
	strategyID = strings.TrimSpace(strategyID)
	oldName = strings.TrimSpace(oldName)
	newName = strings.TrimSpace(newName)
	if userID == "" || newName == "" || oldName == newName {
		return nil
	}
	sessions, err := listPaperSessions(userID)
	if err != nil {
		return err
	}
	for _, sess := range sessions {
		if !sameStrategyRef(sess.StrategyID, sess.StrategyName, strategyID, oldName) {
			continue
		}
		sess.StrategyName = newName
		if strategyID != "" {
			sess.StrategyID = strategyID
		}
		sess.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
		if err := savePaperSession(userID, sess); err != nil {
			return err
		}
	}
	return nil
}
