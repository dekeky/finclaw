package router

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (frouter *FinClawRouter) handleWebSocket(c *gin.Context) {
	agentName := c.Param("agentName")
	if agentName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "agentName is required"})
		return
	}

	channel, ok := frouter.agentManager.GetFinClawChannel(agentName)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "agent not found: " + agentName})
		return
	}

	channel.HandleWebSocket(c.Writer, c.Request)
}
