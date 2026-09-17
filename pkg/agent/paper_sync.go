package agentruntime

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/finclaw/pkg/agent/fquant"
	"github.com/sipeed/picoclaw/pkg/logger"
)

var (
	paperPollInterval      = 5 * time.Second
	paperSyncTimeout       = 2 * time.Hour
	paperSchedulerInterval = 15 * time.Minute
)

var paperSyncLoops sync.Map

func paperSyncKey(userID, sessionID string) string {
	return userID + "/" + sessionID
}

func (pr *PaperRouter) startSync(userID, sessionID string, force bool) {
	if pr == nil || strings.TrimSpace(userID) == "" || strings.TrimSpace(sessionID) == "" {
		return
	}
	key := paperSyncKey(userID, sessionID)
	if _, loaded := paperSyncLoops.LoadOrStore(key, true); loaded {
		return
	}
	go func() {
		defer paperSyncLoops.Delete(key)
		ctx, cancel := context.WithTimeout(context.Background(), paperSyncTimeout)
		defer cancel()
		if err := pr.syncSession(ctx, userID, sessionID, force); err != nil {
			logger.WarnCF("paper", "Failed to sync paper session", map[string]any{
				"userId":    userID,
				"sessionId": sessionID,
				"error":     err.Error(),
			})
		}
	}()
}

func (pr *PaperRouter) StartScheduler() {
	if pr == nil {
		return
	}
	go func() {
		ticker := time.NewTicker(paperSchedulerInterval)
		defer ticker.Stop()
		pr.kickAllRunning()
		for range ticker.C {
			pr.kickAllRunning()
		}
	}()
}

func (pr *PaperRouter) kickAllRunning() {
	if userHomeLoader == nil {
		return
	}
	ids, err := userHomeLoader.ListUserIDs()
	if err != nil {
		return
	}
	for _, userID := range ids {
		sessions, err := listPaperSessions(userID)
		if err != nil {
			continue
		}
		for _, sess := range sessions {
			if sess.Status == paperStatusRunning || sess.Status == paperStatusFailed {
				pr.startSync(userID, sess.ID, false)
			}
		}
	}
}

func (pr *PaperRouter) kickUserRunning(userID string) {
	sessions, err := listPaperSessions(userID)
	if err != nil {
		return
	}
	for _, sess := range sessions {
		if sess.Status == paperStatusRunning || sess.Status == paperStatusFailed {
			pr.startSync(userID, sess.ID, false)
		}
	}
}

func (pr *PaperRouter) syncSession(ctx context.Context, userID, sessionID string, force bool) error {
	sess, err := loadPaperSession(userID, sessionID)
	if err != nil {
		return err
	}
	if sess.Status == paperStatusPaused && !force {
		return nil
	}
	source := loadPaperSource(userID, sessionID)
	if strings.TrimSpace(source) == "" {
		return pr.failSession(userID, sess, "策略快照缺失，请用当前代码重启")
	}

	latestBar, err := pr.latestMarketDate(ctx, sess)
	if err != nil {
		return pr.failSession(userID, sess, err.Error())
	}
	if latestBar == "" {
		return nil
	}
	_, hasLatest := loadPaperLatest(userID, sessionID)
	if !force && sess.LastBarDate != "" && sess.LastBarDate >= latestBar && hasLatest {
		if sess.Status == paperStatusCatchingUp || sess.Status == paperStatusFailed {
			sess.Status = paperStatusRunning
			sess.LastError = ""
			sess.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
			return savePaperSession(userID, sess)
		}
		return nil
	}

	if sess.Status != paperStatusPaused {
		sess.Status = paperStatusCatchingUp
		sess.LastError = ""
		sess.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
		if err := savePaperSession(userID, sess); err != nil {
			return err
		}
	}

	username := fquant.UsernameForUser(userID)
	fquantName := paperFquantStrategyName(sess)
	if _, err := pr.client.UpsertStrategy(ctx, username, fquantName, source); err != nil {
		return pr.failSession(userID, sess, err.Error())
	}
	run, err := pr.client.SubmitRun(ctx, username, fquant.SubmitRunRequest{
		StrategyName:    fquantName,
		InitialCash:     sess.InitialCash,
		StartTime:       sess.GoLive,
		EndTime:         latestBar,
		Paper:           true,
		Universe:        sess.Universe,
		Symbols:         sess.Symbols,
		Index:           sess.Index,
		CommissionRate:  sess.CommissionRate,
		MinCommission:   sess.MinCommission,
		StampTaxRate:    sess.StampTaxRate,
		TransferFeeRate: sess.TransferFeeRate,
		Slippage:        sess.Slippage,
		LotSize:         sess.LotSize,
	})
	if err != nil {
		return pr.failSession(userID, sess, err.Error())
	}

	raw, status, err := pr.pollPaperRun(ctx, username, run.ID)
	if err != nil {
		return pr.failSession(userID, sess, err.Error())
	}
	if !strings.EqualFold(status, "succeeded") {
		message := statusFromPaperError(raw)
		if message == "" {
			message = "fquant 运行失败"
		}
		return pr.failSession(userID, sess, message)
	}

	parsed, err := parseBacktestRun(raw)
	if err != nil {
		return pr.failSession(userID, sess, err.Error())
	}
	result := parsed.Result
	if result == nil {
		result = map[string]any{}
	}
	if blotter, err := pr.client.GetRunBlotter(ctx, username, run.ID); err == nil {
		var payload map[string]any
		if json.Unmarshal(blotter, &payload) == nil {
			if payload["trades"] != nil {
				result["trades"] = payload["trades"]
			}
			if payload["orders"] != nil {
				result["orders"] = payload["orders"]
			}
			if payload["rebalances"] != nil {
				result["rebalances"] = payload["rebalances"]
			}
			if payload["action_days"] != nil {
				result["action_days"] = payload["action_days"]
			}
		}
	}
	if positions, err := pr.client.GetRunPositions(ctx, username, run.ID, "", ""); err == nil {
		var payload map[string]any
		if json.Unmarshal(positions, &payload) == nil {
			if payload["items"] != nil {
				result["holdings"] = payload["items"]
				result["positions"] = payload["items"]
			}
		}
	}

	sliced := slicePaperResult(result, sess.GoLive, sess.InitialCash)
	if err := savePaperLatest(userID, sessionID, sliced); err != nil {
		return err
	}

	current, err := loadPaperSession(userID, sessionID)
	if err != nil {
		return err
	}
	current.LastBarDate = latestBar
	current.LastRunID = run.ID
	current.LastError = ""
	current.Equity, current.ReturnPct = lastPaperEquity(sliced, current.InitialCash)
	if current.Status != paperStatusPaused {
		current.Status = paperStatusRunning
	}
	current.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	return savePaperSession(userID, current)
}

