#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const MIN_PYTHON = [3, 10];
const MANAGED_PYTHON = "3.12";
const UV_VERSION = "0.9.18";

function commandVersion(command, prefix = []) {
  const result = spawnSync(command, [...prefix, "-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const match = result.stdout.trim().match(/^(\d+)\.(\d+)$/);
  return match ? { command, prefix, version: match.slice(1).map(Number) } : null;
}

function findPython() {
  const candidates = process.platform === "win32"
    ? [["py", ["-3"]], ["python3", []], ["python", []]]
    : [["python3", []], ["python", []]];
  for (const [command, prefix] of candidates) {
    const found = commandVersion(command, prefix);
    if (found && (found.version[0] > MIN_PYTHON[0] || found.version[1] >= MIN_PYTHON[1])) return found;
  }
  return null;
}

function runtimeDir() {
  return path.resolve(process.env.RJMR_RUNTIME_DIR || path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "realistic-job-market-research"));
}

function executable(name) {
  return path.join(runtimeDir(), "bin", process.platform === "win32" ? `${name}.exe` : name);
}

function commandExists(command, args = ["--version"]) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return result.status === 0;
}

async function installUv() {
  const binDir = path.dirname(executable("uv"));
  fs.mkdirSync(binDir, { recursive: true });
  const windows = process.platform === "win32";
  const url = `https://astral.sh/uv/${UV_VERSION}/install.${windows ? "ps1" : "sh"}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`uv installer download failed: HTTP ${response.status}`);
  const installer = await response.text();
  const env = { ...process.env, UV_UNMANAGED_INSTALL: binDir, UV_NO_MODIFY_PATH: "1" };
  const result = windows
    ? spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "-"], { input: installer, encoding: "utf8", env })
    : spawnSync("sh", [], { input: installer, encoding: "utf8", env });
  if (result.status !== 0 || !fs.existsSync(executable("uv"))) throw new Error(`uv install failed\n${result.stderr || result.stdout}`);
  return executable("uv");
}

async function managedUv() {
  const bundled = executable("uv");
  if (fs.existsSync(bundled)) return bundled;
  if (!process.env.RJMR_FORCE_BUNDLED_UV && commandExists("uv")) return "uv";
  return installUv();
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--self-test") {
    const found = findPython();
    if (found) {
      console.log(`PYTHON_RUNNER_PASS system-${found.version.join(".")}`);
      return;
    }
    const uv = await managedUv();
    const env = { ...process.env, UV_CACHE_DIR: path.join(runtimeDir(), "uv-cache"), UV_PYTHON_INSTALL_DIR: path.join(runtimeDir(), "python") };
    const result = spawnSync(uv, ["run", "--python", MANAGED_PYTHON, "--managed-python", "--no-project", "python", "-c", "print('PYTHON_RUNNER_PASS managed')"], { encoding: "utf8", env });
    if (result.status !== 0) throw new Error(result.stderr || "managed Python self-test failed");
    process.stdout.write(result.stdout);
    return;
  }
  if (!args.length) throw new Error("Usage: python-runner.mjs SCRIPT.py [ARGS...]");
  const script = path.resolve(args.shift());
  if (!fs.existsSync(script)) throw new Error(`Python script not found: ${script}`);
  const system = process.env.RJMR_FORCE_MANAGED_PYTHON ? null : findPython();
  if (system) {
    const result = spawnSync(system.command, [...system.prefix, script, ...args], { stdio: "inherit" });
    process.exit(result.status ?? 1);
  }
  const uv = await managedUv();
  const env = {
    ...process.env,
    UV_CACHE_DIR: path.join(runtimeDir(), "uv-cache"),
    UV_PYTHON_INSTALL_DIR: path.join(runtimeDir(), "python")
  };
  const result = spawnSync(uv, ["run", "--python", MANAGED_PYTHON, "--managed-python", "--no-project", script, ...args], { stdio: "inherit", env });
  process.exit(result.status ?? 1);
}

main().catch(error => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});
