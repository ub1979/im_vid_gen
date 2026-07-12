// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// NextConfig : Next.js configuration with allowed dev origins and CSP headers
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import type { NextConfig } from "next";
// =============================================================================

// =============================================================================
// Next.js configuration object
// =============================================================================
const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.24", "192.168.0.159", "127.0.0.1"],

  // =====================================
  // Custom security headers
  // =====================================
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "media-src 'self' blob:",
              "connect-src 'self'",
              "font-src 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;

// =============================================================================
// =============================================================================
