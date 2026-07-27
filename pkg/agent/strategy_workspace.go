package agentruntime

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/finclaw/pkg/agent/picoclaw"
)

const StrategyDocRoot = "strategies"

// StrategyRelPath returns the workspace-relative path for a strategy file.
func StrategyRelPath(name string) string {
	return StrategyDocRoot + "/" + strings.TrimSpace(name) + ".py"
}

// SyncStrategyToAgentWorkspaces copies a strategy file into each agent workspace so
// PicoClaw tools can read/write it via the workspace-relative path strategies/{name}.py.
func SyncStrategyToAgentWorkspaces(userID, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("strategy name is required")
	}
	userHome := UserAgentHome(userID)
	agentNames, err := agentNamesFromDisk(userHome)
	if err != nil {
		return err
	}
	for _, agentName := range agentNames {
		if err := SyncStrategyToAgentWorkspace(userID, agentName, name); err != nil {
			return fmt.Errorf("sync strategy to agent %q: %w", agentName, err)
		}
	}
	return nil
}

// SyncStrategyToAgentWorkspace copies the canonical strategy file into one agent workspace.
func SyncStrategyToAgentWorkspace(userID, agentName, strategyName string) error {
	strategyName = strings.TrimSpace(strategyName)
	agentName = strings.TrimSpace(agentName)
	if strategyName == "" || agentName == "" {
		return fmt.Errorf("strategy and agent name are required")
	}
	src := filepath.Join(strategyRoot(userID), strategyName+".py")
	if _, err := os.Stat(src); err != nil {
		return fmt.Errorf("strategy file: %w", err)
	}
	destDir := filepath.Join(picoclaw.AgentWorkspacePath(UserAgentHome(userID), agentName), StrategyDocRoot)
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return fmt.Errorf("mkdir agent strategies: %w", err)
	}
	dest := agentStrategyFilePath(userID, agentName, strategyName)
	if err := copyFile(src, dest); err != nil {
		return fmt.Errorf("sync strategy to agent %q: %w", agentName, err)
	}
	return nil
}

func agentStrategyFilePath(userID, agentName, strategyName string) string {
	return filepath.Join(
		picoclaw.AgentWorkspacePath(UserAgentHome(userID), agentName),
		StrategyDocRoot,
		strategyName+".py",
	)
}

func copyFile(src, dest string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer out.Close()
	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Close()
}

// RemoveStrategyFromAgentWorkspaces deletes a strategy file from every agent workspace.
func RemoveStrategyFromAgentWorkspaces(userID, strategyName string) error {
	strategyName = strings.TrimSpace(strategyName)
	if strategyName == "" {
		return fmt.Errorf("strategy name is required")
	}
	userHome := UserAgentHome(userID)
	agentNames, err := agentNamesFromDisk(userHome)
	if err != nil {
		return err
	}
	for _, agentName := range agentNames {
		path := agentStrategyFilePath(userID, agentName, strategyName)
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("remove strategy from agent %q: %w", agentName, err)
		}
	}
	return nil
}

// PullStrategyFromAgentWorkspace copies the agent workspace copy back to the canonical strategy file.
// If the agent workspace file is missing, pushes the canonical file into the workspace instead.
func PullStrategyFromAgentWorkspace(userID, agentName, strategyName string) (changed bool, err error) {
	strategyName = strings.TrimSpace(strategyName)
	agentName = strings.TrimSpace(agentName)
	if strategyName == "" || agentName == "" {
		return false, fmt.Errorf("strategy and agent name are required")
	}
	src := agentStrategyFilePath(userID, agentName, strategyName)
	if _, statErr := os.Stat(src); os.IsNotExist(statErr) {
		if err := SyncStrategyToAgentWorkspace(userID, agentName, strategyName); err != nil {
			return false, err
		}
		return false, nil
	}
	data, err := os.ReadFile(src)
	if err != nil {
		return false, fmt.Errorf("read agent strategy file: %w", err)
	}
	dest := filepath.Join(strategyRoot(userID), strategyName+".py")
	if err := os.WriteFile(dest, data, 0o600); err != nil {
		return false, fmt.Errorf("write canonical strategy file: %w", err)
	}
	return true, nil
}
