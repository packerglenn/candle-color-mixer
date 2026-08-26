import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, isAbsolute, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = normalize(join(fileURLToPath(new URL(".", import.meta.url)), ".."));
const argument = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const port = Number(argument("port") || process.env.PORT || 4173);
const requestedBase = argument("base") || "/";
const basePath = requestedBase === "/"
  ? "/"
  : `/${requestedBase.replace(/^\/+|\/+$/g, "")}/`;
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

createServer((request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  if (basePath !== "/" && requestPath === basePath.slice(0, -1)) {
    response.writeHead(308, { Location: basePath }).end();
    return;
  }
  if (!requestPath.startsWith(basePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    return;
  }
  const scopedPath = basePath === "/" ? requestPath : `/${requestPath.slice(basePath.length)}`;
  const relativePath = scopedPath === "/" ? "index.html" : scopedPath.replace(/^\/+/, "");
  const path = normalize(join(root, relativePath));
  const pathFromRoot = relative(root, path);

  if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    if (!statSync(path).isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": mimeTypes[extname(path)] || "application/octet-stream",
    });
    createReadStream(path).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`Candle Color Mixer running at http://127.0.0.1:${port}${basePath}\n`);
});
