package agentruntime

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"unicode"
)

const maxZipDownloadSize = 50 << 20 // 50MB

// ZipDirectoryToBytes archives a directory tree into a ZIP byte slice.
// Entry paths use forward slashes relative to dir.
func ZipDirectoryToBytes(dir string) ([]byte, error) {
	dir = strings.TrimSpace(dir)
	if dir == "" {
		return nil, fmt.Errorf("directory path is required")
	}
	info, err := os.Stat(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("%q not found", filepath.Base(dir))
		}
		return nil, fmt.Errorf("stat directory: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("%q is not a directory", filepath.Base(dir))
	}

	var total int64
	buf := &bytes.Buffer{}
	w := zip.NewWriter(buf)
	err = filepath.WalkDir(dir, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if strings.HasPrefix(d.Name(), ".") {
			if d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		rel, err := filepath.Rel(dir, path)
		if err != nil {
			return err
		}
		rel = strings.ReplaceAll(rel, `\`, "/")
		if rel == "." {
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
		total += info.Size()
		if total > maxZipDownloadSize {
			return fmt.Errorf("folder exceeds 50MB download size limit")
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
		return nil, err
	}
	if err := w.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func zipDownloadFilename(baseName string) string {
	safe := strings.ReplaceAll(strings.TrimSpace(baseName), `"`, `_`)
	if safe == "" {
		safe = "download"
	}
	return safe + ".zip"
}

// attachmentContentDisposition builds a Content-Disposition header with RFC 5987 UTF-8 filename*.
func attachmentContentDisposition(filename string) string {
	filename = strings.TrimSpace(filename)
	if filename == "" {
		filename = "download"
	}
	filename = strings.ReplaceAll(filename, `"`, `_`)
	ascii := toASCIIFilenameFallback(filename)
	encoded := url.PathEscape(filename)
	return fmt.Sprintf(`attachment; filename="%s"; filename*=UTF-8''%s`, ascii, encoded)
}

func toASCIIFilenameFallback(filename string) string {
	var b strings.Builder
	for _, r := range filename {
		if r < unicode.MaxASCII && r != '"' && r != '\\' && !unicode.IsControl(r) {
			b.WriteRune(r)
		} else {
			b.WriteRune('_')
		}
	}
	s := strings.TrimSpace(b.String())
	if s == "" {
		return "download"
	}
	return s
}
