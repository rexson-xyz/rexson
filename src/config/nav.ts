import { BRAND } from "@/config/brand";

export const NAV = [
  { href: "/app", label: "App" },
  { href: "/docs", label: "Docs" },
  { href: "/ledger", label: "Ledger" },
  { href: "/token", label: BRAND.symbol },
] as const;

/** Every public route, for the sitemap. */
export const ROUTES = ["/", "/app", "/docs", "/ledger", "/token"] as const;
