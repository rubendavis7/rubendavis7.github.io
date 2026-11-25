import Image from "next/image";
import type { ReactNode } from "react";
import { cx } from "./ui";

/**
 * A photo frame. Pass `src` (a file in /public) to show a real photo.
 * With no `src` it draws an abstract placeholder so the layout still works.
 */
export function PhotoSlot({
  src,
  alt = "",
  tone = "dark",
  className,
  children,
}: {
  src?: string;
  alt?: string;
  tone?: "dark" | "brand";
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cx("relative isolate overflow-hidden", className)}>
      {src ? (
        <Image src={src} alt={alt} fill sizes="(min-width: 1024px) 1100px, 100vw" className="-z-20 object-cover" />
      ) : (
        <div
          aria-hidden="true"
          className={cx(
            "absolute inset-0 -z-20",
            tone === "dark"
              ? "bg-[linear-gradient(135deg,#0c1628,#172238_45%,#065f46)]"
              : "bg-[linear-gradient(135deg,#064e3b,#047857_50%,#0c1628)]",
          )}
        >
          <svg className="absolute inset-0 h-full w-full opacity-30" preserveAspectRatio="xMidYMid slice" viewBox="0 0 800 400">
            <defs>
              <pattern id="slot-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M40 0H0V40" fill="none" stroke="#fff" strokeOpacity=".25" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="800" height="400" fill="url(#slot-grid)" />
            <circle cx="640" cy="90" r="150" fill="#34d399" fillOpacity=".35" />
            <circle cx="140" cy="380" r="190" fill="#10b981" fillOpacity=".25" />
            <path d="M0 330 200 250 360 300 560 180 800 240V400H0Z" fill="#060d1a" fillOpacity=".55" />
          </svg>
          <span className="absolute bottom-2 right-3 rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/80">
            Placeholder image
          </span>
        </div>
      )}
      {children}
    </div>
  );
}
