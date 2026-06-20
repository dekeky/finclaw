package finclaw

import (
	"encoding/base64"
	"fmt"
	"net/url"
	"path/filepath"
	"strings"

	"github.com/sipeed/picoclaw/pkg/config"
)

// allowedInlineImageMIMETypes lists the inline image formats accepted on inbound
// message.send payloads. PicoClaw forwards these data URLs to vision-capable
// models unchanged, so we only need to validate them here.
var allowedInlineImageMIMETypes = map[string]struct{}{
	"image/jpeg": {},
	"image/png":  {},
	"image/gif":  {},
	"image/webp": {},
	"image/bmp":  {},
}

// parseInlineImageMedia extracts inline image data URLs from a message.send payload.
// It accepts payload["media"] as a string, []string, or []object{url|data_url}.
// Returns the validated data URLs (reused directly as PicoClaw InboundMessage.Media).
func parseInlineImageMedia(payload map[string]any) ([]string, error) {
	if len(payload) == 0 {
		return nil, nil
	}

	raw, ok := payload["media"]
	if !ok || raw == nil {
		return nil, nil
	}

	switch values := raw.(type) {
	case []any:
		media := make([]string, 0, len(values))
		for i, item := range values {
			value, err := inlineImageValue(item)
			if err != nil {
				return nil, fmt.Errorf("media[%d]: %w", i, err)
			}
			if err := validateInlineImageDataURL(value); err != nil {
				return nil, fmt.Errorf("media[%d]: %w", i, err)
			}
			media = append(media, value)
		}
		return media, nil
	case []string:
		media := make([]string, 0, len(values))
		for i, value := range values {
			value = strings.TrimSpace(value)
			if err := validateInlineImageDataURL(value); err != nil {
				return nil, fmt.Errorf("media[%d]: %w", i, err)
			}
			media = append(media, value)
		}
		return media, nil
	case string:
		value := strings.TrimSpace(values)
		if err := validateInlineImageDataURL(value); err != nil {
			return nil, err
		}
		return []string{value}, nil
	default:
		return nil, fmt.Errorf("media must be a string or array of strings")
	}
}

func inlineImageValue(item any) (string, error) {
	switch value := item.(type) {
	case string:
		value = strings.TrimSpace(value)
		if value == "" {
			return "", fmt.Errorf("image payload is empty")
		}
		return value, nil
	case map[string]any:
		for _, key := range []string{"url", "data_url"} {
			if raw, ok := value[key].(string); ok && strings.TrimSpace(raw) != "" {
				return strings.TrimSpace(raw), nil
			}
		}
		return "", fmt.Errorf("image payload must include url or data_url")
	default:
		return "", fmt.Errorf("image payload must be a string or object")
	}
}

func validateInlineImageDataURL(mediaURL string) error {
	if mediaURL == "" {
		return fmt.Errorf("image payload is empty")
	}
	if !strings.HasPrefix(mediaURL, "data:image/") {
		return fmt.Errorf("only inline image data URLs are supported")
	}

	header, data, found := strings.Cut(mediaURL, ",")
	if !found || strings.TrimSpace(data) == "" {
		return fmt.Errorf("image data URL is malformed")
	}
	if !strings.Contains(header, ";base64") {
		return fmt.Errorf("image data URL must be base64 encoded")
	}
	mimeType, _, _ := strings.Cut(strings.TrimPrefix(header, "data:"), ";")
	if _, ok := allowedInlineImageMIMETypes[mimeType]; !ok {
		return fmt.Errorf("unsupported image format: %s", mimeType)
	}

	data = strings.TrimSpace(data)
	if base64.StdEncoding.DecodedLen(len(data)) > config.DefaultMaxMediaSize {
		return fmt.Errorf("image exceeds %d byte limit", config.DefaultMaxMediaSize)
	}
	if _, err := base64.StdEncoding.DecodeString(data); err != nil {
		return fmt.Errorf("invalid base64 image data")
	}
	return nil
}

// mediaRefID extracts the opaque id from a "media://<id>" ref, rejecting refs
// that could be used for path traversal.
func mediaRefID(ref string) (string, error) {
	refID := strings.TrimSpace(strings.TrimPrefix(ref, "media://"))
	if refID == "" || strings.Contains(refID, "/") {
		return "", fmt.Errorf("invalid media ref %q", ref)
	}
	return refID, nil
}

// downloadURLForRef builds the same-origin path used by the web UI to fetch a
// stored media file. The caller (frontend) appends an auth token query param.
func downloadURLForRef(ref string) (string, error) {
	refID, err := mediaRefID(ref)
	if err != nil {
		return "", err
	}
	return "/fin/media/" + url.PathEscape(refID), nil
}

// inferAttachmentType classifies an attachment for the frontend renderer.
func inferAttachmentType(filename, contentType string) string {
	contentType = strings.ToLower(strings.TrimSpace(contentType))
	filename = strings.ToLower(strings.TrimSpace(filename))

	switch {
	case strings.HasPrefix(contentType, "image/"):
		return "image"
	case strings.HasPrefix(contentType, "audio/"):
		return "audio"
	case strings.HasPrefix(contentType, "video/"):
		return "video"
	}

	switch filepath.Ext(filename) {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg":
		return "image"
	case ".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac", ".wma", ".opus":
		return "audio"
	case ".mp4", ".avi", ".mov", ".webm", ".mkv":
		return "video"
	default:
		return "file"
	}
}
