import createNextIntlPlugin from 'next-intl/plugin'
import { setupDevPlatform } from '@cloudflare/next-on-pages/next-dev';
import type { NextConfig } from 'next'

async function setup() {
  if (process.env.NODE_ENV === 'development') {
    await setupDevPlatform()
  }
}

setup()

const withNextIntl = createNextIntlPlugin('./app/i18n/request.ts')

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: '*.googleusercontent.com',
      }
    ],
  },
  webpack(config) {
    config.resolve = {
      ...(config.resolve ?? {}),
      symlinks: true,
    }

    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      {
        module: /@cloudflare\/next-on-pages/,
        message: /not supported in the Edge Runtime/,
      },
      {
        module: /next-auth\/node_modules\/jose/,
        message: /not supported in the Edge Runtime/,
      },
    ]

    return config
  },
};

export default withNextIntl(nextConfig)
