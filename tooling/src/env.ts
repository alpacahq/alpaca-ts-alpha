import { spawnSync } from "node:child_process";
import fs from "node:fs";

/**
 * openapi-generator-cli requires a working JDK. The Homebrew openjdk is
 * keg-only (not on PATH), and macOS ships a /usr/bin/java stub that is not a
 * real runtime, so we must check that `java -version` actually RUNS. We locate a
 * usable JDK and prepend it to PATH for this process only -- no global changes.
 */
export function javaRuns(): boolean {
  const r = spawnSync("java", ["-version"], { stdio: "ignore" });
  return r.status === 0;
}

export function ensureJavaOnPath(): void {
  if (javaRuns()) return;

  // macOS: /usr/libexec/java_home prints a real JDK home when one is registered.
  const jh = spawnSync("/usr/libexec/java_home", [], { encoding: "utf8" });
  if (jh.status === 0 && jh.stdout.trim()) {
    process.env.PATH = `${jh.stdout.trim()}/bin:${process.env.PATH}`;
    if (javaRuns()) return;
  }

  // Homebrew keg-only openjdk.
  for (const dir of ["/opt/homebrew/opt/openjdk/bin", "/usr/local/opt/openjdk/bin"]) {
    if (fs.existsSync(`${dir}/java`)) {
      process.env.PATH = `${dir}:${process.env.PATH}`;
      if (javaRuns()) return;
    }
  }

  throw new Error(
    "No working JDK found. openapi-generator needs Java. Install one, e.g.: brew install openjdk\n" +
      "(macOS ships a /usr/bin/java stub that is not a real runtime.)",
  );
}
