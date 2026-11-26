"use client";

import { TIB_TIERS, type TibId } from "@/lib/calculator";

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
            data-invalid={invalid && !selected ? "true" : undefined}
            // Colors live in .pill-option (app/globals.css): solid, instant, no touch hover.
            className="pill-option h-11 rounded-full px-4 text-sm whitespace-nowrap"
          >
            {tier.label}
          </button>
        );
      })}
    </div>
  );
}
