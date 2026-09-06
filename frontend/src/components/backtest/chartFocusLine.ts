import { type IChartApi, type Time } from 'lightweight-charts';

export function placeFocusLine(chart: IChartApi | null, line: HTMLElement | null, day?: string | null) {
  if (!line) return;
  if (!chart || !day) {
    line.hidden = true;
    return;
  }
  const x = chart.timeScale().timeToCoordinate(day as Time);
  if (x == null) {
    line.hidden = true;
    return;
  }
  line.hidden = false;
  line.style.transform = `translate3d(${Math.round(x)}px,0,0)`;
}
