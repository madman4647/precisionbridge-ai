import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
