package agentruntime

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestCreateStrategyFetchesTemplateFromFquant(t *testing.T) {
	t.Setenv("FINCLAW_HOME", t.TempDir())
	const templateSource = "from akquant import Strategy\nclass Tpl(Strategy):\n    pass\n"

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/strategy-template" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"name":"dual_ma","source":` + strconv.Quote(templateSource) + `}`))
	}))
	defer srv.Close()

	rec := doCreateStrategy(t, srv.URL, createStrategyRequest{Name: "ma_dual"})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte("class Tpl(Strategy)")) {
		t.Fatalf("created strategy did not use fquant template, body = %s", rec.Body.String())
	}
}

func TestCreateStrategyFallsBackToBuiltinWhenFquantDown(t *testing.T) {
	t.Setenv("FINCLAW_HOME", t.TempDir())
	// Port 9 (discard) refuses connections quickly, so create must not fail.
	rec := doCreateStrategy(t, "http://127.0.0.1:9", createStrategyRequest{Name: "ma_dual"})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "class DualMAStrategy") {
		t.Fatalf("fallback default strategy missing built-in template, body = %s", rec.Body.String())
	}
}

func doCreateStrategy(t *testing.T, fquantAddr string, payload createStrategyRequest) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(func(c *gin.Context) {
		c.Set("userId", "u_test")
		c.Next()
	})
	NewStrategyRouter(engine, func(c *gin.Context) { c.Next() }, fquantAddr).ConfigRouter()

	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/strategies", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	return rec
}
