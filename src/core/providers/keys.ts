import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { Provider } from "../../contracts/state.js";

type KeyStoreShape = Partial<Record<Provider, string>>;

const FILE = join(".otobot", "keys.enc.json");

function deriveKey(): Buffer {
  const secret = process.env.OTOBOT_MASTER_KEY ?? `${process.env.USERNAME ?? "user"}-otobot`;
  return scryptSync(secret, "otobot-salt", 32);
}

function encrypt(text: string): string {
  const iv = randomBytes(12);
  const key = deriveKey();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decrypt(encoded: string): string {
  const data = Buffer.from(encoded, "base64");
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const payload = data.subarray(28);
  const key = deriveKey();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
  return decrypted.toString("utf8");
}

async function loadStore(projectRoot: string): Promise<KeyStoreShape> {
  const path = join(projectRoot, FILE);
  try {
    const raw = await readFile(path, "utf8");
    const encrypted = JSON.parse(raw) as KeyStoreShape;
    const out: KeyStoreShape = {};
    for (const [provider, value] of Object.entries(encrypted)) {
      if (value) {
        out[provider as Provider] = decrypt(value);
      }
    }
    return out;
  } catch {
    return {};
  }
}

async function saveStore(projectRoot: string, store: KeyStoreShape): Promise<void> {
  const path = join(projectRoot, FILE);
  await mkdir(join(projectRoot, ".otobot"), { recursive: true });

  const encrypted: KeyStoreShape = {};
  for (const [provider, value] of Object.entries(store)) {
    if (value) {
      encrypted[provider as Provider] = encrypt(value);
    }
  }

  await writeFile(path, JSON.stringify(encrypted, null, 2), "utf8");
}

async function setKeychainSecret(service: string, account: string, password: string): Promise<boolean> {
  try {
    const require = createRequire(import.meta.url);
    const keytarModule = require("keytar") as { setPassword: (svc: string, acc: string, pass: string) => Promise<void> };
    await keytarModule.setPassword(service, account, password);
    return true;
  } catch {
    return false;
  }
}

async function getKeychainSecret(service: string, account: string): Promise<string | null> {
  try {
    const require = createRequire(import.meta.url);
    const keytarModule = require("keytar") as { getPassword: (svc: string, acc: string) => Promise<string | null> };
    return await keytarModule.getPassword(service, account);
  } catch {
    return null;
  }
}

async function deleteKeychainSecret(service: string, account: string): Promise<boolean> {
  try {
    const require = createRequire(import.meta.url);
    const keytarModule = require("keytar") as { deletePassword: (svc: string, acc: string) => Promise<boolean> };
    return await keytarModule.deletePassword(service, account);
  } catch {
    return false;
  }
}

export async function setApiKey(projectRoot: string, provider: Provider, key: string): Promise<void> {
  const keychainStored = await setKeychainSecret("otobot", provider, key);
  if (keychainStored) {
    return;
  }

  const store = await loadStore(projectRoot);
  store[provider] = key;
  await saveStore(projectRoot, store);
}

export async function getApiKey(projectRoot: string, provider: Provider): Promise<string | null> {
  if (provider === "openai" && process.env.OTOBOT_OPENAI_KEY) {
    return process.env.OTOBOT_OPENAI_KEY;
  }
  if (provider === "google" && process.env.OTOBOT_GEMINI_KEY) {
    return process.env.OTOBOT_GEMINI_KEY;
  }
  if (provider === "anthropic" && process.env.OTOBOT_ANTHROPIC_KEY) {
    return process.env.OTOBOT_ANTHROPIC_KEY;
  }

  const keychain = await getKeychainSecret("otobot", provider);
  if (keychain) {
    return keychain;
  }

  const store = await loadStore(projectRoot);
  return store[provider] ?? null;
}

export async function listKeyStatuses(projectRoot: string): Promise<Record<Provider, boolean>> {
  const providers: Provider[] = ["openai", "google", "anthropic"];
  const entries = await Promise.all(
    providers.map(async (provider) => [provider, (await getApiKey(projectRoot, provider)) !== null] as const),
  );
  return Object.fromEntries(entries) as Record<Provider, boolean>;
}

export async function deleteApiKey(projectRoot: string, provider: Provider): Promise<void> {
  await deleteKeychainSecret("otobot", provider);
  const store = await loadStore(projectRoot);
  delete store[provider];
  await saveStore(projectRoot, store);
}
