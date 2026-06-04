package config

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/finclaw/pkg/channels/finclaw"
	"github.com/pelletier/go-toml/v2"
)

var finclawConf *FinclawConfig

type FinclawConfig struct {
	*FinclawConfigServer
}

type FinclawConfigServer struct {
	ServerAddr          string                    `toml:"serverAddr"`
	RSSServerAddr       string                    `toml:"rssServerAddr"`
	AgentHubAddr       string                    `toml:"agentHubAddr"`
	FinClawChannelConf *finclaw.FinChannelConfig `toml:"finClawChannel"`
}

func (c *FinclawConfig) Save() error {
	configPath := finConfigPath()
	exists, err := pathExists(configPath)
	if err != nil {
		return err
	}
	if !exists {
		os.MkdirAll(filepath.Dir(configPath), 0755)
	}
	return tomlEncodeFile(configPath, c.FinclawConfigServer)
}

func init() {
	var err error
	finclawConf, err = LoadConfig()
	if err != nil {
		panic(err)
	}

	if err := finclawConf.Save(); err != nil {
		panic(err)
	}
}

func LoadConfig() (*FinclawConfig, error) {
	finConf, err := loadFinclawConfig()
	if err != nil {
		return nil, err
	}
	return &FinclawConfig{
		FinclawConfigServer: finConf,
	}, nil
}

func loadFinclawConfig() (finServerConf *FinclawConfigServer, err error) {
	exists, err := pathExists(finConfigPath())
	if err != nil {
		return nil, err
	}
	if !exists {
		return defaultFinclawConfig(), nil
	}

	finServerConf = new(FinclawConfigServer)
	err = tomlDecodeFile(finConfigPath(), finServerConf)

	return finServerConf, err
}

func FinConfigGet() *FinclawConfig {
	return finclawConf
}

func pathExists(path string) (bool, error) {
	_, err := os.Stat(path)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, fs.ErrNotExist) {
		return false, nil
	}
	return false, err // 其它错误（权限、路径无效等）
}

func tomlDecodeFile(path string, v interface{}) error {
	content, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return toml.Unmarshal(content, v)
}

func tomlEncodeFile(path string, v interface{}) error {
	content, err := toml.Marshal(v)
	if err != nil {
		return err
	}
	return os.WriteFile(path, content, 0644)
}
