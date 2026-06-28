package market

import (
	"encoding/json"
	"testing"
)

func TestCategoryMetaUnmarshal(t *testing.T) {
	raw := `{"code":200,"errMsg":"","body":{"categories":[{"id":"picoclaw","label":"PicoClaw","description":"PicoClaw Agent","platforms":["PicoClaw"],"requiredFile":"AGENT.md"}]}}`
	var wrap ginxResp
	if err := json.Unmarshal([]byte(raw), &wrap); err != nil {
		t.Fatal(err)
	}
	var out struct {
		Categories []CategoryMeta `json:"categories"`
	}
	if err := json.Unmarshal(wrap.Body, &out); err != nil {
		t.Fatal(err)
	}
	if len(out.Categories) != 1 {
		t.Fatalf("categories len = %d, want 1", len(out.Categories))
	}
	if out.Categories[0].ID != "picoclaw" || out.Categories[0].Label != "PicoClaw" {
		t.Fatalf("unexpected category: %+v", out.Categories[0])
	}
}
