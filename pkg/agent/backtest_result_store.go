package agentruntime

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// AccountBacktestsDirName is the account-level folder that holds local
// backtest result files for AI analysis (~/.finclaw/{account}/backtests).
const AccountBacktestsDirName = "backtests"

type backtestIndexFile struct {
	Runs map[string]backtestIndexEntry `json:"runs"`
}

type backtestIndexEntry struct {
	ID        string `json:"id"`
	Strategy  string `json:"strategy"`
	Name      string `json:"name,omitempty"`
	Status    string `json:"status"`
	Dir       string `json:"dir"`
	UpdatedAt string `json:"updated_at"`
}

type backtestRunMeta struct {
	UpdatedAt string `json:"updated_at"`
	Status    string `json:"status"`
}

type parsedBacktestRun struct {
	ID           string
	Name         string
	Status       string
	StrategyName string
	CreatedAt    string
	UpdatedAt    string
	StartedAt    string
	FinishedAt   string
	Duration     any
	Request      map[string]any
	Result       map[string]any
	Source       string
	ErrorMessage string
	ErrorTrace   string
}

var backtestStoreMu sync.Mutex

func AccountBacktestsDir(home string) string {
	return filepath.Join(home, AccountBacktestsDirName)
}

func AccountBacktestsRootForUser(userID string) string {
	return AccountBacktestsDir(UserAgentHome(userID))
}

func persistSubmittedBacktest(userID, runID, status, strategyName, source string, req submitBacktestRequest) error {
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(runID) == "" {
		return fmt.Errorf("missing user or run id")
	}
	strategyName = strings.TrimSpace(strategyName)
	if strategyName == "" {
		strategyName = strings.TrimSpace(req.StrategyName)
	}
	createdAt := time.Now()
	displayName := defaultBacktestRunName(strategyName, createdAt)
	payload := map[string]any{
		"id":            runID,
		"name":          displayName,
		"status":        firstNonEmpty(status, "queued"),
		"strategy_name": strategyName,
		"created_at":    createdAt.Format(time.RFC3339),
		"updated_at":    createdAt.UTC().Format(time.RFC3339),
		"request": map[string]any{
			"strategy_name":     strategyName,
			"initial_cash":      req.InitialCash,
			"start_time":        req.StartTime,
			"end_time":          req.EndTime,
			"universe":          req.Universe,
			"symbols":           req.Symbols,
			"index":             req.Index,
			"commission_rate":   req.CommissionRate,
			"min_commission":    req.MinCommission,
			"stamp_tax_rate":    req.StampTaxRate,
			"transfer_fee_rate": req.TransferFeeRate,
			"slippage":          req.Slippage,
			"lot_size":          req.LotSize,
		},
	}
	if strings.TrimSpace(source) != "" {
		payload["source"] = source
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return persistBacktestRun(userID, raw)
}

func persistBacktestRun(userID string, raw json.RawMessage) error {
	run, err := parseBacktestRun(raw)
	if err != nil {
		return err
	}
	if run.ID == "" {
		return fmt.Errorf("backtest run missing id")
	}
	if run.StrategyName == "" {
		if existing, ok := lookupBacktestIndex(userID, run.ID); ok {
			run.StrategyName = existing.Strategy
			if run.Name == "" {
				run.Name = existing.Name
			}
		} else {
			run.StrategyName = "unknown"
		}
	}
	if run.Name == "" {
		run.Name = backtestDisplayName(run)
	}

	backtestStoreMu.Lock()
	defer backtestStoreMu.Unlock()

	index, err := loadBacktestIndexLocked(userID)
	if err != nil {
		return err
	}
	dir, err := allocateBacktestDirLocked(userID, run, index)
	if err != nil {
		return err
	}

	if !isTerminalBacktestStatus(run.Status) {
		return writeBacktestSnapshotLocked(userID, run, slimLiveRunPayload(raw), dir, false)
	}
	if alreadyFreshBacktest(dir, run.UpdatedAt, run.Status) {
		return upsertBacktestIndexLocked(userID, run, dir)
	}
	return writeBacktestSnapshotLocked(userID, run, raw, dir, true)
}

func slimLiveRunPayload(raw json.RawMessage) json.RawMessage {
	var top map[string]any
	if json.Unmarshal(raw, &top) != nil {
		return raw
	}
	delete(top, "source")
	delete(top, "result")
	out, err := json.Marshal(top)
	if err != nil {
		return raw
	}
	return out
}

func writeBacktestSnapshotLocked(userID string, run parsedBacktestRun, raw json.RawMessage, dir string, full bool) error {
	payload := []byte(raw)
	if full {
		if pretty, err := json.MarshalIndent(json.RawMessage(raw), "", "  "); err == nil {
			payload = pretty
		}
	}
	if err := os.WriteFile(filepath.Join(dir, "result.json"), payload, 0o600); err != nil {
		return fmt.Errorf("write result.json: %w", err)
	}
	meta, _ := json.MarshalIndent(backtestRunMeta{UpdatedAt: run.UpdatedAt, Status: run.Status}, "", "  ")
	_ = os.WriteFile(filepath.Join(dir, "meta.json"), meta, 0o600)
	if err := upsertBacktestIndexLocked(userID, run, dir); err != nil {
		return err
	}
	if !full {
		if _, err := os.Stat(filepath.Join(dir, "summary.md")); err != nil {
			full = true
		}
	}
	if !full {
		return nil
	}
	if len(run.Request) > 0 {
		reqJSON, err := json.MarshalIndent(run.Request, "", "  ")
		if err == nil {
			_ = os.WriteFile(filepath.Join(dir, "request.json"), reqJSON, 0o600)
		}
	}
	if strings.TrimSpace(run.Source) != "" {
		_ = os.WriteFile(filepath.Join(dir, "source.py"), []byte(run.Source), 0o600)
	}
	if err := os.WriteFile(filepath.Join(dir, "summary.md"), []byte(renderBacktestSummary(run, dir)), 0o600); err != nil {
		return fmt.Errorf("write summary.md: %w", err)
	}
	_ = rewriteBacktestReadmesLocked(userID)
	return nil
}

const blotterFillsFileName = "blotter-fills.json"

func persistBacktestBlotter(userID, runID string, raw json.RawMessage) error {
	runID = strings.TrimSpace(runID)
	if userID == "" || runID == "" {
		return fmt.Errorf("missing user or run id")
	}
	fills, fillsErr := extractBlotterFills(raw)
	backtestStoreMu.Lock()
	defer backtestStoreMu.Unlock()

	dir, err := resolveBacktestRunDirLocked(userID, runID)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	pretty, err := json.MarshalIndent(json.RawMessage(raw), "", "  ")
	if err != nil {
		pretty = raw
	}
	if err := os.WriteFile(filepath.Join(dir, "blotter.json"), pretty, 0o600); err != nil {
		return err
	}
	if fillsErr != nil {
		return fillsErr
	}
	return os.WriteFile(filepath.Join(dir, blotterFillsFileName), fills, 0o600)
}

func persistBacktestBlotterFills(userID, runID string, raw json.RawMessage) error {
	runID = strings.TrimSpace(runID)
	if userID == "" || runID == "" || len(raw) == 0 {
		return fmt.Errorf("missing user, run id, or fills")
	}
	backtestStoreMu.Lock()
	defer backtestStoreMu.Unlock()
	dir, err := resolveBacktestRunDirLocked(userID, runID)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, blotterFillsFileName), raw, 0o600)
}

