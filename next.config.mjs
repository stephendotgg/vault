/** @type {import('next').NextConfig} */
const nextConfig = {
  // Create optimized standalone production server
  output: "standalone",
  
  // Disable image optimization (uses Sharp which has native deps)
  images: {
    unoptimized: true,
  },

  // Keep native/Prisma packages as external requires so the bundler doesn't
  // try to inline the .node binary. At runtime they resolve from root
  // node_modules which is rebuilt for Electron's ABI.
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
};

export default nextConfig;
