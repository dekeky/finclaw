package agentruntime

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/dekeky/rssmanager/pkg/ginx"
	"github.com/finclaw/internal/auth"
	"github.com/gin-gonic/gin"
)

const maxStrategyShareRuns = 20

type createStrategyShareRequest struct {
	RunIDs []string `json:"run_ids"`
}

type createStrategyShareResp struct {
	Token string `json:"token"`
	URL   string `json:"url"`
}

func (sr *StrategyRouter) createStrategyShare(c *gin.Context) {
	if sr.authStore == nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(fmt.Errorf("share store is not configured"))
		return
	}
	userID := getUserID(c)
	name := strings.TrimSpace(c.Param("name"))
	var req createStrategyShareRequest
	ginx.PanicIfNotNil(c.ShouldBindJSON(&req))

	detail, err := NewStrategyStore(userID).Get(name)
	if err != nil {
		status := http.StatusInternalServerError
		if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		}
		ginx.NewRender(c, status).Err(err)
		return
	}

	runs, err := snapshotStrategyShareRuns(userID, detail.Name, req.RunIDs)
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		}
		ginx.NewRender(c, status).Err(err)
		return
	}
	runsJSON, err := json.Marshal(runs)
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(fmt.Errorf("encode shared runs: %w", err))
		return
	}

	share, err := sr.authStore.CreateStrategyShare(&auth.StrategyShare{
		UserID:       userID,
		StrategyName: detail.Name,
		Title:        detail.Name,
		Platform:     detail.Platform,
		Script:       detail.Script,
		RunsJSON:     string(runsJSON),
	})
	if err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}
	ginx.NewRender(c, http.StatusCreated).Data(createStrategyShareResp{Token: share.Token, URL: PublicShareURL(c, share.Token)})
}

func snapshotStrategyShareRuns(userID, strategyName string, runIDs []string) ([]json.RawMessage, error) {
	if len(runIDs) > maxStrategyShareRuns {
		return nil, fmt.Errorf("最多选择 %d 条回测记录", maxStrategyShareRuns)
	}
	out := make([]json.RawMessage, 0, len(runIDs))
	seen := make(map[string]bool, len(runIDs))
	for _, rawID := range runIDs {
		id := strings.TrimSpace(rawID)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		raw, ok := loadLocalRunRaw(userID, id)
		if !ok {
			return nil, fmt.Errorf("backtest run %q not found", id)
		}
		run, err := parseBacktestRun(raw)
		if err != nil {
			return nil, err
		}
		if strings.TrimSpace(run.StrategyName) != strategyName {
			return nil, fmt.Errorf("backtest run %q does not belong to strategy %q", id, strategyName)
		}
		out = append(out, enrichRunSnapshot(userID, id, raw))
	}
	return out, nil
}

func enrichRunSnapshot(userID, runID string, raw json.RawMessage) json.RawMessage {
	var run map[string]any
	if err := json.Unmarshal(raw, &run); err != nil {
		return raw
	}
	result := asMap(run["result"])
	if result == nil {
		result = map[string]any{}
	}
	run["result"] = result

	fillsRaw, ok := loadLocalBlotterFills(userID, runID)
	if !ok {
		if blotter, hasBlotter := loadLocalBlotter(userID, runID); hasBlotter {
			if extracted, err := extractBlotterFills(blotter); err == nil {
				fillsRaw, ok = extracted, true
			}
		}
	}
	if ok {
		var fillsMap map[string]any
		if err := json.Unmarshal(fillsRaw, &fillsMap); err == nil {
			if result["trades"] == nil && fillsMap["trades"] != nil {
				result["trades"] = fillsMap["trades"]
			}
			if result["orders"] == nil && fillsMap["orders"] != nil {
				result["orders"] = fillsMap["orders"]
			}
			if result["action_days"] == nil && fillsMap["action_days"] != nil {
				result["action_days"] = fillsMap["action_days"]
			}
			if result["rebalances"] == nil && fillsMap["rebalances"] != nil {
				result["rebalances"] = fillsMap["rebalances"]
			}
		}
	}

	if result["holdings"] == nil {
		if pos, ok := loadLocalPositions(userID, runID); ok {
			var envelope struct {
				Items []any `json:"items"`
			}
			if err := json.Unmarshal(pos, &envelope); err == nil && envelope.Items != nil {
				result["holdings"] = envelope.Items
			}
		}
	}

	out, err := json.Marshal(run)
	if err != nil {
		return raw
	}
	return out
}

// HydrateStrategyShareRuns fills missing blotter/holdings on stored share snapshots
// from the owner's local run files so older links still open like the backtest UI.
func HydrateStrategyShareRuns(userID string, runs []any) []any {
	if len(runs) == 0 {
		return runs
	}
	out := make([]any, 0, len(runs))
	for _, item := range runs {
		run, ok := item.(map[string]any)
		if !ok {
			out = append(out, item)
			continue
		}
		id := strings.TrimSpace(asString(run["id"]))
		if id == "" {
			out = append(out, item)
			continue
		}
		raw, err := json.Marshal(run)
		if err != nil {
			out = append(out, item)
			continue
		}
		var next any
		if err := json.Unmarshal(enrichRunSnapshot(userID, id, raw), &next); err != nil {
			out = append(out, item)
			continue
		}
		out = append(out, next)
	}
	return out
}

// ShareRunsAllowSymbol reports whether a ticker appears in the shared run snapshots.
func ShareRunsAllowSymbol(runs []any, code string) bool {
	code = strings.TrimSpace(code)
	if code == "" {
		return false
	}
	for _, item := range runs {
		run, ok := item.(map[string]any)
		if !ok {
			continue
		}
		req := asMap(run["request"])
		if listContainsString(req["symbols"], code) {
			return true
		}
		result := asMap(run["result"])
		if listHasSymbol(result["orders"], code) || listHasSymbol(result["trades"], code) ||
			listHasSymbol(result["positions"], code) || listHasSymbol(result["holdings"], code) {
			return true
		}
	}
	return false
}

// ShareRunsDateRange returns the union of request start/end times on shared runs.
func ShareRunsDateRange(runs []any) (start, end string) {
	for _, item := range runs {
		run, ok := item.(map[string]any)
		if !ok {
			continue
		}
		req := asMap(run["request"])
		if start == "" {
			start = strings.TrimSpace(asString(req["start_time"]))
		}
		if next := strings.TrimSpace(asString(req["end_time"])); next != "" {
			end = next
		}
	}
	return start, end
}

func listContainsString(v any, want string) bool {
	items, ok := v.([]any)
	if !ok {
		return false
	}
	for _, item := range items {
		if strings.TrimSpace(asString(item)) == want {
			return true
		}
	}
	return false
}

func listHasSymbol(v any, want string) bool {
	items, ok := v.([]any)
	if !ok {
		return false
	}
	for _, item := range items {
		row := asMap(item)
		if strings.TrimSpace(asString(row["symbol"])) == want {
			return true
		}
	}
	return false
}
