const { createServer } = require("http");
const { parse } = require("url");
const path = require("path");

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || (dev ? "3000" : "51333"), 10);

async function startServer() {
  if (dev) {
    // Development: Use Next.js dev server API
    const next = require("next");
    const dir = process.cwd();
    const app = next({ dev, hostname, port, dir });
    const handle = app.getRequestHandler();
    
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
  } else {
    // Production: Use the standalone server
    const standaloneDir = path.join(__dirname, "..", ".next", "standalone");
    
    // Set environment variables expected by standalone server
    process.env.PORT = port.toString();
    process.env.HOSTNAME = hostname;
    
    // Intercept the http module so we can capture the server instance created by
    // the Next.js standalone server.js in order to close it cleanly on quit.
    const http = require("http");
    const originalListen = http.Server.prototype.listen;
    let capturedServer = null;
    http.Server.prototype.listen = function (...args) {
      capturedServer = this;
      // Restore immediately so we only intercept the first call
      http.Server.prototype.listen = originalListen;
      return originalListen.apply(this, args);
    };

    // Load and run the standalone server
    // The standalone server.js does process.chdir(__dirname) internally
    require(path.join(standaloneDir, "server.js"));
    
    // Wait for server to be ready
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 100; // 10 seconds max
      
      const check = () => {
        attempts++;
        fetch(`http://${hostname}:${port}`)
          .then(() => {
            console.log(`> Production server ready on http://${hostname}:${port}`);
            resolve({
              close: () => {
                if (capturedServer) {
                  try { capturedServer.close(); } catch { /* ignore */ }
                }
              },
            });
          })
          .catch(() => {
            if (attempts >= maxAttempts) {
              reject(new Error("Server failed to start in time"));
            } else {
              setTimeout(check, 100);
            }
          });
      };
      
      setTimeout(check, 300);
    });
  }
}

module.exports = { startServer };

// If run directly
if (require.main === module) {
  startServer().catch(console.error);
}
