package config

import "testing"

func TestConfLoad(t *testing.T) {
	conf := FinConfigGet()
	if conf == nil {
		t.Errorf("FinConfigGet() = %v", conf)
	}
	t.Logf("conf = %+v", conf)
	t.Logf("modelConf: %+v", conf.Agents.Defaults)
}
