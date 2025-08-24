import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { normalizeForWire } from "./services/normalizeForWire";

// Set up transformers cache for MiDaS model persistence
process.env.TRANSFORMERS_CACHE =
  process.env.TRANSFORMERS_CACHE || "./.transformers-cache";

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: false, limit: "50mb" }));

// Serve public folder for depth/edge/gradient maps at root
app.use(express.static(path.join(process.cwd(), "public")));
// Serve files saved by the chat (/server/uploads) at /uploads
app.use("/uploads", express.static(path.join(process.cwd(), "server", "uploads")));
// Serve generated visual maps (so URLs like /depthmaps/foo.png work)
app.use("/depthmaps", express.static(path.join(process.cwd(), "server", "depthmaps")));
app.use("/edgemaps", express.static(path.join(process.cwd(), "server", "edgemaps")));
app.use("/gradientmaps", express.static(path.join(process.cwd(), "server", "gradientmaps")));


// Health check endpoint
app.get("/healthz", (_req: Request, res: Response) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// --- request/response logger for /api/* ---
app.use((req, res, next) => {
  const start = Date.now();
  const urlPath = req.path;
  let capturedJsonResponse: Record<string, any> | undefined;

  const originalResJson = res.json.bind(res);
  (res as any).json = function (bodyJson: any, ...args: any[]) {
    capturedJsonResponse = bodyJson;
    return originalResJson(bodyJson, ...args);
  };

  res.on("finish", () => {
    if (!urlPath.startsWith("/api")) return;
    const duration = Date.now() - start;
    let line = `${req.method} ${urlPath} ${res.statusCode} in ${duration}ms`;
    if (capturedJsonResponse) line += ` :: ${JSON.stringify(capturedJsonResponse)}`;
    if (line.length > 80) line = line.slice(0, 79) + "…";
    log(line);
  });

  next();
});

// --- guard: never let non-GET, non-/api requests fall into the SPA ---
app.use((req, res, next) => {
  if (req.method !== "GET" && !req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not found" });
  }
  next();
});

(async () => {
  // 1) Mount all API routes FIRST
  const server = await registerRoutes(app);

  // 2) Central error handler for API routes
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    // Re-throw so logs still show the stack
    throw err;
  });

  // 3) Frontend middleware (Vite in dev, static in prod)
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // 4) FINAL catch-all for SPA — GET ONLY and MUST be last
  app.get("*", (req, res, next) => {
    // Never intercept API URLs
    if (req.path.startsWith("/api/")) return next();

    // Let Vite/static middleware serve index.html (already mounted above).
    // If your static middleware doesn’t include a fallback, you can uncomment
    // one of the sendFile lines below and point it to your index.html.
    //
    // DEV example (if you want to force-send the file yourself):
    // return res.sendFile(path.join(process.cwd(), "client", "index.html"));
    //
    // PROD example:
    // return res.sendFile(path.join(process.cwd(), "client", "dist", "index.html"));

    // Otherwise, if the request reaches here, just pass through; the mounted
    // Vite/static middleware should resolve the asset/fallback.
    return next();
  });

  // 5) Start server
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    { port, host: "0.0.0.0", reusePort: true },
    () => log(`serving on port ${port}`)
  );
})();
