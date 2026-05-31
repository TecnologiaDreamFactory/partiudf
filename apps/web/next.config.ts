import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@dream-driver/shared'],
  devIndicators: false,
  experimental: {
    devtoolSegmentExplorer: false,
  },
};

export default nextConfig;
