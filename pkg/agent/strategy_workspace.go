package agentruntime

import "strings"

const StrategyDocRoot = "strategies"

// StrategyRelPath returns the logical relative path for a strategy file under ~/.finclaw/{account}/strategies/.
func StrategyRelPath(name string) string {
	return StrategyDocRoot + "/" + strings.TrimSpace(name) + ".py"
}
