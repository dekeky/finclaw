export type BacktestStrategyOwner = {
  id?: string | null;
  name?: string | null;
};

export type BacktestStrategyLink = {
  strategy_id?: string | null;
  strategy_name?: string | null;
  request?: { strategy_id?: string | null; strategy_name?: string | null } | null;
};

function linkedStrategyID(item: BacktestStrategyLink): string {
  return item.strategy_id?.trim() || item.request?.strategy_id?.trim() || '';
}

function linkedStrategyName(item: BacktestStrategyLink): string {
  return item.strategy_name?.trim() || item.request?.strategy_name?.trim() || '';
}

/** Match a run to a strategy by stable id, falling back to name for legacy records. */
export function runBelongsToStrategy(item: BacktestStrategyLink, strategy: BacktestStrategyOwner): boolean {
  const itemID = linkedStrategyID(item);
  const strategyID = strategy.id?.trim() || '';
  if (itemID && strategyID) return itemID === strategyID;
  const itemName = linkedStrategyName(item);
  const strategyName = strategy.name?.trim() || '';
  return Boolean(itemName && strategyName && itemName === strategyName);
}

/** True when the payload is known to belong to a different strategy. */
export function runConflictsWithStrategy(item: BacktestStrategyLink, strategy: BacktestStrategyOwner): boolean {
  const itemID = linkedStrategyID(item);
  const strategyID = strategy.id?.trim() || '';
  if (itemID && strategyID) return itemID !== strategyID;
  if (itemID || strategyID) return false;
  const itemName = linkedStrategyName(item);
  const strategyName = strategy.name?.trim() || '';
  return Boolean(itemName && strategyName && itemName !== strategyName);
}
