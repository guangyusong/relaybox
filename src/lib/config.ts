import "server-only";

import { publicAppName } from "@/lib/public-config";

function parseCsv(value: string | undefined, fallback: string[]): string[] {
  const items = value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!items || items.length === 0) {
    return fallback;
  }

  return items;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;

  return fallback;
}

const adminPassword = process.env.APP_ADMIN_PASSWORD?.trim() || "";
const sessionSecret = process.env.APP_SESSION_SECRET?.trim() || "";

export const appConfig = {
  appName: publicAppName,
  mailProvider: process.env.MAIL_PROVIDER?.trim() || "demo",
  sessionCookieName:
    process.env.APP_SESSION_COOKIE_NAME?.trim() || "relaybox_session",
  sessionCookieSecure: parseBoolean(
    process.env.APP_SESSION_COOKIE_SECURE,
    process.env.NODE_ENV === "production"
  ),
  sessionSecret,
  sessionMaxAgeSeconds: parsePositiveInt(
    process.env.APP_SESSION_MAX_AGE_SECONDS,
    60 * 60 * 24 * 7
  ),
  adminPassword,
  authConfigured: adminPassword.length >= 12 && sessionSecret.length >= 32,
  inboundAddresses: parseCsv(process.env.APP_INBOUND_ADDRESSES, [
    "agent@example.com",
    "ops@example.com",
  ]),
  fromAddresses: parseCsv(process.env.APP_FROM_ADDRESSES, [
    "noreply@example.com",
    "agent@example.com",
  ]),
  aws: {
    region: process.env.AWS_REGION?.trim() || "us-east-1",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID?.trim(),
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim(),
    mailboxesTable: process.env.AWS_MAILBOXES_TABLE?.trim(),
    messagesTable: process.env.AWS_MESSAGES_TABLE?.trim(),
    messagesByMailboxIndex:
      process.env.AWS_MESSAGES_BY_MAILBOX_INDEX?.trim() || "byMailbox",
    s3Bucket: process.env.AWS_S3_BUCKET?.trim(),
    s3Prefix: process.env.AWS_S3_PREFIX?.trim() || "raw/",
  },
} as const;
