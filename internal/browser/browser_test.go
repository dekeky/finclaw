package browser

import "testing"

func TestLocalURL(t *testing.T) {
	tests := []struct {
		addr string
		want string
	}{
		{":8082", "http://127.0.0.1:8082"},
		{"127.0.0.1:8082", "http://127.0.0.1:8082"},
		{"0.0.0.0:8082", "http://127.0.0.1:8082"},
		{"localhost:8082", "http://localhost:8082"},
	}
	for _, tt := range tests {
		if got := LocalURL(tt.addr); got != tt.want {
			t.Errorf("LocalURL(%q) = %q, want %q", tt.addr, got, tt.want)
		}
	}
}