func persistBacktestPositions(userID, runID string, raw json.RawMessage) error {
	runID = strings.TrimSpace(runID)
	if userID == "" || runID == "" {
		return fmt.Errorf("missing user or run id")
	}
	backtestStoreMu.Lock()
	defer backtestStoreMu.Unlock()

	dir, err := resolveBacktestRunDirLocked(userID, runID)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	pretty, err := json.MarshalIndent(json.RawMessage(raw), "", "  ")
	if err != nil {
		pretty = raw
	}
	return os.WriteFile(filepath.Join(dir, "positions.json"), pretty, 0o600)
}

func persistBacktestRename(userID, runID, name string) error {
	runID = strings.TrimSpace(runID)
	name = strings.TrimSpace(name)
	if userID == "" || runID == "" {
		return fmt.Errorf("missing user or run id")
	}

	backtestStoreMu.Lock()
	defer backtestStoreMu.Unlock()

	index, err := loadBacktestIndexLocked(userID)
	if err != nil {
		return err
	}
	entry, ok := index.Runs[runID]
	if !ok {
		return nil
	}
	entry.Name = name
	entry.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	run := parsedBacktestRun{
		ID:           runID,
		Name:         name,
		StrategyName: entry.Strategy,
		Status:       entry.Status,
		UpdatedAt:    entry.UpdatedAt,
	}
	dir, err := allocateBacktestDirLocked(userID, run, index)
	if err != nil {
		return err
	}
	rel, err := filepath.Rel(AccountBacktestsRootForUser(userID), dir)
	if err != nil {
		rel = filepath.Join(entry.Strategy, name)
	}
	entry.Dir = filepath.ToSlash(rel)
	index.Runs[runID] = entry
	if err := saveBacktestIndexLocked(userID, index); err != nil {
		return err
	}

	summaryPath := filepath.Join(dir, "summary.md")
	if data, err := os.ReadFile(summaryPath); err == nil {
		updated := replaceBacktestSummaryName(string(data), name)
		_ = os.WriteFile(summaryPath, []byte(updated), 0o600)
	}
	if data, err := os.ReadFile(filepath.Join(dir, "result.json")); err == nil {
		var top map[string]any
		if json.Unmarshal(data, &top) == nil {
			top["name"] = name
			if patched, err := json.MarshalIndent(top, "", "  "); err == nil {
				_ = os.WriteFile(filepath.Join(dir, "result.json"), patched, 0o600)
			}
		}
	}
	_ = rewriteBacktestReadmesLocked(userID)
	return nil
}

