package agentruntime

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	picoclawconfig "github.com/sipeed/picoclaw/pkg/config"
)

func TestProbeViaModelsList_Found(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/models" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"id":"deepseek-chat"}]}`))
	}))
	defer srv.Close()

	ok, msg := probeViaModelsList(context.Background(), srv.URL, "deepseek-chat", "sk-test")
	if !ok {
		t.Fatalf("want ok, got false")
	}
	if !strings.Contains(msg, "模型列表") {
		t.Fatalf("unexpected message: %q", msg)
	}
}

func TestProbeModelConfig_MissingAPIKey(t *testing.T) {
	mc := &picoclawconfig.ModelConfig{
		ModelName: "m",
		Model:     "deepseek/deepseek-chat",
		APIBase:   "https://api.deepseek.com/v1",
	}
	res := ProbeModelConfig(context.Background(), mc)
	if res.Ok {
		t.Fatal("expected failure without api key")
	}
	if !strings.Contains(res.Message, "API Key") {
		t.Fatalf("message = %q", res.Message)
	}
}
