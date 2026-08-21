#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tsxBin = resolve(rootDir, "node_modules", "tsx", "dist", "cli.mjs");
const cli = resolve(rootDir, "scripts", "quorummind-cli.ts");
const result = spawnSync(process.execPath, [tsxBin, cli, ...process.argv.slice(2)], {
  cwd: rootDir,
  stdio: "inherit",
  env: process.env
});

if (result.error) {
  console.error(result.error.message);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 0;
}
