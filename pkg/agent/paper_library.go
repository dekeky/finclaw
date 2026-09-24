package agentruntime

import (
	"context"
	"encoding/json"
	"strings"
	"time"
)

const libraryPaperOwnerID = "__strategy_library__"

type libraryPaperSeed struct {
	EntryID       string
	Title         string
	Platform      string
	Script        string
	FromRunUserID string
	FromRunID     string
}

func (pr *PaperRouter) startLibraryPaper(seed libraryPaperSeed) (paperSession, error) {
	if pr == nil {
		return paperSession{}, nil
	}
	if seed.Platform != StrategyPlatformFinClaw {
		return paperSession{}, nil
	}
	req := createPaperRequest{
		Name:         seed.Title,
		StrategyName: seed.Title,
		FromRunID:    strings.TrimSpace(seed.FromRunID),
	}
	if req.FromRunID != "" && strings.TrimSpace(seed.FromRunUserID) != "" {
		if err := pr.applyCreateDefaults(seed.FromRunUserID, &req); err != nil {
			req.FromRunID = ""
		}
	}
	if strings.TrimSpace(req.Universe) == "" {
		req.Universe = "all"
		req.Symbols = nil
		req.Index = ""
	}
	universe, symbols, index, err := normalizeUniverse(req.Universe, req.Symbols, req.Index)
	if err != nil {
		universe, symbols, index = "all", nil, ""
	}
	if req.InitialCash <= 0 {
		req.InitialCash = 100000
	}
	goLive := paperToday()
	if latest, err := pr.latestMarketDate(context.Background(), paperSession{
		Universe:    universe,
		Symbols:     symbols,
		Index:       index,
		EngineStart: paperEngineStart(paperToday()),
		GoLive:      paperToday(),
	}); err == nil && latest != "" {
		goLive = latest
	}
	now := time.Now().UTC().Format(time.RFC3339)
	name, err := normalizePaperName(strings.TrimSpace(seed.Title))
	if err != nil {
		name = "市场实盘"
	}
	sess := paperSession{
		ID:              newPaperID(),
		Name:            name,
		Status:          paperStatusRunning,
		StrategyName:    strings.TrimSpace(seed.Title),
		LibraryEntryID:  strings.TrimSpace(seed.EntryID),
		GoLive:          goLive,
		EngineStart:     paperEngineStart(goLive),
		InitialCash:     req.InitialCash,
		Equity:          req.InitialCash,
		Universe:        universe,
		Symbols:         symbols,
		Index:           index,
		CommissionRate:  req.CommissionRate,
		MinCommission:   req.MinCommission,
		StampTaxRate:    req.StampTaxRate,
		TransferFeeRate: req.TransferFeeRate,
		Slippage:        req.Slippage,
		LotSize:         req.LotSize,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	if err := savePaperSession(libraryPaperOwnerID, sess); err != nil {
		return paperSession{}, err
	}
	if err := savePaperSource(libraryPaperOwnerID, sess.ID, seed.Script); err != nil {
		_ = deletePaperSession(libraryPaperOwnerID, sess.ID)
		return paperSession{}, err
	}
	pr.startSync(libraryPaperOwnerID, sess.ID, true)
	return sess, nil
}

func snapshotLatestStrategyRuns(userID, strategyID, strategyName string) ([]json.RawMessage, error) {
	items := loadLocalRunList(userID)
	ids := make([]string, 0, maxStrategyShareRuns)
	for _, item := range items {
		var row map[string]any
		if json.Unmarshal(item, &row) != nil {
			continue
		}
		if !strings.EqualFold(asString(row["status"]), "succeeded") {
			continue
		}
		if !sameStrategyRef(asString(row["strategy_id"]), asString(row["strategy_name"]), strategyID, strategyName) {
			continue
		}
		id := strings.TrimSpace(asString(row["id"]))
		if id == "" {
			continue
		}
		ids = append(ids, id)
		if len(ids) >= maxStrategyShareRuns {
			break
		}
	}
	if len(ids) == 0 {
		return nil, nil
	}
	return snapshotStrategyShareRuns(userID, strategyID, strategyName, ids)
}

func decodeLibraryRunsJSON(raw string) []any {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "[]" {
		return nil
	}
	var runs []any
	if json.Unmarshal([]byte(raw), &runs) != nil || len(runs) == 0 {
		return nil
	}
	return runs
}

func firstSnapshotRunID(runs []json.RawMessage) string {
	for _, raw := range runs {
		var row map[string]any
		if json.Unmarshal(raw, &row) != nil {
			continue
		}
		if id := strings.TrimSpace(asString(row["id"])); id != "" {
			return id
		}
	}
	return ""
}
