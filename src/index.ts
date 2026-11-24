#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { HELP, parseConfig } from "./config.js";
import { createServer } from "./server.js";
import { NAME, VERSION } from "./version.js";

async function main(): Promise<void> {
  const cfg = parseConfig(process.argv.slice(2), process.env);
  if (cfg === "help") return void process.stdout.write(HELP);
  if (cfg === "version") return void process.stdout.write(`${NAME} ${VERSION}\n`);

  const { server, fetcher } = createServer(cfg);
  let closing = false;
  const shutdown = async (): Promise<void> => {
    if (closing) return;
    closing = true;
    await server.close().catch(() => {});
    await fetcher.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.stdin.on("close", shutdown);
  await server.connect(new StdioServerTransport());
  console.error(`${NAME} ${VERSION} ready${cfg.allowPrivate ? " (private addresses ALLOWED)" : ""}`);
}

main().catch((err: unknown) => {
  console.error(`${NAME}: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
