#!/usr/bin/env node
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import {
  access,
  chmod,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UID = os.userInfo().uid;
const LABEL = process.env.TASK_CREATOR_LAUNCHD_LABEL || "com.taskcreator.app";
const HOST = process.env.TASK_CREATOR_HOST || process.env.HOST || "127.0.0.1";
const PORT = process.env.TASK_CREATOR_PORT || process.env.PORT || "3000";
const STATE_DIR = path.join(ROOT, ".task-creator");
const LOG_DIR = path.join(STATE_DIR, "logs");
const DOMAIN_FILE = path.join(STATE_DIR, "launchd-domain");
const PLIST_DIR = path.join(os.homedir(), "Library", "LaunchAgents");
const PLIST_PATH = path.join(PLIST_DIR, `${LABEL}.plist`);
const STDOUT_LOG = path.join(LOG_DIR, "prod.out.log");
const STDERR_LOG = path.join(LOG_DIR, "prod.err.log");

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith("--")));
const command = args.find((arg) => !arg.startsWith("--")) || "up";

function usage() {
  console.log(`Usage:
  npm run prod                  Install, build, register launchd, start, health-check
  npm run prod -- --skip-install
  npm run prod -- --skip-build
  npm run prod:restart          Restart the loaded service
  npm run prod:status           Print launchd status
  npm run prod:logs             Tail service logs
  npm run prod:stop             Stop and unload the service

Environment:
  TASK_CREATOR_PORT=3000        Port Next listens on
  TASK_CREATOR_HOST=127.0.0.1   Host Next binds to
  TASK_CREATOR_LAUNCHD_LABEL=${LABEL}
`);
}

function die(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function parseDotenv(raw) {
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    const quote = value[0];
    if ((quote === "\"" || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
      if (quote === "\"") {
        value = value
          .replaceAll("\\n", "\n")
          .replaceAll("\\r", "\r")
          .replaceAll("\\t", "\t")
          .replaceAll("\\\"", "\"")
          .replaceAll("\\\\", "\\");
      }
    } else {
      const commentAt = value.search(/\s#/);
      if (commentAt >= 0) value = value.slice(0, commentAt).trim();
    }
    env[match[1]] = value;
  }
  return env;
}

async function readDotenvFiles() {
  const names = [".env", ".env.production", ".env.local", ".env.production.local"];
  const env = {};
  const found = [];
  for (const name of names) {
    try {
      const raw = await readFile(path.join(ROOT, name), "utf8");
      Object.assign(env, parseDotenv(raw));
      found.push(name);
    } catch (err) {
      if (err?.code !== "ENOENT") throw err;
    }
  }
  return { env, found };
}

function buildLaunchEnv(fileEnv) {
  const env = {
    NODE_ENV: "production",
    HOME: os.homedir(),
    USER: os.userInfo().username,
    PATH: process.env.PATH || "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    HOST,
    PORT,
  };

  for (const key of [
    "TASK_AGENT_MODE",
    "TASK_EMBED_ORIGINS",
    "JIRA_REDIRECT_URI",
    "JIRA_SECURE_COOKIE",
    "JIRA_DRAFT_ATTACHMENT_MAX_MB",
  ]) {
    const value = process.env[key] ?? fileEnv[key];
    if (value) env[key] = value;
  }

  return env;
}

function validateEnv(fileEnv, foundFiles, launchEnv) {
  const missing = [];
  for (const key of ["JIRA_CLIENT_ID", "JIRA_CLIENT_SECRET", "JIRA_COOKIE_SECRET"]) {
    if (!fileEnv[key]) missing.push(key);
  }

  const agentMode = launchEnv.TASK_AGENT_MODE || fileEnv.TASK_AGENT_MODE;
  if (
    agentMode !== "stub" &&
    !fileEnv.CLAUDE_CODE_OAUTH_TOKEN &&
    !fileEnv.ANTHROPIC_API_KEY
  ) {
    missing.push("CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY");
  }

  if (missing.length > 0) {
    die([
      "Production env is incomplete for launchd.",
      "",
      "launchd will not inherit variables exported in your SSH shell. Put secrets in an ignored env file such as .env.production.local.",
      foundFiles.length ? `Loaded env files: ${foundFiles.join(", ")}` : "Loaded env files: none",
      "",
      "Missing:",
      ...missing.map((key) => `  - ${key}`),
    ].join("\n"));
  }

  if (!fileEnv.SUPABASE_URL || !fileEnv.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      "Warning: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing; draft storage routes will return 503.",
    );
  }

  const redirect = launchEnv.JIRA_REDIRECT_URI || fileEnv.JIRA_REDIRECT_URI;
  if (!redirect) {
    console.warn(
      "Warning: JIRA_REDIRECT_URI is not set. Jira OAuth will use the request host; make sure the exact public callback URL is registered in Atlassian.",
    );
  } else if (redirect.startsWith("https://") && launchEnv.JIRA_SECURE_COOKIE !== "true" && fileEnv.JIRA_SECURE_COOKIE !== "true") {
    console.warn("Warning: JIRA_SECURE_COOKIE=true is recommended when serving through HTTPS.");
  }
}

function npmInvocation(extraArgs) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) {
    return [process.execPath, npmExecPath, ...extraArgs];
  }
  return ["/usr/bin/env", "npm", ...extraArgs];
}

