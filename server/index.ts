import { createServer, type IncomingHttpHeaders, type IncomingMessage } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { handleApiRequest } from "./decision-api";
import { applySecurityHeaders, securityPolicyForEnv } from "./security";

loadLocalEnv();

const host = process.env.QUORUMMIND_API_HOST ?? "127.0.0.1";
const port = Number(process.env.QUORUMMIND_API_PORT ?? 8787);

const server = createServer(async (incoming, outgoing) => {
  try {
    const bodyBuffer =
      incoming.method === "GET" || incoming.method === "HEAD"
        ? undefined
        : await readBody(incoming, securityPolicyForEnv(process.env).maxBodyBytes);
    const request = new Request(`http://${incoming.headers.host ?? `${host}:${port}`}${incoming.url ?? "/"}`, {
      method: incoming.method,
      headers: headersFromIncoming(incoming.headers),
      body: bodyBuffer ? new Uint8Array(bodyBuffer) : undefined
    });
    const response = await handleApiRequest(request, process.env);
    const responseBody = Buffer.from(await response.arrayBuffer());

    outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    outgoing.end(responseBody);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    const status = error instanceof RequestBodyTooLargeError ? 413 : 500;
    const headers = applySecurityHeaders(
      new Headers({ "Content-Type": "application/json; charset=utf-8" }),
      new Request(`http://${incoming.headers.host ?? `${host}:${port}`}${incoming.url ?? "/"}`, {
        method: incoming.method,
        headers: headersFromIncoming(incoming.headers)
      }),
      process.env
    );

    outgoing.writeHead(status, Object.fromEntries(headers.entries()));
    outgoing.end(JSON.stringify({ error: message }));
  }
});

server.listen(port, host, () => {
  console.log(`QuorumMind API listening on http://${host}:${port}`);
});

function headersFromIncoming(headers: IncomingHttpHeaders): Headers {
  const result = new Headers();

  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      result.set(key, value.join(", "));
    } else if (value) {
      result.set(key, value);
    }
  }

  return result;
}

function readBody(incoming: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    incoming.on("data", (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.byteLength;

      if (totalBytes > maxBytes) {
        reject(new RequestBodyTooLargeError(maxBytes));
        incoming.destroy();
        return;
      }

      chunks.push(buffer);
    });
    incoming.on("end", () => resolveBody(Buffer.concat(chunks)));
    incoming.on("error", reject);
  });
}

class RequestBodyTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Request body exceeds ${maxBytes} bytes.`);
  }
}

function loadLocalEnv(): void {
  const envPath = resolve(process.cwd(), ".env.local");

  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
