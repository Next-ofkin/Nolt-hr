import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@nolt/form-schemas", "@nolt/api-client"],
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
