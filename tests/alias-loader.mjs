// Resolves the "@/..." import alias and extensionless relative imports used in src/,
// so tests can import TypeScript sources directly (Node's built-in type stripping).
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const srcDir = fileURLToPath(new URL("../src/", import.meta.url));

function tsCandidate(base) {
  for (const candidate of [`${base}.ts`, `${base}/index.ts`, base]) {
    if (existsSync(candidate) && candidate.endsWith(".ts")) return pathToFileURL(candidate).href;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const found = tsCandidate(srcDir + specifier.slice(2));
    if (found) return nextResolve(found, context);
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.endsWith(".ts")) {
    const found = tsCandidate(fileURLToPath(new URL(specifier, context.parentURL)));
    if (found) return nextResolve(found, context);
  }
  return nextResolve(specifier, context);
}
