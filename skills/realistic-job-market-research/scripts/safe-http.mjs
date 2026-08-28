import dns from "node:dns/promises";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const governance = JSON.parse(fs.readFileSync(path.join(root, "assets", "source-governance.json"), "utf8")).defaults;
const DEFAULT_USER_AGENT = governance.user_agent;
const hostQueue = new Map();
const hostLastStart = new Map();

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export function isBlockedAddress(address) {
  const value = String(address || "").toLowerCase().split("%")[0];
  if (net.isIPv4(value)) {
    const [a, b, c] = value.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0)
      || (a === 192 && b === 168)
      || (a === 192 && b === 0 && c === 2)
      || (a === 198 && (b === 18 || b === 19 || b === 51))
      || (a === 203 && b === 0 && c === 113);
  }
  if (net.isIPv6(value)) {
    if (value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") || /^fe[89ab]/.test(value) || value.startsWith("ff") || value.startsWith("2001:db8:")) return true;
    const mapped = value.match(/(?:^|:)ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    return mapped ? isBlockedAddress(mapped) : false;
  }
  return true;
}

export function validatePublicUrl(input) {
  const url = new URL(String(input));
  if (!["http:", "https:"].includes(url.protocol)) throw new Error(`unsupported URL protocol: ${url.protocol}`);
  if (url.username || url.password) throw new Error("URL credentials are forbidden");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error(`URL port is not allowed: ${url.port}`);
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) throw new Error(`local hostname is forbidden: ${hostname}`);
  if (net.isIP(hostname) && isBlockedAddress(hostname)) throw new Error(`private or reserved address is forbidden: ${hostname}`);
  return url;
}

async function assertPublicResolution(url) {
  if (net.isIP(url.hostname)) return;
  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new Error(`hostname resolves to a private, reserved, or unavailable address: ${url.hostname}`);
  }
}

async function throttle(hostname, minimumIntervalMs) {
  const previous = hostQueue.get(hostname) || Promise.resolve();
  const current = previous.then(async () => {
    const delay = Math.max(0, (hostLastStart.get(hostname) || 0) + minimumIntervalMs - Date.now());
    if (delay) await wait(delay);
    hostLastStart.set(hostname, Date.now());
  });
  hostQueue.set(hostname, current.catch(() => {}));
  await current;
}

async function boundedText(response, maximumBytes) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximumBytes) throw new Error(`response exceeds ${maximumBytes} bytes`);
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximumBytes) {
      await reader.cancel();
      throw new Error(`response exceeds ${maximumBytes} bytes`);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

const retryDelay = response => {
  const value = response?.headers?.get("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
};

export async function safeRequest(input, options = {}) {
  const {
    timeoutMs = 30_000,
    maxBytes = governance.max_response_bytes,
    maxRedirects = 5,
    minIntervalMs = governance.minimum_request_interval_ms,
    retries = 2,
    headers = {},
    ...fetchOptions
  } = options;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      let url = validatePublicUrl(input);
      for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
        await assertPublicResolution(url);
        await throttle(url.hostname, minIntervalMs);
        const response = await fetch(url, {
          ...fetchOptions,
          redirect: "manual",
          headers: { accept: "application/json,text/html,text/plain,application/xhtml+xml", "user-agent": DEFAULT_USER_AGENT, ...headers },
          signal: AbortSignal.timeout(timeoutMs)
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get("location");
          if (!location) return { response, text: "", finalUrl: url.href };
          if (redirects === maxRedirects) throw new Error(`redirect limit exceeded: ${maxRedirects}`);
          url = validatePublicUrl(new URL(location, url));
          continue;
        }
        const contentType = response.headers.get("content-type") || "";
        if (response.ok && contentType && !/(?:text\/|application\/(?:json|xml|xhtml\+xml|javascript))/i.test(contentType)) {
          throw new Error(`unsupported content type: ${contentType}`);
        }
        const text = await boundedText(response, maxBytes);
        const transient = response.status === 408 || response.status === 429 || response.status >= 500;
        if (transient && attempt < retries) {
          await wait(Math.min(retryDelay(response) ?? 300 * (2 ** attempt), 30_000));
          break;
        }
        return { response, text, finalUrl: url.href };
      }
    } catch (error) {
      lastError = error;
      if (attempt === retries || /forbidden|private|reserved|unavailable address|unsupported URL|response exceeds|content type|redirect limit/.test(String(error?.message))) throw error;
      await wait(300 * (2 ** attempt));
    }
  }
  throw lastError || new Error("request failed");
}