func removePersistedBacktest(userID, runID string) error {
	runID = strings.TrimSpace(runID)
	if userID == "" || runID == "" {
		return nil
	}

	backtestStoreMu.Lock()
	defer backtestStoreMu.Unlock()

	index, err := loadBacktestIndexLocked(userID)
	if err != nil {
		return err
	}
	entry, ok := index.Runs[runID]
	if ok {
		dir := filepath.Join(AccountBacktestsRootForUser(userID), filepath.FromSlash(entry.Dir))
		if err := os.RemoveAll(dir); err != nil {
			return fmt.Errorf("remove backtest dir: %w", err)
		}
		delete(index.Runs, runID)
		if err := saveBacktestIndexLocked(userID, index); err != nil {
			return err
		}
		_ = rewriteBacktestReadmesLocked(userID)
		return nil
	}

	if dir, err := findBacktestRunDirLocked(userID, runID); err == nil {
		_ = os.RemoveAll(dir)
	}
	return nil
}

func isTerminalBacktestStatus(status string) bool {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "succeeded", "failed", "canceled", "cancelled", "error":
		return true
	default:
		return false
	}
}

func statusFromBacktestRaw(raw json.RawMessage) string {
	run, err := parseBacktestRun(raw)
	if err != nil {
		return ""
	}
	return run.Status
}

func parseBacktestRun(raw json.RawMessage) (parsedBacktestRun, error) {
	var top map[string]any
	if err := json.Unmarshal(raw, &top); err != nil {
		return parsedBacktestRun{}, fmt.Errorf("parse backtest run: %w", err)
	}
	req := asMap(top["request"])
	result := asMap(top["result"])
	errObj := asMap(top["error"])
	strategy := firstNonEmpty(
		asString(top["strategy_name"]),
		asString(req["strategy_name"]),
	)
	return parsedBacktestRun{
		ID:           asString(top["id"]),
		Name:         asString(top["name"]),
		Status:       asString(top["status"]),
		StrategyName: strategy,
		CreatedAt:    asString(top["created_at"]),
		UpdatedAt:    firstNonEmpty(asString(top["updated_at"]), asString(top["finished_at"]), asString(top["created_at"])),
		StartedAt:    asString(top["started_at"]),
		FinishedAt:   asString(top["finished_at"]),
		Duration:     top["duration_seconds"],
		Request:      req,
		Result:       result,
		Source:       asString(top["source"]),
		ErrorMessage: firstNonEmpty(asString(errObj["message"]), asString(top["error"])),
		ErrorTrace:   asString(errObj["traceback"]),
	}, nil
}

func defaultBacktestRunName(strategyName string, when time.Time) string {
	base := strings.TrimSpace(strategyName)
	if base == "" {
		base = "run"
	}
	if when.IsZero() {
		when = time.Now()
	}
	return base + "_" + when.In(time.Local).Format("20060102_1504")
}

func parseBacktestTime(raw string) (time.Time, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return time.Time{}, false
	}
	if parsed, err := time.Parse(time.RFC3339Nano, raw); err == nil {
		return parsed, true
	}
	if parsed, err := time.Parse(time.RFC3339, raw); err == nil {
		return parsed, true
	}
	return time.Time{}, false
}

func backtestDisplayName(run parsedBacktestRun) string {
	if name := strings.TrimSpace(run.Name); name != "" {
		return name
	}
	if when, ok := parseBacktestTime(firstNonEmpty(run.CreatedAt, run.StartedAt, run.UpdatedAt)); ok {
		return defaultBacktestRunName(run.StrategyName, when)
	}
	return firstNonEmpty(strings.TrimSpace(run.StrategyName), strings.TrimSpace(run.ID))
}

