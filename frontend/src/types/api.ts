/**
 * 后端通用响应信封（由 rssmanager/pkg/ginx 定义）：
 * { code: int, errMsg: string, body: T }
 */
export interface GinxResponse<T> {
  code: number;
  errMsg: string;
  body: T;
}
