/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    // Reuse a dashboard page visited in the last 30s instead of re-rendering
    // it on every tab switch. Saving anything still refreshes it immediately
    // (server actions revalidate their path).
    staleTimes: {
      dynamic: 30,
    },
  },
};

export default nextConfig;
