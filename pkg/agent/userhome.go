package agentruntime

import (
	"path/filepath"

	"github.com/finclaw/internal/config"
)

// UserHomeLoader resolves user ids to on-disk home directories.
type UserHomeLoader interface {
	ListUserIDs() ([]string, error)
	ResolveUserHomeDir(userID string) (string, error)
}

var userHomeLoader UserHomeLoader

// SetUserHomeLoader configures how user ids map to ~/.finclaw/{account} directories.
func SetUserHomeLoader(loader UserHomeLoader) {
	userHomeLoader = loader
}

// UserAgentHome returns the directory for a user's agents (~/.finclaw/{account}).
func UserAgentHome(userID string) string {
	if userHomeLoader != nil {
		if dir, err := userHomeLoader.ResolveUserHomeDir(userID); err == nil && dir != "" {
			return dir
		}
	}
	return filepath.Join(config.FinclawHomePath(), userID)
}
