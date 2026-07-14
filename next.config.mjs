/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Allow cross-origin requests from the local network hostname
  allowedDevOrigins: ['tacocat', '172.21.41.57'],
  // Turbopack configuration
  // When accessed over a network, we need to ensure HMR uses the correct host
  turbopack: {
    // Configure HMR for Turbopack if needed
  },
  // Allow the dev server to be accessible from the network
  // and handle HMR WebSocket connections correctly
  experimental: {
    // Increase the body size limit for Server Actions and potentially other App Router requests
    // Although standard route handlers don't have a direct config, this can help in some versions
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      }
    }
    return config
  },
}

export default nextConfig
