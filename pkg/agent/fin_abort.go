package agentruntime

import (
	"fmt"
	"strings"

	picoagent "github.com/sipeed/picoclaw/pkg/agent"
	"github.com/sipeed/picoclaw/pkg/routing"
)

const finChannelName = "fin"

// AbortFinSession cancels the in-flight agent turn for a Finclaw WebSocket session.
func AbortFinSession(loop *picoagent.AgentLoop, sessionID string) error {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return fmt.Errorf("session id is required")
	}

	route := loop.GetRegistry().ResolveRoute(routing.RouteInput{
		Channel: finChannelName,
		Peer: &routing.RoutePeer{
			Kind: "direct",
			ID:   finChannelName + ":" + sessionID,
		},
	})
	return loop.HardAbort(route.SessionKey)
}
