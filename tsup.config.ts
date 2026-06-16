import { defineConfig } from "tsup";

/**
 * Dual ESM + CJS build.
 *
 * `tsc` remains the type authority (`npm run typecheck`); tsup/esbuild produces
 * the runtime artifacts so we get *native* ESM (`dist/index.mjs`) and CJS
 * (`dist/index.js`) without rewriting the generated source's extensionless
 * relative imports. Runtime dependencies (`ws`, `@msgpack/msgpack`) and Node
 * builtins are left external by default.
 */
export default defineConfig({
    // `rest` is a REST-only entrypoint that does not pull in the streaming
    // module (so `ws`/`@msgpack/msgpack` stay out of REST-only bundles).
    entry: ["src/index.ts", "src/rest.ts", "src/testing.ts"],
    format: ["cjs", "esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    // Single-file output per format (no shared chunks) for a clean package.
    splitting: false,
    treeshake: true,
    target: "es2020",
    outDir: "dist",
});
