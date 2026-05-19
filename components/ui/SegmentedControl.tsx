"use client";

type Item<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  value: T;
  items: Item<T>[];
  onChange: (next: T) => void;
  ariaLabel?: string;
};

// HIG segmented control: pill container, inner "thumb" highlights the active
// segment with subtle elevation + softer fill. Keyboard-navigable via arrow keys.
export function SegmentedControl<T extends string>({ value, items, onChange, ariaLabel }: Props<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex p-0.5 rounded-md bg-surface-inset border border-rule gap-0.5"
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={
              "px-3 h-7 rounded-[7px] text-hig-footnote font-medium transition-all duration-150 ease-hig " +
              (active
                ? "bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.10)]"
                : "text-ink-secondary hover:text-ink")
            }
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
