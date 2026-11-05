// Resolves the "@/..." import alias used in src/ so tests can import TypeScript sources directly.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const srcDir = fileURLToPath(new URL("../src/", import.meta.url));

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = srcDir + specifier.slice(2);
    for (const candidate of [`${base}.ts`, `${base}/index.ts`, base]) {
      if (existsSync(candidate) && candidate.endsWith(".ts")) {
        return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
