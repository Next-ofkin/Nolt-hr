import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@nolt/form-schemas", "@nolt/api-client"],
  async headers() {
    return [
      {
        source: "/external/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
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
    const origin = new URL(process.env.API_ORIGIN ?? "http://127.0.0.1:4000");
    if (
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    )
      throw new Error(
        "API_ORIGIN must be an origin without credentials, paths or query parameters.",
      );
    if (
      process.env.DEPLOYMENT_ENV === "staging" &&
      origin.protocol !== "https:"
    )
      throw new Error("Hosted frontend staging requires an HTTPS API_ORIGIN.");
    return [
      {
        source: "/api/:path*",
        destination: `${origin.origin}/api/:path*`,
      },
    ];
  },
};
export default config;
