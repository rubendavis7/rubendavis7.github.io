"use client";

import { TIB_TIERS, type TibId } from "@/lib/calculator";
import { cx } from "./ui";

/** The five time-in-business toggle buttons. Works as a radio group. */
export function TibPills({
  value,
  onChange,
  labelledBy,
  describedBy,
  invalid,
}: {
  value: TibId | "";
  onChange: (id: TibId) => void;
  labelledBy: string;
  describedBy?: string;
  invalid?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className="flex flex-wrap gap-2"
    >
      {TIB_TIERS.map((tier) => {
        const selected = tier.id === value;
        return (
          <button
            key={tier.id}
            type="button"
            role="radio"
            aria-checked={selected}
            data-tib={tier.id}
            onClick={() => onChange(tier.id)}
            className={cx(
              "h-11 rounded-full border-2 px-4 text-sm font-semibold whitespace-nowrap transition-colors",
              selected
                ? "border-ink-950 bg-ink-950 text-white"
                : cx("bg-white text-ink-800 hover:border-ink-500", invalid ? "border-red-400" : "border-ink-200"),
            )}
          >
            {tier.label}
          </button>
        );
      })}
    </div>
  );
}
