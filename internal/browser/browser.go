package browser

import (
	"fmt"
	"net"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

// OpenURL opens url in the system default browser.
func OpenURL(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	return cmd.Start()
}

// ShouldOpen reports whether startup should launch the default browser.
func ShouldOpen() bool {
	if os.Getenv("FINCLAW_NO_BROWSER") != "" {
		return false
	}
	if os.Getenv("CI") != "" {
		return false
	}
	return true
}

// LocalURL converts a listen address (e.g. ":8082", "127.0.0.1:8082") to a browser URL.
func LocalURL(listenAddr string) string {
	host, port, err := net.SplitHostPort(listenAddr)
	if err != nil {
		return "http://127.0.0.1" + listenAddr
	}
	switch {
	case host == "", host == "0.0.0.0", host == "::", host == "[::]":
		host = "127.0.0.1"
	case strings.HasPrefix(host, "[") && strings.HasSuffix(host, "]"):
		host = "127.0.0.1"
	}
	return fmt.Sprintf("http://%s:%s", host, port)
}