function launchProgramArgs() {
  return npmInvocation(["run", "start", "--", "-H", HOST, "-p", PORT]);
}

function plistFor(env) {
  const programArgs = launchProgramArgs()
    .map((arg) => `    <string>${xmlEscape(arg)}</string>`)
    .join("\n");
  const envEntries = Object.entries(env)
    .map(
      ([key, value]) =>
        `    <key>${xmlEscape(key)}</key>\n    <string>${xmlEscape(value)}</string>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(LABEL)}</string>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(ROOT)}</string>
  <key>ProgramArguments</key>
  <array>
${programArgs}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${envEntries}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${xmlEscape(STDOUT_LOG)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(STDERR_LOG)}</string>
</dict>
</plist>
`;
}

function run(cmd, cmdArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, {
      cwd: ROOT,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    if (options.capture) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
    }
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 || options.allowFailure) {
        resolve({ code, stdout, stderr });
      } else {
        reject(new Error(`${cmd} ${cmdArgs.join(" ")} failed with exit code ${code}`));
      }
    });
  });
}

async function runNpm(extraArgs) {
  const [cmd, ...cmdArgs] = npmInvocation(extraArgs);
  await run(cmd, cmdArgs);
}

async function fileExists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function installedDomainCandidates() {
  const candidates = [];
  if (process.env.TASK_CREATOR_LAUNCHD_DOMAIN) {
    candidates.push(process.env.TASK_CREATOR_LAUNCHD_DOMAIN);
  }
  try {
    const stored = (await readFile(DOMAIN_FILE, "utf8")).trim();
    if (stored && stored !== "legacy") candidates.push(stored);
  } catch {
    // No stored domain yet.
  }
  candidates.push(`gui/${UID}`, `user/${UID}`);
  return [...new Set(candidates)];
}

async function bootoutAll() {
  for (const domain of await installedDomainCandidates()) {
    // Try both forms. Booting out by path can fail when the service was loaded
    // from an older plist path; booting out by label catches that case.
    await run("launchctl", ["bootout", `${domain}/${LABEL}`], {
      capture: true,
      allowFailure: true,
    });
    await run("launchctl", ["bootout", domain, PLIST_PATH], {
      capture: true,
      allowFailure: true,
    });
  }
  // Deprecated, but still useful as a compatibility cleanup for services
  // previously loaded with `launchctl load -w`.
  await run("launchctl", ["unload", "-w", PLIST_PATH], {
    capture: true,
    allowFailure: true,
  });
}

async function validatePlist() {
  const result = await run("plutil", ["-lint", PLIST_PATH], {
    capture: true,
    allowFailure: true,
  });
  if (result.code !== 0) {
    die([
      `Generated plist is invalid: ${PLIST_PATH}`,
      (result.stderr || result.stdout).trim(),
    ].join("\n"));
  }
}

async function legacyLoad() {
  await run("launchctl", ["unload", "-w", PLIST_PATH], {
    capture: true,
    allowFailure: true,
  });
  const result = await run("launchctl", ["load", "-w", PLIST_PATH], {
    capture: true,
    allowFailure: true,
  });
  if (result.code === 0) {
    await writeFile(DOMAIN_FILE, "legacy\n", "utf8");
    return true;
  }
  return `${result.stderr || result.stdout}`.trim() || "(none)";
}

async function bootstrapDiagnostics(lastError, legacyError) {
  const lines = [
    "Failed to bootstrap launchd service.",
    "",
    "Generated plist:",
    `  ${PLIST_PATH}`,
  ];

  const plistStat = await run("ls", ["-l", PLIST_PATH], {
    capture: true,
    allowFailure: true,
  });
  if (plistStat.stdout.trim()) lines.push(plistStat.stdout.trim());

  lines.push("", "Last bootstrap output:", lastError || "(none)");
  if (legacyError) {
    lines.push("", "Legacy load fallback output:", legacyError);
  }

  lines.push("", "launchctl domain probes:");
  for (const domain of await installedDomainCandidates()) {
    const result = await run("launchctl", ["print", domain], {
      capture: true,
      allowFailure: true,
    });
    const firstLine = (result.stderr || result.stdout).trim().split(/\r?\n/)[0] || "(no output)";
    lines.push(`  ${domain}: exit ${result.code}; ${firstLine}`);
  }

  return lines.join("\n");
}

