package picoclaw

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"
)

func TestSaveAndDeleteAvatar(t *testing.T) {
	home := t.TempDir()
	agentName := "test-agent"
	if err := os.MkdirAll(AgentDir(home, agentName), 0o755); err != nil {
		t.Fatal(err)
	}

	data := mustPNG(t, 64, 64)
	if err := SaveAvatar(home, agentName, data); err != nil {
		t.Fatalf("SaveAvatar: %v", err)
	}
	if !HasAvatar(home, agentName) {
		t.Fatal("expected has avatar")
	}

	if err := DeleteAvatar(home, agentName); err != nil {
		t.Fatalf("DeleteAvatar: %v", err)
	}
	if HasAvatar(home, agentName) {
		t.Fatal("expected avatar removed")
	}
}

func TestRenameAgentDir(t *testing.T) {
	home := t.TempDir()
	oldName := "alpha"
	newName := "beta"
	if err := os.MkdirAll(AgentDir(home, oldName), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(AgentDir(home, oldName), "config.json"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := RenameAgentDir(home, oldName, newName); err != nil {
		t.Fatalf("RenameAgentDir: %v", err)
	}
	if _, err := os.Stat(AgentDir(home, oldName)); !os.IsNotExist(err) {
		t.Fatalf("old dir should be gone: %v", err)
	}
	if _, err := os.Stat(AgentDir(home, newName)); err != nil {
		t.Fatalf("new dir missing: %v", err)
	}
}

func mustPNG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{R: 120, G: 80, B: 200, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}