func (pr *PaperRouter) latestMarketDate(ctx context.Context, sess paperSession) (string, error) {
	end := paperToday()
	start := strings.TrimSpace(sess.EngineStart)
	if start == "" {
		start = paperEngineStart(firstNonEmpty(sess.GoLive, end))
	}
	var codes, indexes []string
	switch sess.Universe {
	case "index":
		if strings.TrimSpace(sess.Index) != "" {
			indexes = []string{sess.Index}
		} else {
			indexes = []string{"000300"}
		}
	case "all":
		indexes = []string{"000300"}
	default:
		codes = sess.Symbols
		if len(codes) == 0 {
			indexes = []string{"000300"}
		}
	}
	out, err := pr.client.GetBars(ctx, codes, indexes, start, end)
	if err != nil {
		return "", err
	}
	times := make([]string, 0)
	for _, item := range out.Items {
		for _, point := range item.Series {
			if day := paperDayKey(point.Time); day != "" {
				times = append(times, day)
			}
		}
	}
	return latestBarDateFromSeries(times), nil
}

func (pr *PaperRouter) pollPaperRun(ctx context.Context, username, runID string) (json.RawMessage, string, error) {
	ticker := time.NewTicker(paperPollInterval)
	defer ticker.Stop()
	failures := 0
	for {
		raw, err := pr.client.GetRun(ctx, username, runID)
		if err != nil {
			if ctx.Err() != nil {
				return nil, "", ctx.Err()
			}
			failures++
			if failures >= 8 {
				return nil, "", err
			}
		} else {
			failures = 0
			status := statusFromBacktestRaw(raw)
			if isTerminalBacktestStatus(status) {
				return raw, status, nil
			}
		}
		select {
		case <-ctx.Done():
			return nil, "", ctx.Err()
		case <-ticker.C:
		}
	}
}

func (pr *PaperRouter) failSession(userID string, sess paperSession, message string) error {
	current, err := loadPaperSession(userID, sess.ID)
	if err != nil {
		current = sess
	}
	if current.Status != paperStatusPaused {
		current.Status = paperStatusFailed
	}
	current.LastError = strings.TrimSpace(message)
	current.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if err := savePaperSession(userID, current); err != nil {
		return err
	}
	return fmt.Errorf("%s", current.LastError)
}

func paperFquantStrategyName(sess paperSession) string {
	name := strings.TrimSpace(sess.StrategyName)
	if name == "" {
		name = "paper"
	}
	return name
}

func statusFromPaperError(raw json.RawMessage) string {
	run, err := parseBacktestRun(raw)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(run.ErrorMessage)
}
