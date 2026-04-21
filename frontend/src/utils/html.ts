/** Best-effort strip for inline RSS HTML before innerHTML. */
export function stripDangerousTags(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}

export function isProbablyHtml(s: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(s);
}
