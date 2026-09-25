import "dotenv/config";

import { spawn } from "node:child_process";
import { resolve } from "node:path";

const secret = process.env.CRON_SECRET;
if (!secret) throw new Error("CRON_SECRET is required to run local workers.");

const nextBin = resolve("node_modules/next/dist/bin/next");
const app = spawn(process.execPath, [nextBin, "dev", "--turbopack"], { stdio: "inherit", env: process.env });
let stopped = false;

async function invoke(path) {
  const response = await fetch(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(295_000),
  });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

async function waitForServer() {
  while (!stopped) {
    try {
      const response = await fetch("http://localhost:3000", { signal: AbortSignal.timeout(1_500) });
      if (response.ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
  }
}

async function workerLoop() {
  await waitForServer();
  while (!stopped) {
    try {
      const result = await invoke("/api/internal/workers/dispatch");
      const claimed = Number(result.data?.pool?.claimed ?? 0);
      if (claimed) console.info(`[local-workers] processed ${claimed} queued item${claimed === 1 ? "" : "s"}`);
    } catch (error) {
      console.error("[local-workers] cycle failed", error instanceof Error ? error.message : error);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 5_000));
  }
}

void workerLoop();

function shutdown(signal) {
  stopped = true;
  if (!app.killed) app.kill(signal);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
app.on("exit", (code) => process.exit(code ?? 0));