func allocateBacktestDirLocked(userID string, run parsedBacktestRun, index *backtestIndexFile) (string, error) {
	strategySeg, err := safeBacktestPathSegment(run.StrategyName)
	if err != nil {
		return "", fmt.Errorf("invalid strategy name: %w", err)
	}
	nameSeg, err := safeBacktestPathSegment(backtestDisplayName(run))
	if err != nil {
		return "", fmt.Errorf("invalid backtest name: %w", err)
	}
	root := AccountBacktestsRootForUser(userID)
	folder := uniqueBacktestFolder(root, strategySeg, nameSeg, run.ID, index)
	next := filepath.Join(root, strategySeg, folder)
	if existing, ok := index.Runs[run.ID]; ok && existing.Dir != "" {
		current := filepath.Join(root, filepath.FromSlash(existing.Dir))
		if filepath.Clean(current) == filepath.Clean(next) {
			if err := os.MkdirAll(next, 0o755); err != nil {
				return "", fmt.Errorf("mkdir backtest run: %w", err)
			}
			return next, nil
		}
		if st, err := os.Stat(current); err == nil && st.IsDir() {
			if err := os.MkdirAll(filepath.Dir(next), 0o755); err != nil {
				return "", fmt.Errorf("mkdir backtest strategy: %w", err)
			}
			if _, err := os.Stat(next); err == nil {
				if !dirOwnedByRun(next, run.ID) {
					return "", fmt.Errorf("backtest folder already exists: %s", folder)
				}
			} else if err := os.Rename(current, next); err != nil {
				return "", fmt.Errorf("rename backtest folder: %w", err)
			}
			return next, nil
		}
	}
	if err := os.MkdirAll(next, 0o755); err != nil {
		return "", fmt.Errorf("mkdir backtest run: %w", err)
	}
	return next, nil
}

func uniqueBacktestFolder(root, strategy, desired, runID string, index *backtestIndexFile) string {
	candidate := desired
	n := 2
	for {
		rel := filepath.ToSlash(filepath.Join(strategy, candidate))
		taken := false
		if index != nil {
			for id, entry := range index.Runs {
				if id != runID && entry.Dir == rel {
					taken = true
					break
				}
			}
		}
		if !taken {
			path := filepath.Join(root, strategy, candidate)
			if st, err := os.Stat(path); err == nil && st.IsDir() && !dirOwnedByRun(path, runID) {
				taken = true
			}
		}
		if !taken {
			return candidate
		}
		candidate = fmt.Sprintf("%s-%d", desired, n)
		n++
	}
}

func dirOwnedByRun(dir, runID string) bool {
	data, err := os.ReadFile(filepath.Join(dir, "result.json"))
	if err != nil {
		return false
	}
	var top map[string]any
	if json.Unmarshal(data, &top) != nil {
		return false
	}
	return asString(top["id"]) == runID
}

func safeBacktestPathSegment(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", fmt.Errorf("empty name")
	}
	if name == "." || name == ".." {
		return "", fmt.Errorf("invalid name")
	}
	if strings.ContainsAny(name, `/\:*?"<>|`) || strings.Contains(name, "..") {
		return "", fmt.Errorf("name must not contain path separators")
	}
	for _, r := range name {
		if r < 0x20 || r == 0x7f {
			return "", fmt.Errorf("name contains invalid control characters")
		}
	}
	return name, nil
}

func alreadyFreshBacktest(dir, updatedAt, status string) bool {
	data, err := os.ReadFile(filepath.Join(dir, "meta.json"))
	if err != nil {
		return false
	}
	var meta backtestRunMeta
	if json.Unmarshal(data, &meta) != nil {
		return false
	}
	return meta.UpdatedAt == updatedAt && meta.Status == status && updatedAt != ""
}

func lookupBacktestIndex(userID, runID string) (backtestIndexEntry, bool) {
	backtestStoreMu.Lock()
	defer backtestStoreMu.Unlock()
	index, err := loadBacktestIndexLocked(userID)
	if err != nil {
		return backtestIndexEntry{}, false
	}
	entry, ok := index.Runs[runID]
	return entry, ok
}

func resolveBacktestRunDirLocked(userID, runID string) (string, error) {
	index, err := loadBacktestIndexLocked(userID)
	if err != nil {
		return "", err
	}
	if entry, ok := index.Runs[runID]; ok && entry.Dir != "" {
		return filepath.Join(AccountBacktestsRootForUser(userID), filepath.FromSlash(entry.Dir)), nil
	}
	return findBacktestRunDirLocked(userID, runID)
}

