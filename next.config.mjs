// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  // This is a logged-in tool app: every page is rendered per request, so Cache Components stays off.
  cacheComponents: false,
};

export default nextConfig;
