import type { MetadataRoute } from "next";
import { BRAND } from "@/config/brand";

// Install metadata with the placeholder tile (dark ground, readable on light and dark home screens).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.name}: ${BRAND.slogan.replace(/\.$/, "")}`,
    short_name: BRAND.name,
    description: `Approved project memory for AI assistants, with a change log on ${BRAND.chainName}.`,
    start_url: "/",
    display: "standalone",
    background_color: "#050607",
    theme_color: "#050607",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
