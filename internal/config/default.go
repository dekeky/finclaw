package config

import (
	"os"
	"path/filepath"

	"github.com/finclaw/pkg/channels/finclaw"
)

const (
	FinclawHomeEnv     = "FINCLAW_HOME"
	PicoClawConfigFile = "picoclaw.json" // 相当于picoclaw config.json文件
	FinclawConfigFile  = "finclaw.toml"
	FinclawWorkspace   = "workspace"
	RssSourceFile      = "rss.config"
)

func FinClawHomePath() string {
	return filepath.Join(os.Getenv(FinclawHomeEnv), ".finclaw")
}

func finclawHomePath() string {
	var err error
	home := os.Getenv(FinclawHomeEnv)
	if home == "" {
		home, err = os.UserHomeDir()
		if err != nil {
			panic(err)
		}
		home = filepath.Join(home, ".finclaw")
	}
	return home
}

func picoConfigPath() string {
	return filepath.Join(finclawHomePath(), PicoClawConfigFile)
}

func finConfigPath() string {
	return filepath.Join(finclawHomePath(), FinclawConfigFile)
}

func finWorkspacePath() string {
	return filepath.Join(finclawHomePath(), FinclawWorkspace)
}

func RssConfigPath() string {
	return filepath.Join(finclawHomePath(), RssSourceFile)
}

func RssStoragePath() string {
	return filepath.Join(finWorkspacePath(), RssSourceFile)
}

func defaultFinclawConfig() *FinclawConfigServer {
	return &FinclawConfigServer{
		ServerAddr:    ":8082",
		RSSServerAddr: "http://159.75.51.78:6606",
		FinClawChannelConf: &finclaw.FinChannelConfig{
			ReadTimeout:  60,
			PingInterval: 30,
			MaxConn:      1000,
		},
	}
}
