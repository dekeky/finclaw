// Package market is a thin client for the desktop AgentHub service, exposing
// its template catalog (/api/hub/*) to the FinClaw backend so users can create
// agents from marketplace templates.
package market

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/finclaw/internal/config"
)

// CategoryMeta is one runtime category from AgentHub (/api/hub/categories).
type CategoryMeta struct {
	ID           string   `json:"id"`
	Label        string   `json:"label"`
	Description  string   `json:"description,omitempty"`
	Platforms    []string `json:"platforms,omitempty"`
	RequiredFile string   `json:"requiredFile,omitempty"`
}

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
	baseURL     string
	http        *http.Client
	uploadToken string
}

// New returns a Client for the given AgentHub base URL.
func New(baseURL string) *Client {
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if base == "" {
		base = config.DefaultAgentHubAddr
	}
	return &Client{
		baseURL: base,
		http:    &http.Client{Timeout: 30 * time.Second},
	}
}

// WithUploadToken returns a shallow copy of the client with the upload token
// set. The original client is not modified.
func (c *Client) WithUploadToken(token string) *Client {
	cp := *c
	cp.uploadToken = strings.TrimSpace(token)
	return &cp
}

// UploadAgentRequest describes an agent upload to AgentHub.
type UploadAgentRequest struct {
	AgentName   string
	Category    string
	Version     string
	DisplayName string
	Summary     string
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
func (c *Client) ListCategories() ([]CategoryMeta, error) {
	var out struct {
		Categories []CategoryMeta `json:"categories"`
	}
	if err := c.getJSON("/api/hub/categories", &out); err != nil {
		return nil, err
	}
	if out.Categories == nil {
		out.Categories = []CategoryMeta{}
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

// uploadAllowlist lists workspace entries that are included when uploading to
// AgentHub. Top-level files must match by name; top-level directories are
// included recursively.
var uploadAllowlist = map[string]bool{
	"AGENT.md":  true,
	"SOUL.md":   true,
	"USER.md":   true,
	"memory":    true,
	"skills":    true,
	"docs":      true,
	"doc":       true,
	"reports":   true,
	"report":    true,
	"analysis":  true,
	"research":  true,
	"memos":     true,
	"screening": true,
}

// isUploadAllowed returns true if a workspace-relative path should be included
// in the upload ZIP. It checks only the first path segment against the
// allowlist, so allowed directories are included recursively.
func isUploadAllowed(rel string) bool {
	rel = strings.ReplaceAll(rel, `\`, "/")
	if rel == "." {
		return true
	}
	seg := rel
	if idx := strings.Index(rel, "/"); idx >= 0 {
		seg = rel[:idx]
	}
	return uploadAllowlist[seg]
}

// ZipWorkspace creates a ZIP archive of the given directory in a temp file and
// returns the temp file path and a cleanup function the caller must invoke.
// Only files matching the upload allowlist are included. The ZIP entries use
// forward-slash paths relative to dir.
func ZipWorkspace(dir string) (zipPath string, cleanup func(), err error) {
	tmp, err := os.CreateTemp("", "finclaw-upload-*.zip")
	if err != nil {
		return "", nil, err
	}
	tmpPath := tmp.Name()
	clean := func() { _ = os.Remove(tmpPath) }

	w := zip.NewWriter(tmp)
	err = filepath.WalkDir(dir, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(dir, path)
		if err != nil {
			return err
		}
		// Use forward slashes for ZIP compatibility.
		rel = strings.ReplaceAll(rel, `\`, "/")
		if rel == "." {
			return nil
		}
		// Skip entries not in the upload allowlist.
		if !isUploadAllowed(rel) {
			if d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		if d.IsDir() {
			_, err = w.Create(rel + "/")
			return err
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		header, err := zip.FileInfoHeader(info)
		if err != nil {
			return err
		}
		header.Name = rel
		header.Method = zip.Deflate
		fw, err := w.CreateHeader(header)
		if err != nil {
			return err
		}
		src, err := os.Open(path)
		if err != nil {
			return err
		}
		defer src.Close()
		_, err = io.Copy(fw, src)
		return err
	})
	if err != nil {
		_ = w.Close()
		_ = tmp.Close()
		clean()
		return "", nil, err
	}
	if err := w.Close(); err != nil {
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

// UploadAgent zips the workspace directory and uploads it to AgentHub.
// If DisplayName or Summary are provided, it also updates the agent metadata.
func (c *Client) UploadAgent(workspaceDir string, req UploadAgentRequest) (AgentMeta, error) {
	if c.uploadToken == "" {
		return AgentMeta{}, fmt.Errorf("upload token is not configured")
	}

	zipPath, cleanup, err := ZipWorkspace(workspaceDir)
	if err != nil {
		return AgentMeta{}, fmt.Errorf("zip workspace: %w", err)
	}
	defer cleanup()

	// Read the ZIP file.
	zipData, err := os.ReadFile(zipPath)
	if err != nil {
		return AgentMeta{}, fmt.Errorf("read zip: %w", err)
	}

	// Build multipart form.
	var buf bytes.Buffer
	form := multipart.NewWriter(&buf)

	// Add file field.
	filePart, err := form.CreateFormFile("file", "workspace.zip")
	if err != nil {
		return AgentMeta{}, fmt.Errorf("create form file: %w", err)
	}
	if _, err := filePart.Write(zipData); err != nil {
		return AgentMeta{}, fmt.Errorf("write zip data: %w", err)
	}

	// Add agentName field (required).
	if err := form.WriteField("agentName", req.AgentName); err != nil {
		return AgentMeta{}, fmt.Errorf("write agentName: %w", err)
	}
	// Add category field (optional).
	if cat := strings.TrimSpace(req.Category); cat != "" {
		if err := form.WriteField("category", cat); err != nil {
			return AgentMeta{}, fmt.Errorf("write category: %w", err)
		}
	}
	// Add version field (optional).
	if ver := strings.TrimSpace(req.Version); ver != "" {
		if err := form.WriteField("version", ver); err != nil {
			return AgentMeta{}, fmt.Errorf("write version: %w", err)
		}
	}

	if err := form.Close(); err != nil {
		return AgentMeta{}, fmt.Errorf("close form: %w", err)
	}

	// Send request with 5-minute timeout for large uploads.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/hub/agents", &buf)
	if err != nil {
		return AgentMeta{}, err
	}
	httpReq.Header.Set("Content-Type", form.FormDataContentType())
	httpReq.Header.Set("Authorization", "Bearer "+c.uploadToken)

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return AgentMeta{}, fmt.Errorf("agenthub unreachable: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return AgentMeta{}, err
	}

	var wrap ginxResp
	if err := json.Unmarshal(body, &wrap); err != nil {
		if resp.StatusCode >= 400 {
			return AgentMeta{}, fmt.Errorf("agenthub HTTP %d", resp.StatusCode)
		}
		return AgentMeta{}, fmt.Errorf("invalid agenthub response: %w", err)
	}
	if wrap.Code >= 400 || wrap.ErrMsg != "" {
		msg := wrap.ErrMsg
		if msg == "" {
			msg = fmt.Sprintf("code %d", wrap.Code)
		}
		return AgentMeta{}, fmt.Errorf("upload failed: %s", msg)
	}

	// Extract the agent meta from the response.
	type uploadResp struct {
		Agent AgentMeta `json:"agent"`
	}
	var result uploadResp
	if err := json.Unmarshal(wrap.Body, &result); err != nil {
		return AgentMeta{}, fmt.Errorf("parse upload response: %w", err)
	}

	// Update metadata if displayName or summary provided.
	if strings.TrimSpace(req.DisplayName) != "" || strings.TrimSpace(req.Summary) != "" {
		if err := c.updateAgentMeta(req.AgentName, req.DisplayName, req.Summary, req.Category); err != nil {
			// Upload succeeded but metadata update failed — return the agent
			// meta anyway and log the error as part of the summary.
			result.Agent.Summary = fmt.Sprintf("%s (metadata update failed: %v)", result.Agent.Summary, err)
		} else {
			// Refresh the meta to reflect the update.
			result.Agent.DisplayName = strings.TrimSpace(req.DisplayName)
			result.Agent.Summary = strings.TrimSpace(req.Summary)
		}
	}

	return result.Agent, nil
}

// updateAgentMeta sends a PUT request to update agent metadata on AgentHub.
func (c *Client) updateAgentMeta(agentName, displayName, summary, category string) error {
	payload := map[string]string{}
	if v := strings.TrimSpace(displayName); v != "" {
		payload["displayName"] = v
	}
	if v := strings.TrimSpace(summary); v != "" {
		payload["summary"] = v
	}
	if v := strings.TrimSpace(category); v != "" {
		payload["category"] = v
	}
	if len(payload) == 0 {
		return nil
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPut,
		c.baseURL+"/api/hub/agents/"+url.PathEscape(agentName), bytes.NewReader(data))
	if err != nil {
		return err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.uploadToken)

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return fmt.Errorf("agenthub unreachable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		var wrap ginxResp
		if err := json.Unmarshal(body, &wrap); err == nil && wrap.ErrMsg != "" {
			return fmt.Errorf("%s", wrap.ErrMsg)
		}
		return fmt.Errorf("agenthub HTTP %d", resp.StatusCode)
	}
	return nil
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
