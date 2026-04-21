export interface RssSourceIndex {
  sourceName: string;
  sourceDisplayName?: string;
  sectors: string[];
  /** 订阅源站点 URL（后端新增字段） */
  url?: string;
  /** 最近一次抓取是否健康（后端新增字段） */
  health?: boolean;
}

export interface RssItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  guid: string;
  author: string;
  categories: string[];
  timestamp: number;
}

export interface RssData {
  sourceName: string;
  sourceDisplayName?: string;
  sector: string;
  /** 订阅源站点 URL（后端新增字段） */
  url?: string;
  items: RssItem[];
}

/**
 * 后端通用响应信封（由 rssmanager/pkg/ginx 定义）：
 * { code: int, errMsg: string, body: T }
 */
export interface GinxResponse<T> {
  code: number;
  errMsg: string;
  body: T;
}
