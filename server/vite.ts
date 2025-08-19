// server/vite.ts
import type { Express, Request, Response, NextFunction } from "express";
import type { Server as HttpServer } from "http";
import fs from "fs/promises";
import path from "path";

/**
 * In dev, wire Vite in middleware mode.
 * IMPORTANT: The SPA fallback is GET-only and mounted LAST,
 * so POST /api/... can never be swallowed by index.html.
 */
export async function setupVite(app: Express, _server: HttpServer) {
  // Lazy-import Vite only in dev
  const vite = await (await import("vite")).createServer({
    root: path.join(process.cwd(), "client"),
    server: { middlewareMode: true },
    appType: "custom",
  });

  // Vite middleware first (serves assets, HMR, etc.)
  app.use(vite.middlewares);

  // ---- GET-only SPA fallback (MUST BE LAST in setupVite) ----
  app.get("*", async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Never handle API routes here
      if (req.path.startsWith("/api")) return next();

      const clientRoot = path.join(process.cwd(), "client");
      const indexHtmlPath = path.join(clientRoot, "index.html");

      let template = await fs.readFile(indexHtmlPath, "utf-8");
      // Let Vite transform index.html (HMR, env injection, etc.)
      template = await vite.transformIndexHtml(req.originalUrl, template);

      res.status(200).type("text/html").send(template);
    } catch (err) {
      next(err);
    }
  });
}

/**
 * In prod, serve the built client from /dist/client with a GET-only fallback.
 */
export function serveStatic(app: Express) {
  const clientDist = path.join(process.cwd(), "dist", "client");

  // Serve built static assets (do NOT auto-index)
  app.use(
    (await import("express")).default.static(clientDist, {
      index: false,
      fallthrough: true,
    })
  );

  // ---- GET-only SPA fallback (MUST BE LAST in serveStatic) ----
  app.get("*", (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(clientDist, "index.html"));
  });
}
