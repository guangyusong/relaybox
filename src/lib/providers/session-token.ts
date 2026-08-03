import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export interface SessionPayload {
  sub: string;
  sid: string;
  exp: number;
}

export function encodeSessionToken(
  payload: SessionPayload,
  secret: string
): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function decodeSessionToken(
  value: string,
  secret: string
): SessionPayload | null {
  const parts = value.split(".");
  if (parts.length !== 2) return null;

  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) return null;
  if (!safeCompare(signature, sign(encodedPayload, secret))) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as SessionPayload;

    if (
      typeof payload.sub !== "string" ||
      typeof payload.sid !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function safeCompare(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}
