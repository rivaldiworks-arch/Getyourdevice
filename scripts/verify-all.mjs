import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));
const scripts = readdirSync(dir).filter(name => /^verify-.+\.mjs$/.test(name) && name !== "verify-all.mjs").sort();
const failed = [];
for (const name of scripts) {
  const result = spawnSync(process.execPath, [`${dir}${name}`], { encoding: "utf8" });
  if (result.status === 0) {
    console.log(`PASS ${name}`);
  } else {
    failed.push(name);
    console.log(`FAIL ${name}\n${(result.stderr || result.stdout).trim()}\n`);
  }
}
console.log(`\n${scripts.length - failed.length}/${scripts.length} verification scripts passed.`);
if (failed.length) process.exit(1);
