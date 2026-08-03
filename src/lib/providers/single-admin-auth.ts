import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import type { AuthProvider } from "@/lib/providers/types";
import { appConfig } from "@/lib/config";
import {
  decodeSessionToken,
  encodeSessionToken,
  safeCompare,
  type SessionPayload,
} from "@/lib/providers/session-token";

export const singleAdminAuthProvider: AuthProvider = {
  async createSession() {
    if (!appConfig.authConfigured) {
      throw new Error(
        "Relaybox auth requires APP_ADMIN_PASSWORD (12+ characters) and APP_SESSION_SECRET (32+ characters)."
      );
    }

    const jar = await cookies();
    const payload: SessionPayload = {
      sub: "admin",
      sid: randomUUID(),
      exp: Date.now() + appConfig.sessionMaxAgeSeconds * 1000,
    };

    jar.set(
      appConfig.sessionCookieName,
      encodeSessionToken(payload, appConfig.sessionSecret),
      {
        httpOnly: true,
        secure: appConfig.sessionCookieSecure,
        sameSite: "strict",
        maxAge: appConfig.sessionMaxAgeSeconds,
        path: "/",
      }
    );
  },

  async destroySession() {
    const jar = await cookies();
    jar.delete(appConfig.sessionCookieName);
  },

  async verifySession() {
    if (!appConfig.authConfigured) return false;

    const jar = await cookies();
    const cookie = jar.get(appConfig.sessionCookieName);
    if (!cookie?.value) return false;

    const payload = decodeSessionToken(cookie.value, appConfig.sessionSecret);
    return payload !== null && payload.exp > Date.now();
  },

  verifyPassword(input) {
    return (
      appConfig.authConfigured && safeCompare(input, appConfig.adminPassword)
    );
  },
};
