package agentruntime

import "strings"
import "testing"

func TestNormalizeStrategyPlatform(t *testing.T) {
	tests := []struct {
		in      string
		want    string
		wantErr bool
	}{
		{in: "", want: StrategyPlatformFinClaw},
		{in: "ths", want: StrategyPlatformFinClaw},
		{in: "joinquant", want: StrategyPlatformJoinQuant},
		{in: "FinClaw", want: StrategyPlatformFinClaw},
		{in: "ricequant", wantErr: true},
	}
	for _, tt := range tests {
		got, err := normalizeStrategyPlatform(tt.in)
		if tt.wantErr {
			if err == nil {
				t.Fatalf("normalizeStrategyPlatform(%q) = %q, want error", tt.in, got)
			}
			continue
		}
		if err != nil {
			t.Fatalf("normalizeStrategyPlatform(%q): %v", tt.in, err)
		}
		if got != tt.want {
			t.Fatalf("normalizeStrategyPlatform(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestDefaultStrategyScript(t *testing.T) {
	jq := defaultStrategyScript(StrategyPlatformJoinQuant)
	if !strings.Contains(jq, "def initialize") || !strings.Contains(jq, "def handle_data") {
		t.Fatalf("joinquant default script missing initialize/handle_data:\n%s", jq)
	}
	fc := defaultStrategyScript(StrategyPlatformFinClaw)
	if !strings.Contains(fc, "from akquant import") || !strings.Contains(fc, "class DualMAStrategy") || !strings.Contains(fc, "def on_bar") {
		t.Fatalf("finclaw default script missing akquant Strategy:\n%s", fc)
	}
	if !strings.Contains(fc, "from fquant.indicators import pe_ttm") || !strings.Contains(fc, "extra = [pe_ttm]") || !strings.Contains(fc, "bar.extra.get(pe_ttm)") {
		t.Fatalf("finclaw default script missing extra indicators:\n%s", fc)
	}
	if strings.Contains(fc, "fquant.symbols") || strings.Contains(fc, "symbols = lookup") {
		t.Fatalf("finclaw default script still pins symbols in code:\n%s", fc)
	}
}
