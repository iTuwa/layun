/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: '/index.html', destination: '/', permanent: true },
      { source: '/route/index.html', destination: '/', permanent: true },
    ];
  },
  async rewrites() {
    return [
      // Serve root HTML
      { source: '/', destination: '/index.html' },
      // Proxy endpoints (specific first)
      { source: '/secureproxy.php', destination: '/route/secureproxy' },
      { source: '/route/secureproxy.php', destination: '/route/secureproxy' },
      // Map /route index variants to root index to dedupe
      { source: '/route', destination: '/index.html' },
      { source: '/route/', destination: '/index.html' },
      { source: '/route/index.html', destination: '/index.html' },
      // Route all /route/* requests to root equivalents to avoid duplicate assets
      { source: '/route/:path*', destination: '/:path*' },
    ];
  },
};

module.exports = nextConfig;
