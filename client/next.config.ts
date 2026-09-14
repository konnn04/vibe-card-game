import type { NextConfig } from 'next';
import * as path from 'path';
import * as fs from 'fs';

const rootEnv = path.resolve(__dirname, '../.env');
if (fs.existsSync(rootEnv) && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(rootEnv);
  } catch { }
}

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : 'standalone',

  env: {
    NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL || '',
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || '',
    NEXT_PUBLIC_DISCORD_CLIENT_ID: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || '',
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://*.discord.com https://discord.com;",
          },
        ],
      },
      {
        source: '/:path(card-texture|sfx|music-theme)/:file*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=600, stale-while-revalidate=604800',
          },
        ],
      },
    ];
  },

  async rewrites() {
    const backendUrl =
      process.env.INTERNAL_SERVER_URL ||
      process.env.SERVER_URL ||
      'http://127.0.0.1:3001';

    return [
      {
        source: '/socket.io/:path*',
        destination: `${backendUrl}/socket.io/:path*`,
      },
      {
        source: '/.proxy/backend/:path*',
        destination: `${backendUrl}/:path*`,
      },
      {
        source: '/api/backend/:path*',
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
