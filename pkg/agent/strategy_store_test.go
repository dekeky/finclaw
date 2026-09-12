package agentruntime

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestCreateStrategyAssignsStableID(t *testing.T) {
	t.Setenv("FINCLAW_HOME", t.TempDir())
	store := NewStrategyStore("u_id")
	created, err := store.Create("dual_ma", StrategyPlatformFinClaw, "print(1)\n", "")
	if err != nil {
		t.Fatal(err)
	}
	if created.ID == "" {
		t.Fatal("created strategy missing id")
	}
	got, err := store.Get("dual_ma")
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != created.ID {
		t.Fatalf("get id %q != create id %q", got.ID, created.ID)
	}
}

func TestRenameStrategyKeepsID(t *testing.T) {
	t.Setenv("FINCLAW_HOME", t.TempDir())
	store := NewStrategyStore("u_id")
	created, err := store.Create("dual_ma", StrategyPlatformFinClaw, "print(1)\n", "")
	if err != nil {
		t.Fatal(err)
	}
	renamed, err := store.Update("dual_ma", "dual_ma_v2", StrategyPlatformFinClaw, "print(2)\n")
	if err != nil {
		t.Fatal(err)
	}
	if renamed.Name != "dual_ma_v2" {
		t.Fatalf("name = %q", renamed.Name)
	}
	if renamed.ID != created.ID {
		t.Fatalf("rename changed id: %q -> %q", created.ID, renamed.ID)
	}
	if _, err := store.Get("dual_ma"); err == nil {
		t.Fatal("old name should be gone")
	}
	got, err := store.Get("dual_ma_v2")
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != created.ID {
		t.Fatalf("get after rename id %q != %q", got.ID, created.ID)
	}
}

func TestListAssignsMissingStrategyIDs(t *testing.T) {
	t.Setenv("FINCLAW_HOME", t.TempDir())
	store := NewStrategyStore("u_id")
	if err := os.MkdirAll(store.root, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(store.root, "legacy.py"), []byte("print(1)\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	legacy, err := json.MarshalIndent(strategyIndexFile{
		Entries: map[string]strategyIndexEntry{
			"legacy": {Platform: StrategyPlatformFinClaw},
		},
	}, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(store.indexPath(), legacy, 0o600); err != nil {
		t.Fatal(err)
	}

	listed, err := store.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(listed) != 1 || listed[0].Name != "legacy" || listed[0].ID == "" {
		t.Fatalf("listed = %#v", listed)
	}
	got, err := store.Get("legacy")
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != listed[0].ID {
		t.Fatalf("persisted id %q != listed id %q", got.ID, listed[0].ID)
	}
}
