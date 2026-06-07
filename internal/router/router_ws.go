package router

import (
	"net/http"

	"github.com/finclaw/internal/auth"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func (frouter *FinClawRouter) handleWebSocket(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		// For missing token, we must close immediately without upgrade
		// Client will see onerror without any message
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "token query parameter is required"})
		return
	}

	claims, err := auth.ParseToken(token)
	if err != nil {
		// Upgrade first so we can send error over WebSocket
		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			// Even upgrade failed, abort
			c.Abort()
			return
		}
		// Send error message before closing so client gets the actual error
		errMsg := map[string]interface{}{"type": "error", "payload": map[string]string{"message": "invalid or expired token"}}
		conn.WriteJSON(errMsg)
		conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "invalid or expired token"))
		conn.Close()
		c.Abort()
		return
	}

	user, err := frouter.authStore.GetUserByID(claims.UserID)
	if err != nil || user == nil {
		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			c.Abort()
			return
		}
		errMsg := map[string]interface{}{"type": "error", "payload": map[string]string{"message": "user not found"}}
		conn.WriteJSON(errMsg)
		conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "user not found"))
		conn.Close()
		c.Abort()
		return
	}

	agentName := c.Param("agentName")
	if agentName == "" {
		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			c.Abort()
			return
		}
		errMsg := map[string]interface{}{"type": "error", "payload": map[string]string{"message": "agentName is required"}}
		conn.WriteJSON(errMsg)
		conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "agentName is required"))
		conn.Close()
		c.Abort()
		return
	}

	internalKey := user.ID + ":" + agentName
	channel, ok := frouter.agentManager.GetFinClawChannel(internalKey)
	if !ok {
		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			c.Abort()
			return
		}
		errMsg := map[string]interface{}{"type": "error", "payload": map[string]string{"message": "agent not found: " + agentName}}
		conn.WriteJSON(errMsg)
		conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "agent not found"))
		conn.Close()
		c.Abort()
		return
	}

	channel.HandleWebSocket(c.Writer, c.Request)
}
