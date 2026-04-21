import type { GinxResponse, RssData, RssSourceIndex } from '../types/rss';

/**
 * 解析后端 ginx 响应信封（{ code, errMsg, body }）。
 * - HTTP 非 2xx 或 errMsg 非空时抛错；
 * - code 存在且非 200 也视为错误（后端在 panic recover 中会带上 code）。
 */
async function parseGinx<T>(res: Response): Promise<GinxResponse<T>> {
  let json: GinxResponse<T> | null = null;
  try {
    json = (await res.json()) as GinxResponse<T>;
  } catch {
    // 非 JSON 响应
  }
  if (!res.ok) {
    throw new Error(json?.errMsg || `HTTP ${res.status}`);
  }
  if (!json) {
    throw new Error('Empty response');
  }
  if (json.errMsg) {
    throw new Error(json.errMsg);
  }
  if (typeof json.code === 'number' && json.code !== 200) {
    throw new Error(`unexpected code: ${json.code}`);
  }
  return json;
}

/** GET /rss/index —— 所有订阅源索引（含 sectors / url / health）。 */
export async function fetchRssSources(): Promise<RssSourceIndex[]> {
  const res = await fetch('/rss/index');
  const body = await parseGinx<RssSourceIndex[] | null>(res);
  return Array.isArray(body.body) ? body.body : [];
}

/** GET /rss/:sourceName —— 指定订阅源下所有 sector 的条目包。 */
export async function fetchRssDataBySource(sourceName: string): Promise<RssData[]> {
  const res = await fetch(`/rss/${encodeURIComponent(sourceName)}`);
  const body = await parseGinx<RssData[] | null>(res);
  return Array.isArray(body.body) ? body.body : [];
}

/** GET /rss/:sourceName/:sector —— 指定订阅源 + 分组的条目包。 */
export async function fetchRssSectorData(
  sourceName: string,
  sector: string,
): Promise<RssData | null> {
  const res = await fetch(
    `/rss/${encodeURIComponent(sourceName)}/${encodeURIComponent(sector)}`,
  );
  const body = await parseGinx<RssData | null>(res);
  return body.body ?? null;
}

/**
 * 「全部待读」聚合：先读索引，再并发拉取每个 source 的全量 sector 数据并合并。
 * 旧后端提供的 `/rss/data/all` 已废弃，这里在前端做聚合以保持语义。
 */
export async function fetchAllRssData(): Promise<RssData[]> {
  const sources = await fetchRssSources();
  if (sources.length === 0) return [];
  const results = await Promise.allSettled(
    sources.map((s) => fetchRssDataBySource(s.sourceName)),
  );
  const all: RssData[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }
  return all;
}

/** DELETE /rss/:sourceName —— 删除整个订阅源（及其所有 sector 数据）。 */
export async function deleteRssSource(sourceName: string): Promise<void> {
  const res = await fetch(`/rss/${encodeURIComponent(sourceName)}`, { method: 'DELETE' });
  await parseGinx<null>(res);
}

/** DELETE /rss/:sourceName/:sector —— 删除指定 source 下的某个 sector 数据。 */
export async function deleteRssSector(sourceName: string, sector: string): Promise<void> {
  const res = await fetch(
    `/rss/${encodeURIComponent(sourceName)}/${encodeURIComponent(sector)}`,
    { method: 'DELETE' },
  );
  await parseGinx<null>(res);
}
