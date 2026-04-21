export function rssSourceDisplayLabel(row: {
  sourceName: string;
  sourceDisplayName?: string | null;
}): string {
  const t = row.sourceDisplayName?.trim();
  return t || row.sourceName;
}