func findBacktestRunDirLocked(userID, runID string) (string, error) {
	root := AccountBacktestsRootForUser(userID)
	entries, err := os.ReadDir(root)
	if err != nil {
		return "", fmt.Errorf("backtest run %q not found locally", runID)
	}
	for _, strategyEnt := range entries {
		if !strategyEnt.IsDir() {
			continue
		}
		strategyDir := filepath.Join(root, strategyEnt.Name())
		if legacy := filepath.Join(strategyDir, runID); dirOwnedByRun(legacy, runID) {
			return legacy, nil
		}
		runs, err := os.ReadDir(strategyDir)
		if err != nil {
			continue
		}
		for _, runEnt := range runs {
			if !runEnt.IsDir() {
				continue
			}
			candidate := filepath.Join(strategyDir, runEnt.Name())
			if dirOwnedByRun(candidate, runID) {
				return candidate, nil
			}
		}
	}
	return "", fmt.Errorf("backtest run %q not found locally", runID)
}

func upsertBacktestIndexLocked(userID string, run parsedBacktestRun, dir string) error {
	index, err := loadBacktestIndexLocked(userID)
	if err != nil {
		return err
	}
	rel, err := filepath.Rel(AccountBacktestsRootForUser(userID), dir)
	if err != nil {
		rel = filepath.Join(run.StrategyName, run.ID)
	}
	index.Runs[run.ID] = backtestIndexEntry{
		ID:        run.ID,
		Strategy:  run.StrategyName,
		Name:      run.Name,
		Status:    run.Status,
		Dir:       filepath.ToSlash(rel),
		UpdatedAt: firstNonEmpty(run.UpdatedAt, time.Now().UTC().Format(time.RFC3339)),
	}
	return saveBacktestIndexLocked(userID, index)
}

func loadBacktestIndexLocked(userID string) (*backtestIndexFile, error) {
	path := filepath.Join(AccountBacktestsRootForUser(userID), "index.json")
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &backtestIndexFile{Runs: map[string]backtestIndexEntry{}}, nil
		}
		return nil, fmt.Errorf("read backtest index: %w", err)
	}
	var file backtestIndexFile
	if err := json.Unmarshal(data, &file); err != nil {
		return nil, fmt.Errorf("parse backtest index: %w", err)
	}
	if file.Runs == nil {
		file.Runs = map[string]backtestIndexEntry{}
	}
	return &file, nil
}

func saveBacktestIndexLocked(userID string, file *backtestIndexFile) error {
	root := AccountBacktestsRootForUser(userID)
	if err := os.MkdirAll(root, 0o755); err != nil {
		return fmt.Errorf("mkdir backtests: %w", err)
	}
	data, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(root, "index.json"), data, 0o600)
}

func rewriteBacktestReadmesLocked(userID string) error {
	index, err := loadBacktestIndexLocked(userID)
	if err != nil {
		return err
	}
	root := AccountBacktestsRootForUser(userID)
	if err := os.WriteFile(filepath.Join(root, "README.md"), []byte(renderBacktestRootReadme(index)), 0o600); err != nil {
		return err
	}

	byStrategy := map[string][]backtestIndexEntry{}
	for _, entry := range index.Runs {
		byStrategy[entry.Strategy] = append(byStrategy[entry.Strategy], entry)
	}
	for strategy, runs := range byStrategy {
		seg, err := safeBacktestPathSegment(strategy)
		if err != nil {
			continue
		}
		dir := filepath.Join(root, seg)
		_ = os.MkdirAll(dir, 0o755)
		_ = os.WriteFile(filepath.Join(dir, "README.md"), []byte(renderBacktestStrategyReadme(strategy, runs)), 0o600)
	}
	return nil
}

func renderBacktestRootReadme(index *backtestIndexFile) string {
	var b strings.Builder
	b.WriteString("# 本地回测结果\n\n")
	b.WriteString("FinClaw 每次回测都会把结果写成这个目录下的本地文件，方便 AI 用 `read_file` 分析。\n\n")
	b.WriteString("分析时请先读对应回测名称目录里的 `summary.md`，需要成交或净值细节再读 `result.json` / `blotter.json`。不要凭记忆编造指标。\n\n")
	b.WriteString("## 目录结构\n\n")
	b.WriteString("- `{策略名}/{回测名称}/summary.md` 摘要与关键指标\n")
	b.WriteString("- `{策略名}/{回测名称}/result.json` 完整回测 JSON\n")
	b.WriteString("- `{策略名}/{回测名称}/request.json` 回测参数\n")
	b.WriteString("- `{策略名}/{回测名称}/source.py` 当次策略源码\n")
	b.WriteString("- `{策略名}/{回测名称}/blotter.json` 委托与成交（若已拉取）\n\n")
	b.WriteString("## 最近回测\n\n")
	b.WriteString("| 策略 | 回测名称 | 状态 |\n| --- | --- | --- |\n")
	for _, entry := range sortedBacktestEntries(index.Runs) {
		b.WriteString("| ")
		b.WriteString(escapeMarkdownCell(entry.Strategy))
		b.WriteString(" | ")
		b.WriteString(escapeMarkdownCell(firstNonEmpty(entry.Name, filepath.Base(entry.Dir))))
		b.WriteString(" | ")
		b.WriteString(escapeMarkdownCell(entry.Status))
		b.WriteString(" |\n")
	}
	return b.String()
}

