/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // Ensure API routes use Node.js runtime for Buffer support
  serverExternalPackages: ['@prisma/client', 'bullmq'],
};

module.exports = nextConfig;
