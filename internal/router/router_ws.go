package router

import (
	"github.com/gin-gonic/gin"
)

func (frouter *FinClawRouter) handleWebSocket(c *gin.Context) {
	frouter.fchannel.HandleWebSocket(c.Writer, c.Request)
}