func renderBacktestStrategyReadme(strategy string, runs []backtestIndexEntry) string {
	var b strings.Builder
	b.WriteString("# 策略回测：")
	b.WriteString(strategy)
	b.WriteString("\n\n")
	b.WriteString("| 回测名称 | 状态 | 更新时间 |\n| --- | --- | --- |\n")
	sort.Slice(runs, func(i, j int) bool {
		if runs[i].UpdatedAt != runs[j].UpdatedAt {
			return runs[i].UpdatedAt > runs[j].UpdatedAt
		}
		return firstNonEmpty(runs[i].Name, runs[i].ID) > firstNonEmpty(runs[j].Name, runs[j].ID)
	})
	for _, entry := range runs {
		b.WriteString("| ")
		b.WriteString(escapeMarkdownCell(firstNonEmpty(entry.Name, filepath.Base(entry.Dir))))
		b.WriteString(" | ")
		b.WriteString(escapeMarkdownCell(entry.Status))
		b.WriteString(" | ")
		b.WriteString(escapeMarkdownCell(entry.UpdatedAt))
		b.WriteString(" |\n")
	}
	return b.String()
}

func renderBacktestSummary(run parsedBacktestRun, dir string) string {
	var b strings.Builder
	b.WriteString("# 回测结果\n\n")
	b.WriteString("- 策略：")
	b.WriteString(run.StrategyName)
	b.WriteString("\n- 回测名称：")
	b.WriteString(backtestDisplayName(run))
	b.WriteString("\n- 状态：")
	b.WriteString(firstNonEmpty(run.Status, "unknown"))
	b.WriteString("\n")
	if start, end := asString(run.Request["start_time"]), asString(run.Request["end_time"]); start != "" || end != "" {
		b.WriteString("- 区间：")
		b.WriteString(firstNonEmpty(start, "-"))
		b.WriteString(" ~ ")
		b.WriteString(firstNonEmpty(end, "-"))
		b.WriteString("\n")
	}
	if cash := formatBacktestNumber(run.Request["initial_cash"]); cash != "" {
		b.WriteString("- 初始资金：")
		b.WriteString(cash)
		b.WriteString("\n")
	}
	if universe := asString(run.Request["universe"]); universe != "" {
		b.WriteString("- 标的范围：")
		b.WriteString(universe)
		b.WriteString("\n")
	}
	if symbols := formatBacktestSymbols(run.Request["symbols"]); symbols != "" {
		b.WriteString("- 标的：")
		b.WriteString(symbols)
		b.WriteString("\n")
	}
	if index := asString(run.Request["index"]); index != "" {
		b.WriteString("- 指数：")
		b.WriteString(index)
		b.WriteString("\n")
	}
	if run.CreatedAt != "" {
		b.WriteString("- 创建时间：")
		b.WriteString(run.CreatedAt)
		b.WriteString("\n")
	}
	if run.FinishedAt != "" {
		b.WriteString("- 完成时间：")
		b.WriteString(run.FinishedAt)
		b.WriteString("\n")
	}
	if dur := formatBacktestNumber(run.Duration); dur != "" {
		b.WriteString("- 耗时（秒）：")
		b.WriteString(dur)
		b.WriteString("\n")
	}

	if run.ErrorMessage != "" {
		b.WriteString("\n## 错误\n\n")
		b.WriteString(run.ErrorMessage)
		b.WriteString("\n")
		if run.ErrorTrace != "" {
			b.WriteString("\n```\n")
			b.WriteString(run.ErrorTrace)
			b.WriteString("\n```\n")
		}
	}

	metrics := asMap(run.Result["metrics"])
	if len(metrics) > 0 {
		b.WriteString("\n## 关键指标\n\n")
		b.WriteString("| 指标 | 值 |\n| --- | --- |\n")
		for _, item := range preferredBacktestMetrics() {
			if value, ok := metrics[item.key]; ok {
				b.WriteString("| ")
				b.WriteString(item.label)
				b.WriteString(" | ")
				b.WriteString(escapeMarkdownCell(formatBacktestNumber(value)))
				b.WriteString(" |\n")
			}
		}
		b.WriteString("\n### 全部指标\n\n")
		keys := make([]string, 0, len(metrics))
		for key := range metrics {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			b.WriteString("- ")
			b.WriteString(key)
			b.WriteString(": ")
			b.WriteString(formatBacktestNumber(metrics[key]))
			b.WriteString("\n")
		}
	}

	if trades, ok := run.Result["trades"].([]any); ok {
		b.WriteString("\n## 成交\n\n共 ")
		b.WriteString(strconv.Itoa(len(trades)))
		b.WriteString(" 笔，明细见 `result.json` 的 `result.trades` 或 `blotter.json`。\n")
	}

	b.WriteString("\n## 本地文件\n\n")
	b.WriteString("- 目录：`")
	b.WriteString(dir)
	b.WriteString("`\n")
	b.WriteString("- `summary.md` 本摘要\n")
	b.WriteString("- `result.json` 完整回测结果\n")
	b.WriteString("- `request.json` 回测参数\n")
	b.WriteString("- `source.py` 当次策略源码\n")
	b.WriteString("- `blotter.json` 委托与成交（若已拉取）\n")
	return b.String()
}

