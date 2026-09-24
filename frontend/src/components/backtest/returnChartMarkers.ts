export function actionMarkerDays(
  actionDays: string[] | undefined,
  knownDays: { has(day: string): boolean },
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...(actionDays ?? [])].sort()) {
    const day = String(raw ?? '').slice(0, 10);
    if (day.length < 10 || seen.has(day) || !knownDays.has(day)) continue;
    seen.add(day);
    out.push(day);
  }
  return out;
}
