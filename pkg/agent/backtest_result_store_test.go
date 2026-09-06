package agentruntime

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestPersistBacktestRunWritesLocalFiles(t *testing.T) {
	t.Setenv("FINCLAW_HOME", t.TempDir())
	userID := "u_store"
	raw := json.RawMessage(`{
		"id":"run-1",
		"name":"早盘回测",
		"status":"succeeded",
		"strategy_name":"dual_ma",
		"updated_at":"2026-09-05T01:00:00Z",
		"request":{"strategy_name":"dual_ma","start_time":"2020-01-01","end_time":"2021-01-01","initial_cash":100000,"universe":"picks","symbols":["600000"]},
		"result":{"metrics":{"total_return_pct":0.12,"sharpe_ratio":1.4,"trade_count":8},"trades":[{},{}]},
		"source":"class S(Strategy):\n    pass\n"
	}`)
	if err := persistBacktestRun(userID, raw); err != nil {
		t.Fatal(err)
	}

	dir := filepath.Join(AccountBacktestsRootForUser(userID), "dual_ma", "早盘回测")
	for _, name := range []string{"summary.md", "result.json", "request.json", "source.py", "meta.json"} {
		if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
			t.Fatalf("%s: %v", name, err)
		}
	}
	summary, err := os.ReadFile(filepath.Join(dir, "summary.md"))
	if err != nil {
		t.Fatal(err)
	}
	text := string(summary)
	for _, want := range []string{"dual_ma", "早盘回测", "succeeded", "累计收益率", "0.12"} {
		if !strings.Contains(text, want) {
			t.Fatalf("summary missing %q:\n%s", want, text)
		}
	}
	if strings.Contains(text, "运行 ID") {
		t.Fatalf("summary should not mention 运行 ID:\n%s", text)
	}

	if err := persistBacktestBlotter(userID, "run-1", json.RawMessage(`{"orders":[{"symbol":"600000","created_at":"2020-01-02","updated_at":"2020-01-03","status":"filled","filled_quantity":100},{"symbol":"000001","created_at":"2020-02-03","status":"rejected","reject_reason":"cash"}],"rebalances":[{"time":"2020-01-02","method":"order_target_percent","status":"submitted","targets":{"600000":0.95}},{"time":"2020-02-03","method":"order_target_percent","status":"submitted","targets":{"000001":0.95}}],"rejects":[{"symbol":"000001"}],"trades":[{"symbol":"600000"}]}`)); err != nil {
		t.Fatal(err)
	}
	if data, err := os.ReadFile(filepath.Join(dir, "blotter.json")); err != nil || !strings.Contains(string(data), "000001") {
		t.Fatalf("blotter = %s err=%v", data, err)
	}
	fills, err := os.ReadFile(filepath.Join(dir, "blotter-fills.json"))
	if err != nil {
		t.Fatalf("blotter-fills.json: %v", err)
	}
	if !strings.Contains(string(fills), "600000") || strings.Contains(string(fills), "000001") {
		t.Fatalf("fills should keep filled only: %s", fills)
	}
	if !strings.Contains(string(fills), "2020-01-03") {
		t.Fatalf("fills missing action day: %s", fills)
	}

	if err := persistBacktestRename(userID, "run-1", "改名后的回测"); err != nil {
		t.Fatal(err)
	}
	renamed := filepath.Join(AccountBacktestsRootForUser(userID), "dual_ma", "改名后的回测")
	summary, err = os.ReadFile(filepath.Join(renamed, "summary.md"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(summary), "改名后的回测") {
		t.Fatalf("rename not applied: %s", summary)
	}
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Fatalf("old named dir still exists")
	}

	if err := removePersistedBacktest(userID, "run-1"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(renamed); !os.IsNotExist(err) {
		t.Fatalf("run dir still exists: %v", err)
	}
}

func TestPersistSubmittedBacktestWritesStub(t *testing.T) {
	t.Setenv("FINCLAW_HOME", t.TempDir())
	err := persistSubmittedBacktest("u_store", "abc123", "queued", "dual_ma", "class S(Strategy):\n    pass\n", submitBacktestRequest{
		StrategyName: "dual_ma",
		InitialCash:  50000,
		StartTime:    "2021-01-01",
		EndTime:      "2022-01-01",
		Universe:     "picks",
		Symbols:      []string{"600000"},
	})
	if err != nil {
		t.Fatal(err)
	}
	entry, ok := lookupBacktestIndex("u_store", "abc123")
	if !ok {
		t.Fatal("submitted run not indexed")
	}
	if !defaultBacktestNamePattern.MatchString(entry.Name) {
		t.Fatalf("default run name = %q", entry.Name)
	}
	dir := filepath.Join(AccountBacktestsRootForUser("u_store"), filepath.FromSlash(entry.Dir))
	if filepath.Base(dir) != entry.Name {
		t.Fatalf("folder %q does not match name %q", dir, entry.Name)
	}
	summary, err := os.ReadFile(filepath.Join(dir, "summary.md"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(summary), "queued") || !strings.Contains(string(summary), "回测名称："+entry.Name) {
		t.Fatalf("stub summary = %s", summary)
	}
}

func TestDefaultBacktestRunName(t *testing.T) {
	when := time.Date(2026, 8, 7, 18, 1, 9, 0, time.Local)
	if got := defaultBacktestRunName("dual_ma", when); got != "dual_ma_20260807_1801" {
		t.Fatalf("got %q", got)
	}
	if got := defaultBacktestRunName("  ", when); got != "run_20260807_1801" {
		t.Fatalf("empty strategy got %q", got)
	}
}

func TestPersistLiveRunDropsSourceAndResult(t *testing.T) {
	t.Setenv("FINCLAW_HOME", t.TempDir())
	raw := json.RawMessage(`{
		"id":"run-live",
		"status":"running",
		"strategy_name":"dual_ma",
		"updated_at":"2026-09-05T01:00:00Z",
		"live_equity":[{"time":"2020-01-02","equity":100100}],
		"source":"class S(Strategy): pass",
		"result":{"metrics":{"trade_count":1}}
	}`)
	if err := persistBacktestRun("u_store", raw); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(localRunDir(t, "u_store", "run-live"), "result.json"))
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)
	if strings.Contains(text, "class S") || strings.Contains(text, "trade_count") {
		t.Fatalf("live snapshot should drop source/result: %s", text)
	}
	if !strings.Contains(text, "live_equity") || !strings.Contains(text, "100100") {
		t.Fatalf("live snapshot missing equity: %s", text)
	}
}

func TestSafeBacktestPathSegmentRejectsTraversal(t *testing.T) {
	if _, err := safeBacktestPathSegment("../etc"); err == nil {
		t.Fatal("expected error")
	}
	if _, err := safeBacktestPathSegment("a/b"); err == nil {
		t.Fatal("expected error")
	}
	if got, err := safeBacktestPathSegment("双均线策略"); err != nil || got != "双均线策略" {
		t.Fatalf("got %q err=%v", got, err)
	}
}
