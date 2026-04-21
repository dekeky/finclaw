package rss

import (
	"time"

	"github.com/dekeky/rssmanager/pkg/ginx"
	"github.com/dekeky/rssmanager/pkg/rsscli"
	"github.com/gin-gonic/gin"
)

type RssRouter struct {
	rc *rsscli.Client
	r  *gin.Engine
}

// NewRssRouter 复用外部传入的 *gin.Engine，避免创建孤儿 engine 导致路由注册在
// 一个没有被 Run 的实例上（症状：/rss/* 全部 404）。
func NewRssRouter(baseUrl string, r *gin.Engine) *RssRouter {
	return &RssRouter{rc: rsscli.New(baseUrl, 10*time.Second, "830948rfregjjdglu2u4u02939u453hj"), r: r}
}

func (rr *RssRouter) ConfigRouter() {
	rssGroup := rr.r.Group("/rss")
	rssGroup.GET("/index", rr.getIndex)
	rssGroup.GET("/:sourceName", rr.getRssDataBySourceName)
	rssGroup.GET("/:sourceName/:sector", rr.getSourceDataBySourceNameAndSector)
	rssGroup.DELETE("/:sourceName", rr.deleteRssDataBySourceName)
	rssGroup.DELETE("/:sourceName/:sector", rr.deleteRssDataBySourceNameAndSector)
}

func (rr *RssRouter) getIndex(c *gin.Context) {
	ginx.NewRender(c).Data(rr.rc.RssIndex(c.Request.Context()))
}

type getRssDataBySourceNameRequest struct {
	SourceName string `uri:"sourceName"`
}

func (rr *RssRouter) getRssDataBySourceName(c *gin.Context) {
	var req getRssDataBySourceNameRequest
	ginx.PanicIfNotNil(c.ShouldBindUri(&req))
	ginx.NewRender(c).Data(rr.rc.GetRssDataBySourceName(c.Request.Context(), req.SourceName))
}

type getRssDataBySourceNameAndSectorRequest struct {
	SourceName string `uri:"sourceName"`
	Sector     string `uri:"sector"`
}

func (rr *RssRouter) getSourceDataBySourceNameAndSector(c *gin.Context) {
	var req getRssDataBySourceNameAndSectorRequest
	ginx.PanicIfNotNil(c.ShouldBindUri(&req))
	ginx.NewRender(c).Data(rr.rc.GetRssDataBySourceNameAndSector(c.Request.Context(), req.SourceName, req.Sector))
}

type deleteRssDataBySourceNameRequest struct {
	SourceName string `uri:"sourceName"`
}

func (rr *RssRouter) deleteRssDataBySourceName(c *gin.Context) {
	var req deleteRssDataBySourceNameRequest
	ginx.PanicIfNotNil(c.ShouldBindUri(&req))
	ginx.NewRender(c).Data(rr.rc.BatchDeleteTaskAndData(c.Request.Context(), req.SourceName))
}

type deleteRssDataBySourceNameAndSectorRequest struct {
	SourceName string `uri:"sourceName"`
	Sector     string `uri:"sector"`
}

func (rr *RssRouter) deleteRssDataBySourceNameAndSector(c *gin.Context) {
	var req deleteRssDataBySourceNameAndSectorRequest
	ginx.PanicIfNotNil(c.ShouldBindUri(&req))
	ginx.NewRender(c).Data(rr.rc.DeleteTaskAndData(c.Request.Context(), req.SourceName, req.Sector))
}
