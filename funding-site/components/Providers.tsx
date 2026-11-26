"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/** Turns off animation for visitors who ask their device for reduced motion. */
export function Providers({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
