import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  sourcemap: false,
  dts: false,
  // `node:sqlite` only exists WITH the prefix; tsup's default of stripping `node:` would emit
  // `import "sqlite"` and break the published binary.
  removeNodeProtocol: false,
});
