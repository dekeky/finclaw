package rss

import (
	"context"
	"time"

	"github.com/dekeky/rssmanager"
	"github.com/finclaw/internal/config"
)

const (
	rssConfigPath = "../../rssconfig.json"
)

func init() {
	ctx, _ := context.WithCancel(context.Background())
	corn := rssmanager.NewCorn(ctx, rssmanager.NewRssManager(config.RssConfigPath()), 1*time.Minute)
	corn.Start()
}
