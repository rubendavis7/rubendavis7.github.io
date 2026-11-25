"use client";

import type { InputHTMLAttributes } from "react";
import { formatNumber, parseDollars } from "@/lib/format";
import { cx } from "./ui";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "size" | "max"> & {
  /** Whole dollars, or null when the field is empty. */
  value: number | null;
  onValueChange: (value: number | null) => void;
  /** Typing a larger number snaps to this. */
  max?: number;
  size?: "md" | "xl";
  /** Shown after the number, e.g. "+" when the value is at the top of the range. */
  suffix?: string;
  invalid?: boolean;
};

/**
 * Dollar input. Shows commas as you type and reports a plain number.
 * Clearing the field reports null.
 */
export function MoneyInput({ value, onValueChange, max, size = "md", suffix, invalid, className, ...rest }: Props) {
  const text = value === null ? "" : formatNumber(value);
  const xl = size === "xl";

  return (
    <div
      className={cx(
        "flex items-center rounded-2xl border-2 bg-white transition-colors focus-within:border-brand-600",
        invalid ? "border-red-500" : "border-ink-200",
        xl ? "h-16 px-4 sm:h-20 sm:px-5" : "h-12 px-3.5",
        className,
      )}
    >
      <span aria-hidden="true" className={cx("font-bold text-ink-400", xl ? "text-2xl sm:text-4xl" : "text-base")}>
        $
      </span>
      <input
        {...rest}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          const parsed = parseDollars(e.target.value);
          onValueChange(parsed !== null && max !== undefined && parsed > max ? max : parsed);
        }}
        className={cx(
          "w-full min-w-0 bg-transparent pl-1.5 font-bold tabular-nums text-ink-950 outline-none placeholder:font-medium placeholder:text-ink-300",
          xl ? "text-3xl tracking-tight sm:text-5xl" : "text-base",
        )}
      />
      {suffix && value !== null && (
        <span aria-hidden="true" className={cx("font-bold text-ink-400", xl ? "text-2xl sm:text-4xl" : "text-base")}>
          {suffix}
        </span>
      )}
    </div>
  );
}