func preferredBacktestMetrics() []struct{ key, label string } {
	return []struct{ key, label string }{
		{"total_return_pct", "累计收益率"},
		{"annualized_return", "年化收益率"},
		{"max_drawdown_pct", "最大回撤"},
		{"sharpe_ratio", "夏普比率"},
		{"win_rate", "胜率"},
		{"trade_count", "交易次数"},
		{"total_pnl", "总盈亏"},
		{"end_market_value", "期末净值"},
	}
}

func replaceBacktestSummaryName(summary, name string) string {
	const prefix = "- 回测名称："
	lines := strings.Split(summary, "\n")
	replaced := false
	for i, line := range lines {
		if strings.HasPrefix(line, prefix) {
			lines[i] = prefix + name
			replaced = true
			break
		}
	}
	if replaced {
		return strings.Join(lines, "\n")
	}
	insert := prefix + name
	for i, line := range lines {
		if strings.HasPrefix(line, "- 策略：") {
			out := make([]string, 0, len(lines)+1)
			out = append(out, lines[:i+1]...)
			out = append(out, insert)
			out = append(out, lines[i+1:]...)
			return strings.Join(out, "\n")
		}
	}
	return insert + "\n" + summary
}

func sortedBacktestEntries(runs map[string]backtestIndexEntry) []backtestIndexEntry {
	out := make([]backtestIndexEntry, 0, len(runs))
	for _, entry := range runs {
		out = append(out, entry)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].UpdatedAt != out[j].UpdatedAt {
			return out[i].UpdatedAt > out[j].UpdatedAt
		}
		return out[i].ID > out[j].ID
	})
	return out
}

func asMap(v any) map[string]any {
	if m, ok := v.(map[string]any); ok {
		return m
	}
	return map[string]any{}
}

func asString(v any) string {
	switch t := v.(type) {
	case string:
		return strings.TrimSpace(t)
	case fmt.Stringer:
		return strings.TrimSpace(t.String())
	case json.Number:
		return t.String()
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case int:
		return strconv.Itoa(t)
	default:
		return ""
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func formatBacktestNumber(v any) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return t
	case json.Number:
		return t.String()
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case float32:
		return strconv.FormatFloat(float64(t), 'f', -1, 32)
	case int:
		return strconv.Itoa(t)
	case int64:
		return strconv.FormatInt(t, 10)
	case json.RawMessage:
		return strings.TrimSpace(string(t))
	default:
		data, err := json.Marshal(t)
		if err != nil {
			return fmt.Sprint(t)
		}
		return string(data)
	}
}

func formatBacktestSymbols(v any) string {
	switch t := v.(type) {
	case []any:
		parts := make([]string, 0, len(t))
		for _, item := range t {
			if s := asString(item); s != "" {
				parts = append(parts, s)
			}
		}
		return strings.Join(parts, ", ")
	case []string:
		return strings.Join(t, ", ")
	default:
		return asString(v)
	}
}

func escapeMarkdownCell(s string) string {
	s = strings.ReplaceAll(s, "|", "\\|")
	s = strings.ReplaceAll(s, "\n", " ")
	return s
}

