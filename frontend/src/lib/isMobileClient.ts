/** 与 use-mobile 一致：窄屏视为移动端客户端（含手机浏览器 / WebView）。 */
const MOBILE_BREAKPOINT = 768;

export function isMobileClient(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
}
