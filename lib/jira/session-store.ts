import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { readConfig } from "./config";

export type StoredSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  accountId: string;
  email?: string;
};

type Envelope = Record<string, StoredSession>;

const STORE_DIR = ".task-creator";
const STORE_FILE = "jira-sessions.enc";

function storePath(): string {
  return path.join(process.cwd(), STORE_DIR, STORE_FILE);
}

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function encryptJson(obj: unknown, secret: string): Buffer {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const pt = Buffer.from(JSON.stringify(obj), "utf8");
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
}

function decryptJson<T>(buf: Buffer, secret: string): T {
  if (buf.length < 12 + 16 + 1) throw new Error("store file too short");
  const key = deriveKey(secret);
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return JSON.parse(pt.toString("utf8")) as T;
}

// No in-memory cache — disk is the single source of truth. The previous
// module-level `let cache` desynchronised under Next.js dev HMR (each
// reloaded module got its own empty cache while the disk was current),
// producing the "the same cookie says signed-in on /signin but not-signed-in
// on / " loop. The file is tiny (<10 sessions, well under a kilobyte each),
// so re-reading per request is free.
async function ensureDir(): Promise<void> {
  await fs.mkdir(path.dirname(storePath()), { recursive: true });
}

async function readEnvelope(): Promise<Envelope> {
  const cfg = readConfig();
  try {
    const buf = await fs.readFile(storePath());
    return decryptJson<Envelope>(buf, cfg.cookieSecret);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.warn("[jira/session-store] failed to read store, starting fresh:", err);
    }
    return {};
  }
}

async function writeEnvelope(env: Envelope): Promise<void> {
  const cfg = readConfig();
  await ensureDir();
  const buf = encryptJson(env, cfg.cookieSecret);
  // Atomic-ish write: write to temp then rename.
  const finalPath = storePath();
  const tmpPath = finalPath + ".tmp";
  await fs.writeFile(tmpPath, buf);
  await fs.rename(tmpPath, finalPath);
}

function newSessionId(): string {
  return randomBytes(24).toString("base64url");
}

export async function createStoredSession(session: StoredSession): Promise<string> {
  const env = await readEnvelope();
  const id = newSessionId();
  env[id] = session;
  await writeEnvelope(env);
  return id;
}

export async function getStoredSession(id: string): Promise<StoredSession | null> {
  if (!id) return null;
  const env = await readEnvelope();
  return env[id] ?? null;
}

export async function updateStoredSession(
  id: string,
  session: StoredSession,
): Promise<void> {
  if (!id) return;
  const env = await readEnvelope();
  if (!env[id]) return;
  env[id] = session;
  await writeEnvelope(env);
}

export async function deleteStoredSession(id: string): Promise<void> {
  if (!id) return;
  const env = await readEnvelope();
  if (!env[id]) return;
  delete env[id];
  await writeEnvelope(env);
}
