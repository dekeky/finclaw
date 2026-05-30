// Package market is a thin client for the desktop AgentHub service, exposing
// its template catalog (/api/hub/*) to the FinClaw backend so users can create
// agents from marketplace templates.
package market

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// AgentMeta mirrors AgentHub's hub.AgentMeta (a template package summary).
type AgentMeta struct {
	AgentName     string    `json:"agentName"`
	Category      string    `json:"category"`
	DisplayName   string    `json:"displayName"`
	Summary       string    `json:"summary"`
	LatestVersion string    `json:"latestVersion"`
	Versions      []string  `json:"versions"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

// FileEntry is one file inside a template package version.
type FileEntry struct {
	Path string `json:"path"`
	Size int64  `json:"size"`
}

// AgentDetail mirrors AgentHub's hub.AgentDetail (meta + file tree).
type AgentDetail struct {
	AgentMeta
	Files []FileEntry `json:"files"`
}

// Client talks to the AgentHub HTTP API.
type Client struct {
	baseURL string
	http    *http.Client
}

// New returns a Client for the given AgentHub base URL.
func New(baseURL string) *Client {
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if base == "" {
		base = "http://127.0.0.1:9093"
	}
	return &Client{
		baseURL: base,
		http:    &http.Client{Timeout: 30 * time.Second},
	}
}

// ginxResp is the {code, errMsg, body} envelope used by AgentHub.
type ginxResp struct {
	Code   int             `json:"code"`
	ErrMsg string          `json:"errMsg"`
	Body   json.RawMessage `json:"body"`
}

func (c *Client) getJSON(path string, out any) error {
	req, err := http.NewRequest(http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("agenthub unreachable: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	var wrap ginxResp
	if err := json.Unmarshal(body, &wrap); err != nil {
		if resp.StatusCode >= 400 {
			return fmt.Errorf("agenthub HTTP %d", resp.StatusCode)
		}
		return fmt.Errorf("invalid agenthub response: %w", err)
	}
	if wrap.Code >= 400 || wrap.ErrMsg != "" {
		if wrap.ErrMsg != "" {
			return fmt.Errorf("%s", wrap.ErrMsg)
		}
		return fmt.Errorf("agenthub request failed: code %d", wrap.Code)
	}
	if out == nil || len(wrap.Body) == 0 || string(wrap.Body) == "null" {
		return nil
	}
	return json.Unmarshal(wrap.Body, out)
}

// ListCategories returns the runtime categories known to AgentHub.
func (c *Client) ListCategories() ([]string, error) {
	var out struct {
		Categories []string `json:"categories"`
	}
	if err := c.getJSON("/api/hub/categories", &out); err != nil {
		return nil, err
	}
	return out.Categories, nil
}

// ListTemplates returns the template packages, optionally filtered by category.
func (c *Client) ListTemplates(category string) ([]AgentMeta, error) {
	path := "/api/hub/agents"
	if cat := strings.TrimSpace(category); cat != "" {
		path += "?category=" + url.QueryEscape(cat)
	}
	var out struct {
		Agents []AgentMeta `json:"agents"`
		Total  int         `json:"total"`
	}
	if err := c.getJSON(path, &out); err != nil {
		return nil, err
	}
	if out.Agents == nil {
		out.Agents = []AgentMeta{}
	}
	return out.Agents, nil
}

// GetTemplate returns full detail (meta + files) for one template package.
func (c *Client) GetTemplate(name string) (AgentDetail, error) {
	var out AgentDetail
	if err := c.getJSON("/api/hub/agents/"+url.PathEscape(name), &out); err != nil {
		return AgentDetail{}, err
	}
	return out, nil
}

// GetTemplateFile returns the content of one file inside a template package.
func (c *Client) GetTemplateFile(name, version, path string) (string, error) {
	u := fmt.Sprintf("/api/hub/agents/%s/files/%s", url.PathEscape(name), escapePath(path))
	if v := strings.TrimSpace(version); v != "" {
		u += "?version=" + url.QueryEscape(v)
	}
	var out struct {
		Content string `json:"content"`
	}
	if err := c.getJSON(u, &out); err != nil {
		return "", err
	}
	return out.Content, nil
}

// DownloadTemplate fetches the template package ZIP into a temp file and
// returns its path along with a cleanup func the caller must invoke.
func (c *Client) DownloadTemplate(name, version string) (zipPath string, cleanup func(), err error) {
	u := fmt.Sprintf("%s/api/hub/agents/%s/download", c.baseURL, url.PathEscape(name))
	if v := strings.TrimSpace(version); v != "" {
		u += "?version=" + url.QueryEscape(v)
	}
	resp, err := c.http.Do(mustGet(u))
	if err != nil {
		return "", nil, fmt.Errorf("agenthub unreachable: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", nil, fmt.Errorf("download template %q failed: HTTP %d", name, resp.StatusCode)
	}
	tmp, err := os.CreateTemp("", "finclaw-template-*.zip")
	if err != nil {
		return "", nil, err
	}
	tmpPath := tmp.Name()
	clean := func() { _ = os.Remove(tmpPath) }
	if _, err := io.Copy(tmp, resp.Body); err != nil {
		_ = tmp.Close()
		clean()
		return "", nil, err
	}
	if err := tmp.Close(); err != nil {
		clean()
		return "", nil, err
	}
	return tmpPath, clean, nil
}

func mustGet(u string) *http.Request {
	req, _ := http.NewRequest(http.MethodGet, u, nil)
	return req
}

func escapePath(p string) string {
	p = strings.TrimPrefix(p, "/")
	segments := strings.Split(p, "/")
	for i, s := range segments {
		segments[i] = url.PathEscape(s)
	}
	return strings.Join(segments, "/")
}
