package finclaw

import "testing"

// a tiny valid base64 PNG payload (1x1 transparent) for happy-path cases.
const tinyPNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

func TestParseInlineImageMedia(t *testing.T) {
	t.Run("nil when absent", func(t *testing.T) {
		got, err := parseInlineImageMedia(map[string]any{"content": "hi"})
		if err != nil || got != nil {
			t.Fatalf("want nil,nil got %v,%v", got, err)
		}
	})

	t.Run("single string", func(t *testing.T) {
		got, err := parseInlineImageMedia(map[string]any{"media": tinyPNG})
		if err != nil {
			t.Fatalf("unexpected err: %v", err)
		}
		if len(got) != 1 || got[0] != tinyPNG {
			t.Fatalf("unexpected media: %v", got)
		}
	})

	t.Run("array of objects", func(t *testing.T) {
		payload := map[string]any{"media": []any{
			map[string]any{"url": tinyPNG},
			map[string]any{"data_url": tinyPNG},
		}}
		got, err := parseInlineImageMedia(payload)
		if err != nil {
			t.Fatalf("unexpected err: %v", err)
		}
		if len(got) != 2 {
			t.Fatalf("want 2 media, got %d", len(got))
		}
	})

	t.Run("rejects non-image data url", func(t *testing.T) {
		_, err := parseInlineImageMedia(map[string]any{"media": "data:text/plain;base64,aGk="})
		if err == nil {
			t.Fatal("expected error for non-image data url")
		}
	})

	t.Run("rejects non-base64", func(t *testing.T) {
		_, err := parseInlineImageMedia(map[string]any{"media": "https://example.com/a.png"})
		if err == nil {
			t.Fatal("expected error for remote url")
		}
	})
}

func TestDownloadURLForRef(t *testing.T) {
	got, err := downloadURLForRef("media://abc123")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if got != "/fin/media/abc123" {
		t.Fatalf("unexpected url: %q", got)
	}

	if _, err := downloadURLForRef("media://bad/id"); err == nil {
		t.Fatal("expected error for ref with slash")
	}
}

func TestInferAttachmentType(t *testing.T) {
	cases := map[string]struct {
		filename, contentType, want string
	}{
		"image by mime": {"x", "image/png", "image"},
		"audio by ext":  {"a.mp3", "", "audio"},
		"video by mime": {"v", "video/mp4", "video"},
		"file default":  {"doc.pdf", "application/pdf", "file"},
	}
	for name, c := range cases {
		if got := inferAttachmentType(c.filename, c.contentType); got != c.want {
			t.Errorf("%s: want %q got %q", name, c.want, got)
		}
	}
}