async function bootstrap() {
  const preferred = await installedDomainCandidates();
  let lastError = null;
  for (const domain of preferred) {
    const result = await run("launchctl", ["bootstrap", domain, PLIST_PATH], {
      capture: true,
      allowFailure: true,
    });
    if (result.code === 0) {
      await writeFile(DOMAIN_FILE, `${domain}\n`, "utf8");
      await run("launchctl", ["enable", `${domain}/${LABEL}`], { allowFailure: true });
      await run("launchctl", ["kickstart", "-k", `${domain}/${LABEL}`], { allowFailure: true });
      return domain;
    }
    lastError = `${result.stderr || result.stdout}`.trim();
  }

  const legacyResult = await legacyLoad();
  if (legacyResult === true) return "legacy launchctl load";

  die(await bootstrapDiagnostics(lastError, legacyResult));
}

async function loadedDomain() {
  for (const domain of await installedDomainCandidates()) {
    const result = await run("launchctl", ["print", `${domain}/${LABEL}`], {
      capture: true,
      allowFailure: true,
    });
    if (result.code === 0) return { domain, output: result.stdout };
  }
  const legacy = await run("launchctl", ["list", LABEL], {
    capture: true,
    allowFailure: true,
  });
  if (legacy.code === 0) {
    return { domain: "legacy", output: legacy.stdout };
  }
  return null;
}

async function writePlist(env) {
  await mkdir(PLIST_DIR, { recursive: true });
  await mkdir(LOG_DIR, { recursive: true });
  await writeFile(PLIST_PATH, plistFor(env), "utf8");
  await chmod(PLIST_PATH, 0o644);
  await validatePlist();
}

async function healthCheck() {
  const healthHost = HOST === "0.0.0.0" || HOST === "::" ? "127.0.0.1" : HOST;
  const url = `http://${healthHost}:${PORT}/api/health`;
  const started = Date.now();
  let lastError = "";
  while (Date.now() - started < 45_000) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json?.ok === true) {
          console.log(`Health check passed: ${url}`);
          return;
        }
      }
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  die([
    `Service did not pass health check at ${url}.`,
    `Last error: ${lastError || "unknown"}`,
    "",
    `Logs:`,
    `  ${STDOUT_LOG}`,
    `  ${STDERR_LOG}`,
  ].join("\n"));
}

async function up() {
  if (process.platform !== "darwin") {
    die("npm run prod is macOS-only because it installs a launchd service.");
  }

  const { env: fileEnv, found } = await readDotenvFiles();
  const launchEnv = buildLaunchEnv(fileEnv);
  validateEnv(fileEnv, found, launchEnv);

  if (!flags.has("--skip-install")) {
    console.log("Installing dependencies with npm ci...");
    await runNpm(["ci"]);
  }

  if (!flags.has("--skip-build")) {
    console.log("Building Next.js production bundle...");
    await runNpm(["run", "build"]);
  }

  if (!(await fileExists(path.join(ROOT, ".next")))) {
    die("Missing .next build output. Run without --skip-build first.");
  }

  console.log(`Writing launchd plist: ${PLIST_PATH}`);
  await writePlist(launchEnv);

  console.log("Loading launchd service...");
  await bootoutAll();
  const domain = await bootstrap();
  console.log(`Loaded ${LABEL} in ${domain}.`);

  await healthCheck();
  console.log(`Service URL: http://${HOST}:${PORT}`);
  console.log(`Logs: npm run prod:logs`);
}

async function restart() {
  const loaded = await loadedDomain();
  if (!loaded) die(`Service is not loaded. Run npm run prod first.`);
  if (loaded.domain === "legacy") {
    const result = await legacyLoad();
    if (result !== true) die(`Failed to restart legacy launchd service:\n${result}`);
  } else {
    await run("launchctl", ["kickstart", "-k", `${loaded.domain}/${LABEL}`]);
  }
  await healthCheck();
}

async function stop() {
  await bootoutAll();
  console.log(`Stopped ${LABEL}.`);
}

async function status() {
  const loaded = await loadedDomain();
  if (!loaded) {
    console.log(`${LABEL} is not loaded.`);
    process.exitCode = 3;
    return;
  }
  console.log(loaded.output.trim());
}

async function logs() {
  await mkdir(LOG_DIR, { recursive: true });
  await writeFile(STDOUT_LOG, "", { flag: "a" });
  await writeFile(STDERR_LOG, "", { flag: "a" });
  await run("tail", ["-n", "80", "-f", STDOUT_LOG, STDERR_LOG]);
}

switch (command) {
  case "up":
    await up();
    break;
  case "restart":
    await restart();
    break;
  case "stop":
    await stop();
    break;
  case "status":
    await status();
    break;
  case "logs":
    await logs();
    break;
  case "help":
  case "--help":
  case "-h":
    usage();
    break;
  default:
    usage();
    die(`Unknown command: ${command}`);
}
