package agentruntime

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"time"

	"github.com/finclaw/pkg/agent/fquant"
	"github.com/sipeed/picoclaw/pkg/logger"
)

var (
	backtestPersistPollInterval = 5 * time.Second
	backtestPersistTimeout      = 2 * time.Hour
)

var persistLoops sync.Map

func (br *BacktestRouter) persistRunQuietly(userID string, raw json.RawMessage) {
	if br == nil || strings.TrimSpace(userID) == "" || len(raw) == 0 {
		return
	}
	if err := persistBacktestRun(userID, raw); err != nil {
		logger.WarnCF("backtest", "Failed to persist backtest run locally", map[string]any{
			"userId": userID,
			"error":  err.Error(),
		})
	}
}

func copyRawJSON(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 {
		return nil
	}
	return append(json.RawMessage(nil), raw...)
}

func (br *BacktestRouter) persistRunInBackground(userID string, raw json.RawMessage) {
	copied := copyRawJSON(raw)
	go br.persistRunQuietly(userID, copied)
}

func (br *BacktestRouter) persistBlotterInBackground(userID, runID string, raw json.RawMessage) {
	copied := copyRawJSON(raw)
	go br.persistBlotterQuietly(userID, runID, copied)
}

func (br *BacktestRouter) persistPositionsInBackground(userID, runID string, raw json.RawMessage) {
	copied := copyRawJSON(raw)
	go br.persistPositionsQuietly(userID, runID, copied)
}

func (br *BacktestRouter) persistSubmitQuietly(userID, runID, status, strategyName, source string, req submitBacktestRequest) {
	if err := persistSubmittedBacktest(userID, runID, status, strategyName, source, req); err != nil {
		logger.WarnCF("backtest", "Failed to persist submitted backtest locally", map[string]any{
			"userId": userID,
			"runId":  runID,
			"error":  err.Error(),
		})
	}
}

func (br *BacktestRouter) persistBlotterQuietly(userID, runID string, raw json.RawMessage) {
	if err := persistBacktestBlotter(userID, runID, raw); err != nil {
		logger.WarnCF("backtest", "Failed to persist backtest blotter locally", map[string]any{
			"userId": userID,
			"runId":  runID,
			"error":  err.Error(),
		})
	}
}

func (br *BacktestRouter) persistBlotterFillsInBackground(userID, runID string, raw json.RawMessage) {
	copied := copyRawJSON(raw)
	go func() {
		if err := persistBacktestBlotterFills(userID, runID, copied); err != nil {
			logger.WarnCF("backtest", "Failed to persist backtest blotter fills locally", map[string]any{
				"userId": userID,
				"runId":  runID,
				"error":  err.Error(),
			})
		}
	}()
}

func (br *BacktestRouter) persistPositionsQuietly(userID, runID string, raw json.RawMessage) {
	if err := persistBacktestPositions(userID, runID, raw); err != nil {
		logger.WarnCF("backtest", "Failed to persist backtest positions locally", map[string]any{
			"userId": userID,
			"runId":  runID,
			"error":  err.Error(),
		})
	}
}

func (br *BacktestRouter) persistRenameQuietly(userID, runID, name string) {
	if err := persistBacktestRename(userID, runID, name); err != nil {
		logger.WarnCF("backtest", "Failed to persist backtest rename locally", map[string]any{
			"userId": userID,
			"runId":  runID,
			"error":  err.Error(),
		})
	}
}

func (br *BacktestRouter) removePersistedQuietly(userID, runID string) {
	if err := removePersistedBacktest(userID, runID); err != nil {
		logger.WarnCF("backtest", "Failed to remove local backtest files", map[string]any{
			"userId": userID,
			"runId":  runID,
			"error":  err.Error(),
		})
	}
}

func (br *BacktestRouter) startPersistLoop(userID, runID string) {
	if br == nil || strings.TrimSpace(userID) == "" || strings.TrimSpace(runID) == "" {
		return
	}
	key := userID + "/" + runID
	if _, loaded := persistLoops.LoadOrStore(key, true); loaded {
		return
	}
	go func() {
		defer persistLoops.Delete(key)
		ctx, cancel := context.WithTimeout(context.Background(), backtestPersistTimeout)
		defer cancel()
		br.pollAndPersistRun(ctx, userID, runID)
	}()
}

func (br *BacktestRouter) pollAndPersistRun(ctx context.Context, userID, runID string) {
	username := fquant.UsernameForUser(userID)
	ticker := time.NewTicker(backtestPersistPollInterval)
	defer ticker.Stop()
	failures := 0

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
		raw, err := br.client.GetRun(ctx, username, runID)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			failures++
			if failures >= 5 {
				return
			}
			continue
		}
		failures = 0
		if isTerminalBacktestStatus(statusFromBacktestRaw(raw)) {
			br.persistRunQuietly(userID, raw)
			return
		}
	}
}
