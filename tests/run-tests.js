#!/usr/bin/env node
/**
 * run-tests.js
 *
 * Simple test runner to execute analytics and replay tests sequentially.
 * Exits with non-zero code if any test fails.
 */

const { spawnSync } = require("child_process");
const path = require("path");

function runTest(scriptRelPath, label) {
  const scriptPath = path.resolve(__dirname, scriptRelPath);
  console.log(`\n=== Running ${label} ===`);
  const result = spawnSync(process.execPath, [scriptPath], {
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    console.error(`Error executing ${label}:`, result.error);
    return 1;
  }
  if (typeof result.status === "number" && result.status !== 0) {
    console.error(`${label} failed with exit code ${result.status}`);
    return result.status;
  }

  console.log(`=== ${label} passed ===\n`);
  return 0;
}

function main() {
  const tests = [
    { path: "./analytics.test.js", label: "Analytics Tests" },
    { path: "./replay.test.js", label: "Replay Tests" },
  ];

  let failed = 0;
  for (const t of tests) {
    const code = runTest(t.path, t.label);
    if (code !== 0) {
      failed = code || 1;
      break;
    }
  }

  if (failed !== 0) {
    console.error("\nSome tests failed.");
    process.exit(failed);
  }

  console.log("\nAll tests passed.");
  process.exit(0);
}

if (require.main === module) {
  main();
}
