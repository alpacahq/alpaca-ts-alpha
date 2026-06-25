import { spawnSync, type SpawnSyncOptions } from "node:child_process";

/** Run a command inheriting stdio; throw on non-zero exit. */
export function run(cmd: string, args: string[], opts: SpawnSyncOptions = {}): void {
  const res = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`Command failed (exit ${res.status}): ${cmd} ${args.join(" ")}`);
  }
}

/** Run a command capturing stdout (trimmed); returns null on non-zero exit. */
export function capture(cmd: string, args: string[], opts: SpawnSyncOptions = {}): string | null {
  const res = spawnSync(cmd, args, { ...opts, encoding: "utf8" });
  if (res.status !== 0) return null;
  return String(res.stdout ?? "").trim();
}
