package config

import "testing"

func TestConfLoad(t *testing.T) {
	conf := FinConfigGet()
	if conf == nil {
		t.Fatalf("FinConfigGet() = nil")
	}
	t.Logf("conf = %+v", conf)
	t.Logf("serverAddr=%s rssServerAddr=%s agentHubAddr=%s", conf.ServerAddr, conf.RSSServerAddr, conf.AgentHubAddr)
}

func TestEnsureDefaultFquant(t *testing.T) {
	empty := &FinclawConfigServer{}
	ensureDefaultFquant(empty)
	if empty.FquantAddr != DefaultFquantAddr {
		t.Fatalf("empty addr = %q, want %q", empty.FquantAddr, DefaultFquantAddr)
	}

	legacy := &FinclawConfigServer{FquantAddr: "http://127.0.0.1:8000"}
	ensureDefaultFquant(legacy)
	if legacy.FquantAddr != DefaultFquantAddr {
		t.Fatalf("legacy addr = %q, want %q", legacy.FquantAddr, DefaultFquantAddr)
	}

	custom := &FinclawConfigServer{FquantAddr: "http://127.0.0.1:9000"}
	ensureDefaultFquant(custom)
	if custom.FquantAddr != "http://127.0.0.1:9000" {
		t.Fatalf("custom addr overwritten: %q", custom.FquantAddr)
	}
}

func TestFinclawHomePath(t *testing.T) {
	home := FinclawHomePath()
	if home == "" {
		t.Errorf("FinclawHomePath() returned empty path")
	}
	t.Logf("home = %s", home)
}
