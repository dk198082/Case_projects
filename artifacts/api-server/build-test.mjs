import { build } from "esbuild";

await build({
  entryPoints: ["src/**/*.test.ts"],
  outdir: "dist-tests",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["node:*"],
  packages: "external",
  sourcemap: true,
  logLevel: "info",
});