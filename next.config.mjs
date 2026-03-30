/** @type {import('next').NextConfig} */
const nextConfig = {
  // Create optimized standalone production server
  output: "standalone",
  
  // Disable image optimization (uses Sharp which has native deps)
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
