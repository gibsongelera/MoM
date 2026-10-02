/** @type {import('next').NextConfig} */
const nextConfig = {
  // Body size limit bump so audio/image uploads reach the AI route handlers.
  experimental: {
    serverActions: { bodySizeLimit: '25mb' },
  },
};

export default nextConfig;
