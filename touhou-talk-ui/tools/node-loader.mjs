import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TRY_EXTS = [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"];

function isRelativeOrAbsoluteSpecifier(specifier) {
  return (
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith("/") ||
    specifier.startsWith("file:")
  );
}

/**
 * Node.js ESM does not resolve extension-less TypeScript imports by default.
 * The app code relies on bundler resolution, but the tooling scripts run in Node directly.
 *
 * This loader:
 * - Adds `.ts`/`.tsx` resolution for extension-less relative imports.
 * - Allows importing `.json` without `assert { type: "json" }` by turning it into an ESM module.
 */
export async function resolve(specifier, context, defaultResolve) {
  // Let Node handle builtins and bare specifiers.
  if (!isRelativeOrAbsoluteSpecifier(specifier) || specifier.startsWith("file:")) {
    return defaultResolve(specifier, context, defaultResolve);
  }

  // file: URLs should be resolved by default.
  if (specifier.startsWith("file:")) {
    return defaultResolve(specifier, context, defaultResolve);
  }

  // If the specifier already has an extension, use default resolution.
  if (extname(specifier)) {
    return defaultResolve(specifier, context, defaultResolve);
  }

  const parentURL = context.parentURL ?? pathToFileURL(process.cwd() + "/").href;
  const parentPath = fileURLToPath(parentURL);
  const basePath = specifier.startsWith("/")
    ? resolvePath(process.cwd(), "." + specifier)
    : resolvePath(dirname(parentPath), specifier);

  for (const ext of TRY_EXTS) {
    const candidate = basePath + ext;
    if (existsSync(candidate)) {
      return { url: pathToFileURL(candidate).href, shortCircuit: true };
    }
  }

  // Support directory imports used by bundlers (e.g. "./foo" -> "./foo/index.ts").
  try {
    if (existsSync(basePath) && statSync(basePath).isDirectory()) {
      for (const ext of TRY_EXTS) {
        const candidate = resolvePath(basePath, "index" + ext);
        if (existsSync(candidate)) {
          return { url: pathToFileURL(candidate).href, shortCircuit: true };
        }
      }
    }
  } catch {
    // ignore
  }

  return defaultResolve(specifier, context, defaultResolve);
}

export async function load(url, context, defaultLoad) {
  if (url.endsWith(".json")) {
    const path = fileURLToPath(url);
    const raw = await readFile(path, "utf-8");
    const data = JSON.parse(raw);
    return {
      format: "module",
      source: `export default ${JSON.stringify(data)};`,
      shortCircuit: true,
    };
  }

  return defaultLoad(url, context, defaultLoad);
}
