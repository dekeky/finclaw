export type ChartRestoreInput = {
  active: boolean;
  width: number;
  height: number;
  hasChart: boolean;
};

export type ChartRestoreAction = 'skip' | 'create' | 'resize';

export const CHART_HOST_MIN_WIDTH = 160;
export const CHART_HOST_MIN_HEIGHT = 80;

export function isChartHostReady(width: number, height: number): boolean {
  return width >= CHART_HOST_MIN_WIDTH && height >= CHART_HOST_MIN_HEIGHT;
}

export function chartRestoreAction(input: ChartRestoreInput): ChartRestoreAction {
  if (!input.active || !isChartHostReady(input.width, input.height)) return 'skip';
  return input.hasChart ? 'resize' : 'create';
}
