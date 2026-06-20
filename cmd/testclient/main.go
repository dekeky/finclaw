//go:build ignore
// +build ignore

// Finclaw WebSocket Test Client
// Usage: go run cmd/testclient/main.go [server_addr] [agent_name]
// Example: go run cmd/testclient/main.go localhost:8082 选股大师
//
// Connect to the Finclaw WebSocket server and display raw message streams.
// Supports sending messages and observing the complete response flow.
// Features:
// - Auto-captures session_id from "connected" message
// - Pretty prints all server responses with type labels
// - Send messages by typing and pressing Enter
// - Type "quit" or "exit" to disconnect

package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

var (
	serverAddr = "localhost:8082"
	dialer     = websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}
)

type RawMessage struct {
	Type      string          `json:"type"`
	ID        string          `json:"id,omitempty"`
	SessionID string          `json:"session_id,omitempty"`
	Payload   json.RawMessage `json:"payload,omitempty"`
}

var sessionID string

func main() {
	if len(os.Args) > 1 {
		serverAddr = os.Args[1]
	}
	agentName := "选股大师"
	if len(os.Args) > 2 {
		agentName = os.Args[2]
	}

	// sessionId 现由客户端生成并携带（服务端不再兜底生成）。
	sessionID = fmt.Sprintf("testclient-%d", time.Now().UnixNano())
	u := url.URL{
		Scheme:   "ws",
		Host:     serverAddr,
		Path:     "/ws/chat/" + agentName,
		RawQuery: "sessionId=" + url.QueryEscape(sessionID),
	}
	fmt.Printf("=== Finclaw WebSocket Test Client ===\n")
	fmt.Printf("Server: %s\n", u.String())
	fmt.Printf("Usage: go run main.go [server_addr] [agent_name]\n")
	fmt.Printf("Available agents: 选股大师, 伯克希尔金融集团\n")
	fmt.Printf("Press Ctrl+C to exit\n\n")

	conn, _, err := dialer.Dial(u.String(), nil)
	if err != nil {
		log.Fatalf("Dial failed: %v", err)
	}
	defer conn.Close()

	fmt.Println("Waiting for connection to establish...")
	time.Sleep(500 * time.Millisecond)

	// Reader goroutine
	go readLoop(conn)

	// Read input and send messages
	readInput(conn)
}

func readLoop(conn *websocket.Conn) {
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			if strings.Contains(err.Error(), "close") || strings.Contains(err.Error(), "use of closed") {
				return
			}
			log.Printf("Read error: %v", err)
			return
		}

		// Try to parse and pretty print
		var raw RawMessage
		if err := json.Unmarshal(msg, &raw); err != nil {
			fmt.Printf("\n=== RAW ===\n%s\n\n", string(msg))
			continue
		}

		// Capture session_id from connected message
		if raw.Type == "connected" && raw.SessionID != "" {
			sessionID = raw.SessionID
			fmt.Printf("\n=== Session ID captured: %s ===\n\n", sessionID)
		}

		fmt.Printf("\n=== %s ===\n", raw.Type)

		// Pretty print payload if exists
		if len(raw.Payload) > 0 {
			var pretty any
			if err := json.Unmarshal(raw.Payload, &pretty); err == nil {
				p, _ := json.MarshalIndent(pretty, "", "  ")
				fmt.Printf("%s\n", p)
			} else {
				fmt.Printf("%s\n", string(raw.Payload))
			}
		}

		// Print metadata
		if raw.ID != "" {
			fmt.Printf("ID: %s\n", raw.ID)
		}
		if raw.SessionID != "" {
			fmt.Printf("SessionID: %s\n", raw.SessionID)
		}

		fmt.Print("\n> ")
	}
}

// sendMessage sends a chat message to the server
func sendMessage(conn *websocket.Conn, content string) error {
	id := fmt.Sprintf("msg-%d", time.Now().UnixNano())
	msg := map[string]any{
		"type": "message.send",
		"id":   id,
		"payload": map[string]any{
			"content": content,
		},
	}
	// Include session_id if we have it
	if sessionID != "" {
		msg["session_id"] = sessionID
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	return conn.WriteMessage(websocket.TextMessage, data)
}

func readInput(conn *websocket.Conn) {
	scanner := bufio.NewScanner(os.Stdin)
	fmt.Print("> ")

	for scanner.Scan() {
		text := strings.TrimSpace(scanner.Text())
		if text == "" {
			fmt.Print("> ")
			continue
		}

		if strings.ToLower(text) == "quit" || strings.ToLower(text) == "exit" {
			break
		}

		if err := sendMessage(conn, text); err != nil {
			log.Printf("Send error: %v", err)
		}

		fmt.Print("> ")
	}
}
