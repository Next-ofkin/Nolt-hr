import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@nolt/form-schemas", "@nolt/api-client"],
  async headers() {
    return [
      {
        source: "/auth/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/invitations/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_ORIGIN ?? "http://127.0.0.1:4000"}/api/:path*`,
      },
    ];
  },
};
export default config;
