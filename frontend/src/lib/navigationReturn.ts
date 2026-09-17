/** Location state used so an in-app back button can return to the page that opened this view. */
export type ReturnToState = {
  returnTo?: string;
};

export function parseReturnTo(state: unknown): string | null {
  if (!state || typeof state !== 'object') return null;
  const value = (state as ReturnToState).returnTo;
  if (typeof value !== 'string') return null;
  const path = value.trim();
  if (!path.startsWith('/')) return null;
  if (path.startsWith('//') || path.includes('://') || path.includes('\\')) return null;
  return path;
}

export function withReturnTo(from: string): ReturnToState {
  return { returnTo: from };
}
