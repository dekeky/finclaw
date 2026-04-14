package config

import (
	"errors"
	"io/fs"
	"os"

	"github.com/finclaw/pkg/channels/finclaw"
	"github.com/pelletier/go-toml/v2"
	picoclawconfig "github.com/sipeed/picoclaw/pkg/config"
)

const (
	CurrentVersion = picoclawconfig.CurrentVersion
)

var finclawConf *FinclawConfig

type FinclawConfig struct {
	*picoclawconfig.Config
	*FinclawConfigServer
}

type FinclawConfigServer struct {
	ServerAddr         string                    `toml:"serverAddr"`
	FinClawChannelConf *finclaw.FinChannelConfig `toml:"finClawChannel"`
}

func (c *FinclawConfig) Save() error {
	if err := picoclawconfig.SaveConfig(picoConfigPath(), c.Config); err != nil {
		return err
	}

	if err := tomlEncodeFile(finConfigPath(), c.FinclawConfigServer); err != nil {
		return err
	}
	return nil
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
	// 先判断picoclaw配置文件是否存在，确保加载的时候，不会因为配置文件不存在而使用picoclaw内部的默认配置，导致picoclaw的workspace路径不正确
	exists, err := pathExists(picoConfigPath())
	if err != nil {
		return nil, err
	}
	if !exists {
		return defaultConfig(), nil
	}
	picoConf, err := picoclawconfig.LoadConfig(picoConfigPath())
	if err != nil {
		return nil, err
	}
	finConf, err := loadFinclawConfig()
	if err != nil {
		return nil, err
	}
	return &FinclawConfig{
		Config:              picoConf,
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
