import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (local zero-config DB) ships WASM + data files; keep it out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite", "@paypal/agent-toolkit"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