func loadLocalRunRaw(userID, runID string) (json.RawMessage, bool) {
	data, err := readLocalRunFile(userID, runID, "result.json")
	if err != nil {
		return nil, false
	}
	return json.RawMessage(data), true
}

func loadLocalBlotter(userID, runID string) (json.RawMessage, bool) {
	data, err := readLocalRunFile(userID, runID, "blotter.json")
	if err != nil {
		return nil, false
	}
	return json.RawMessage(data), true
}

func loadLocalBlotterFills(userID, runID string) (json.RawMessage, bool) {
	data, err := readLocalRunFile(userID, runID, blotterFillsFileName)
	if err != nil {
		return nil, false
	}
	return json.RawMessage(data), true
}

func loadLocalPositions(userID, runID string) (json.RawMessage, bool) {
	data, err := readLocalRunFile(userID, runID, "positions.json")
	if err != nil {
		return nil, false
	}
	return json.RawMessage(data), true
}

func localRunIsTerminal(userID, runID string) bool {
	raw, ok := loadLocalRunRaw(userID, runID)
	if !ok {
		return false
	}
	return isTerminalBacktestStatus(statusFromBacktestRaw(raw))
}

func localRunIndexIsTerminal(userID, runID string) bool {
	entry, ok := lookupBacktestIndex(userID, runID)
	return ok && isTerminalBacktestStatus(entry.Status)
}

func localHasRun(userID, runID string) bool {
	_, ok := loadLocalRunRaw(userID, runID)
	return ok
}

func loadLocalRunList(userID string) []json.RawMessage {
	backtestStoreMu.Lock()
	index, err := loadBacktestIndexLocked(userID)
	root := AccountBacktestsRootForUser(userID)
	var entries []backtestIndexEntry
	if err == nil {
		entries = sortedBacktestEntries(index.Runs)
	}
	backtestStoreMu.Unlock()
	if err != nil || len(entries) == 0 {
		return []json.RawMessage{}
	}
	items := make([]json.RawMessage, 0, len(entries))
	for _, entry := range entries {
		data, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(entry.Dir), "result.json"))
		if err != nil {
			continue
		}
		items = append(items, runJSONToListItem(data, entry))
	}
	return items
}

func readLocalRunFile(userID, runID, name string) ([]byte, error) {
	backtestStoreMu.Lock()
	defer backtestStoreMu.Unlock()
	dir, err := resolveBacktestRunDirLocked(userID, strings.TrimSpace(runID))
	if err != nil {
		return nil, err
	}
	return os.ReadFile(filepath.Join(dir, name))
}

func runJSONToListItem(raw []byte, entry backtestIndexEntry) json.RawMessage {
	var top map[string]any
	if json.Unmarshal(raw, &top) != nil {
		return json.RawMessage(`{}`)
	}
	req := asMap(top["request"])
	symbols := req["symbols"]
	if symbols == nil {
		symbols = []any{}
	}
	item := map[string]any{
		"id":               firstNonEmpty(asString(top["id"]), entry.ID),
		"name":             firstNonEmpty(asString(top["name"]), entry.Name),
		"status":           firstNonEmpty(asString(top["status"]), entry.Status),
		"strategy_name":    firstNonEmpty(asString(top["strategy_name"]), asString(req["strategy_name"]), entry.Strategy),
		"created_at":       top["created_at"],
		"updated_at":       firstNonEmpty(asString(top["updated_at"]), entry.UpdatedAt),
		"started_at":       top["started_at"],
		"finished_at":      top["finished_at"],
		"duration_seconds": top["duration_seconds"],
		"symbols":          symbols,
		"request":          req,
	}
	out, err := json.Marshal(item)
	if err != nil {
		return json.RawMessage(`{}`)
	}
	return out
}

func filterLocalPositions(raw json.RawMessage, date, symbol string) (json.RawMessage, error) {
	date = strings.TrimSpace(date)
	symbol = strings.TrimSpace(symbol)
	if date == "" && symbol == "" {
		return raw, nil
	}
	var envelope struct {
		Items []map[string]any `json:"items"`
	}
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return nil, err
	}
	filtered := make([]map[string]any, 0, len(envelope.Items))
	for _, item := range envelope.Items {
		if symbol != "" && asString(item["symbol"]) != symbol {
			continue
		}
		if date != "" {
			t := asString(item["time"])
			if t == "" {
				t = asString(item["date"])
			}
			if t != "" && !strings.HasPrefix(t, date) {
				continue
			}
		}
		filtered = append(filtered, item)
	}
	out, err := json.Marshal(map[string]any{"items": filtered})
	if err != nil {
		return nil, err
	}
	return out, nil
}
