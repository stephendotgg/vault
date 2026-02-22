const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const path = require("path");

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || (dev ? "3000" : "51333"), 10);

// In production, set the directory to the app resources
const dir = dev ? process.cwd() : path.join(__dirname, "..");

const app = next({ dev, hostname, port, dir });
const handle = app.getRequestHandler();

async function startServer() {
  await app.prepare();
  
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error occurred handling", req.url, err);
      res.statusCode = 500;
      res.end("Internal server error");
    }
  });

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });

  return server;
}

module.exports = { startServer };

// If run directly
if (require.main === module) {
  startServer();
}
