import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { VERIFIED, type VerifyKey } from "@/lib/site-config";

/** Joins class names, skipping falsy ones. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * Small amber [VERIFY] tag. Renders only while the matching flag in
 * lib/site-config.ts (VERIFIED) is false.
 */
export function VerifyTag({ k, className }: { k: VerifyKey; className?: string }) {
  if (VERIFIED[k]) return null;
  return (
    <span
      className={cx(
        "inline-block rounded bg-amber-200 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase leading-none tracking-wide text-amber-950",
        className,
      )}
      title="Placeholder. Confirm this before launch."
    >
      Verify
    </span>
  );
}

const pill =
  "inline-flex appearance-none items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-60";

const variants = {
  primary: "bg-brand-700 text-white hover:bg-brand-800",
  /** Primary on dark backgrounds. */
  bright: "bg-brand-400 text-ink-950 hover:bg-brand-300",
  outline: "border-2 border-ink-900 text-ink-900 hover:bg-ink-900 hover:text-white",
  outlineLight: "border-2 border-white/70 text-white hover:bg-white hover:text-ink-950",
  ghost: "text-ink-700 hover:bg-ink-100",
} as const;

const sizes = {
  sm: "h-10 px-4 text-sm",
  md: "h-12 px-6 text-base",
  lg: "h-14 px-8 text-base sm:text-lg",
} as const;

export function pillClass(variant: keyof typeof variants = "primary", size: keyof typeof sizes = "md", extra?: string) {
  return cx(pill, variants[variant], sizes[size], extra);
}

export function PillLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: keyof typeof variants; size?: keyof typeof sizes }) {
  return <Link {...props} className={pillClass(variant, size, className)} />;
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</div>;
}

export function SectionHeading({
  eyebrow,
  title,
  children,
  center,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  center?: boolean;
}) {
  return (
    <div className={cx("max-w-2xl", center && "mx-auto text-center")}>
      {eyebrow && <p className="text-sm font-bold uppercase tracking-widest text-brand-700">{eyebrow}</p>}
      <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ink-950 text-balance sm:text-4xl">{title}</h2>
      {children && <p className="mt-4 text-lg text-ink-600">{children}</p>}
    </div>
  );
}

/** Brand mark: a delta. Original placeholder artwork. */
export function Logo({ light }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 36 36" className="h-9 w-9 shrink-0" aria-hidden="true">
        <rect width="36" height="36" rx="10" className="fill-brand-700" />
        <path d="M18 8.5 28 26.5H8L18 8.5Zm0 6.6-4.6 8.2h9.2L18 15.1Z" fill="#fff" fillRule="evenodd" />
      </svg>
      <span className={cx("text-base font-extrabold tracking-tight max-[419px]:sr-only", light ? "text-white" : "text-ink-950")}>
        Delta Capital
      </span>
    </span>
  );
}
