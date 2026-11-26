"use client";

import { useEffect, useState } from "react";

/* Renders children only after hydration (the app reads browser storage and the wallet). A plain note is shown before that. */
export function ClientOnly({ children, fallback = null }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return <>{ready ? children : fallback}</>;
}
