import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// Load the repo-root .env so vars defined there (BFF_URL, etc.) are visible
// to next.config.ts and to the dev/prod runtime. Next reads `apps/frontend/.env`
// after this — local overrides still win when present.
const here = path.dirname(fileURLToPath(import.meta.url));
loadEnvConfig(path.resolve(here, "../.."));

const BFF_URL = process.env.BFF_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

const nextConfig: NextConfig = {
  // No rewrites needed, API is now local at /api/copilotkit
};

export default nextConfig;
