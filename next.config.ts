import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pages read live application state from the database on every request,
  // so we use classic dynamic rendering rather than Cache Components.
  cacheComponents: false,
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
