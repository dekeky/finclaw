package config

import (
	"os"
	"path/filepath"

	"github.com/finclaw/pkg/channels/finclaw"
)

const (
	FinclawHomeEnv    = "FINCLAW_HOME"
	FinclawConfigFile = "finclaw.toml"
	FinclawWorkspace  = "workspace"
	RssSourceFile     = "rss.config"
)

func FinclawHomePath() string {
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

func finConfigPath() string {
	return filepath.Join(FinclawHomePath(), FinclawConfigFile)
}

// FinWorkspacePath is the FinClaw sandbox directory (skills, RSS cache, Picoclaw tools, etc.).
func FinWorkspacePath() string {
	return filepath.Join(FinclawHomePath(), FinclawWorkspace)
}

func RssConfigPath() string {
	return filepath.Join(FinclawHomePath(), RssSourceFile)
}

func RssStoragePath() string {
	return filepath.Join(FinWorkspacePath(), RssSourceFile)
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
