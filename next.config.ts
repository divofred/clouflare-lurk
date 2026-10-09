import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Let OpenNext resolve Postgres.js's `workerd` export. Bundling its Node
  // implementation in Next hides that choice and causes Worker TCP timeouts.
  serverExternalPackages: ["postgres"],
  typedRoutes: false,
  // PostHog is reached through /ingest (see src/instrumentation-client.ts). Its
  // API paths end in a slash, which Next would otherwise redirect away.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: "https://us-assets.i.posthog.com/static/:path*" },
      { source: "/ingest/:path*", destination: "https://us.i.posthog.com/:path*" },
    ];
  },
};

export default nextConfig;
