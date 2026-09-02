import { cn } from '@/lib/cn';
import {
  PRIMARY_TAB_ACTIVE_CLASS,
  PRIMARY_TAB_INACTIVE_CLASS,
  SEGMENTED_CONTROL_ITEM_CLASS,
  SEGMENTED_CONTROL_TRACK_CLASS,
} from '@/lib/primaryButton';

export type SegmentedOption<T extends string = string> = {
  value: T;
  label: string;
};

type SegmentedControlProps<T extends string> = {
  value: T;
  options: readonly SegmentedOption<T>[] | SegmentedOption<T>[];
  onChange: (value: T) => void;
  'aria-label'?: string;
  className?: string;
  itemClassName?: string;
};

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  'aria-label': ariaLabel,
  className,
  itemClassName,
}: SegmentedControlProps<T>) {
  return (
    <div
      className={cn(SEGMENTED_CONTROL_TRACK_CLASS, className)}
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={cn(
              SEGMENTED_CONTROL_ITEM_CLASS,
              active ? PRIMARY_TAB_ACTIVE_CLASS : PRIMARY_TAB_INACTIVE_CLASS,
              itemClassName,
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
