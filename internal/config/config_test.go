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

func TestFinclawHomePath(t *testing.T) {
	home := FinclawHomePath()
	if home == "" {
		t.Errorf("FinclawHomePath() returned empty path")
	}
	t.Logf("home = %s", home)
}
