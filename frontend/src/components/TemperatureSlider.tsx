import * as React from 'react';
import { cn } from '@/lib/cn';

const TEMP_GRADIENT =
  'linear-gradient(to right, #2563eb 0%, #0d9488 35%, #ca8a04 68%, #ea580c 100%)';

/** 根据温度值在严谨→发散色谱上取色（用于滑块拇指边框）。 */
export function temperatureAccentColor(value: number, min = 0, max = 2): string {
  const t = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const stops = [
    { pos: 0, color: [37, 99, 235] },
    { pos: 0.35, color: [13, 148, 136] },
    { pos: 0.68, color: [202, 138, 4] },
    { pos: 1, color: [234, 88, 12] },
  ];
  let i = 0;
  while (i < stops.length - 1 && t > stops[i + 1].pos) i++;
  const a = stops[i];
  const b = stops[i + 1] ?? a;
  const span = b.pos - a.pos || 1;
  const mix = span === 0 ? 0 : (t - a.pos) / span;
  const r = Math.round(a.color[0] + (b.color[0] - a.color[0]) * mix);
  const g = Math.round(a.color[1] + (b.color[1] - a.color[1]) * mix);
  const bl = Math.round(a.color[2] + (b.color[2] - a.color[2]) * mix);
  return `rgb(${r}, ${g}, ${bl})`;
}

export interface TemperatureSliderProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'min' | 'max' | 'step'> {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

const TemperatureSlider = React.forwardRef<HTMLInputElement, TemperatureSliderProps>(
  ({ className, value, onValueChange, min = 0, max = 2, step = 0.1, disabled, id, ...props }, ref) => {
    const autoId = React.useId().replace(/:/g, '');
    const inputId = id ?? autoId;
    const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
    const thumbColor = temperatureAccentColor(value, min, max);

    return (
      <div className={cn('space-y-2', className)}>
        <div className="relative py-1">
          <div
            className="pointer-events-none absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full"
            aria-hidden
          >
            <div className="h-full w-full" style={{ background: TEMP_GRADIENT }} />
            <div
              className="absolute inset-y-0 bg-background/55 dark:bg-background/45"
              style={{ left: `${pct}%`, right: 0 }}
            />
          </div>
          <style
            dangerouslySetInnerHTML={{
              __html: `
                #${inputId}::-webkit-slider-thumb {
                  -webkit-appearance: none;
                  width: 1rem;
                  height: 1rem;
                  margin-top: -0.25rem;
                  border-radius: 9999px;
                  border: 2px solid ${thumbColor};
                  background: var(--background, #fff);
                  box-shadow: 0 1px 3px rgb(0 0 0 / 0.18);
                }
                #${inputId}::-moz-range-thumb {
                  width: 1rem;
                  height: 1rem;
                  border-radius: 9999px;
                  border: 2px solid ${thumbColor};
                  background: var(--background, #fff);
                  box-shadow: 0 1px 3px rgb(0 0 0 / 0.18);
                }
              `,
            }}
          />
          <input
            ref={ref}
            id={inputId}
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={disabled}
            onChange={(e) => onValueChange(Number(e.target.value))}
            className={cn(
              'relative z-10 h-2 w-full cursor-pointer appearance-none bg-transparent',
              '[&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent',
              '[&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
            {...props}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>严谨</span>
          <span className="hidden sm:inline">平衡</span>
          <span>发散</span>
        </div>
      </div>
    );
  },
);
TemperatureSlider.displayName = 'TemperatureSlider';

export { TemperatureSlider, TEMP_GRADIENT };
