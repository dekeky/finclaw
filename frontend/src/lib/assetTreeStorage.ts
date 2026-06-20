const DOC_EXPANDED_PREFIX = 'finclaw.docTree.expanded.';

export function loadExpandedDirs(agentName: string): Set<string> {
  if (!agentName || typeof sessionStorage === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(`${DOC_EXPANDED_PREFIX}${agentName}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === 'string'));
  } catch {
    return new Set();
  }
}

export function saveExpandedDirs(agentName: string, expanded: Set<string>): void {
  if (!agentName || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(`${DOC_EXPANDED_PREFIX}${agentName}`, JSON.stringify([...expanded]));
  } catch {
    // ignore quota / privacy errors
  }
}
