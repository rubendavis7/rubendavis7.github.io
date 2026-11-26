/** Formatting helpers shared by the calculator, the apply form and the admin table. */

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const plain = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** 12500 -> "$12,500" */
export function formatUSD(value: number): string {
  return usd.format(Math.round(value));
}

/** 12500 -> "12,500" (no currency symbol, for use inside inputs) */
export function formatNumber(value: number): string {
  return plain.format(Math.round(value));
}

/**
 * Pulls a whole-dollar number out of whatever the user typed.
 * "$1,250,000" -> 1250000, "" -> null, "abc" -> null.
 * Anything after a decimal point is ignored.
 */
export function parseDollars(text: string): number | null {
  const whole = text.split(".")[0] ?? "";
  const digits = whole.replace(/\D/g, "").slice(0, 12);
  if (digits === "") return null;
  return Number(digits);
}

/** "5551234567" -> "(555) 123-4567". Partial input is formatted as far as it goes. */
export function formatPhone(text: string): string {
  let d = text.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  d = d.slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
