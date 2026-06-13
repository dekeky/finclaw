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

// SecureString wraps a sensitive string value
type SecureString struct {
	value string
}

func (s *SecureString) String() string {
	return s.value
}

func NewSecureString(value string) *SecureString {
	return &SecureString{value: value}
}

// WeixinSettings 微信配置
type WeixinSettings struct {
	Token      string `toml:"token" json:"token"`
	AccountID  string `toml:"account_id" json:"account_id"`
	BaseURL    string `toml:"base_url" json:"base_url"`
	CDNBaseURL string `toml:"cdn_base_url" json:"cdn_base_url"`
	Proxy      string `toml:"proxy" json:"proxy"`
}

// GetToken returns token as SecureString
func (c *WeixinSettings) GetToken() SecureString {
	return SecureString{value: c.Token}
}

func (c *WeixinSettings) SetToken(token string) {
	c.Token = token
}

type FinclawConfig struct {
	*FinclawConfigServer
}

const (
	ChannelWeixin = "weixin"
)

// ChannelConfig 渠道配置（用于工厂模式）
type ChannelConfig struct {
	ChannelName        string   `toml:"channel_name"`
	Enabled           bool   `toml:"enabled"`
	AllowFrom         []string `toml:"allow_from"`
	ReasoningChannelID string   `toml:"reasoning_channel_id"`
	Weixin            *WeixinSettings `toml:"weixin"`
}

// GetChannelName 返回渠道名称
func (c *ChannelConfig) GetChannelName() string {
	return c.ChannelName
}

// GetDecoded 返回解码后的配置
func (c *ChannelConfig) GetDecoded() (any, error) {
	if c.Weixin != nil {
		return c.Weixin, nil
	}
	return nil, errors.New("channel config has no extended settings")
}

// Channel 渠道配置接口（用于工厂模式）
type Channel interface {
	Name() string
	GetDecoded() (any, error)
}

// SMTPSettings configures outbound email for verification codes.
type SMTPSettings struct {
	Host     string `toml:"host" json:"host"`         // SMTP 服务器，如 smtp.qq.com、smtp.163.com
	Port     int    `toml:"port" json:"port"`         // 端口，SSL 常用 465，TLS 常用 587
	Username string `toml:"username" json:"username"` // 发信邮箱地址，通常与登录账号相同
	Password string `toml:"password" json:"password"` // 邮箱授权码，非登录密码
	From     string `toml:"from" json:"from"`         // 发件人显示，如 "Finclaw <your@email.com>"
}

func (s *SMTPSettings) Enabled() bool {
	return s != nil && s.Host != "" && s.Port > 0 && s.Username != ""
}

type FinclawConfigServer struct {
	ServerAddr          string                    `toml:"serverAddr"`
	RSSServerAddr       string                    `toml:"rssServerAddr"`
	AgentHubAddr       string                    `toml:"agentHubAddr"`
	SMTP               *SMTPSettings             `toml:"smtp"`
	FinClawChannelConf *finclaw.FinChannelConfig `toml:"finClawChannel"`
	Channels           map[string]*ChannelConfig `toml:"channels"`
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
	// Encode the entire FinclawConfig including channels
	return tomlEncodeFile(configPath, c)
}

func init() {
	var err error
	finclawConf, err = LoadConfig()
	if err != nil {
		panic(err)
	}

	// Only save if file doesn't exist
	configPath := finConfigPath()
	exists, _ := pathExists(configPath)
	if !exists {
		if err := finclawConf.Save(); err != nil {
			panic(err)
		}
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
	if err != nil {
		return nil, err
	}
	ensureDefaultChannels(finServerConf)
	if ensureDefaultSMTP(finServerConf) {
		if err := appendSMTPSectionIfMissing(); err != nil {
			return nil, err
		}
	}

	return finServerConf, nil
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