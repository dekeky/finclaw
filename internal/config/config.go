package config

import (
	"os"
	"path/filepath"

	"github.com/finclaw/pkg/channels/finclaw"
	"github.com/sipeed/picoclaw/pkg/config"
)

type FinclawConfig struct {
	*config.Config
	ServerAddr      string                    `json:"server_addr"`
	FincChannelConf *finclaw.FinChannelConfig `json:"finclaw_channel"`
}

var finclawConf *FinclawConfig

func init() {
	var err error
	finclawConf = &FinclawConfig{
		Config: config.DefaultConfig(),
	}
	finclawConf.Config, err = config.LoadConfig(configPathGet())
	if err != nil {
		panic(err)
	}

	finclawConf.ServerAddr = ":8082"
	finclawConf.FincChannelConf = new(finclaw.FinChannelConfig)
}

func configPathGet() string {
	workspace := os.Getenv("WORKSPACE")
	if workspace == "" {
		home, _ := os.UserHomeDir()
		workspace = home + "/.finclaw"
	}
	return filepath.Join(workspace, "config.json")
}

func FinConfigGet() *FinclawConfig {
	return finclawConf
}
