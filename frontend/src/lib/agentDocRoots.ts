/** Workspace subdirectories scanned for agent document assets (keep in sync with pkg/agent/docs.go). */
export const AGENT_DOC_SCAN_ROOTS = [
  'docs',
  'doc',
  'reports',
  'report',
  'analysis',
  'research',
  'memos',
  'screening',
] as const;

export function messageTouchesDocScanRoot(content: string): boolean {
  if (!content.includes('write_file')) return false;
  return AGENT_DOC_SCAN_ROOTS.some((root) => content.includes(`${root}/`));
}
