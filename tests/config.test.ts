import { afterEach, describe, expect, it, vi } from "vitest";

async function loadConfig(password: string, secret: string) {
  vi.resetModules();
  vi.stubEnv("APP_ADMIN_PASSWORD", password);
  vi.stubEnv("APP_SESSION_SECRET", secret);
  return (await import("@/lib/config")).appConfig;
}

describe("authentication configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("rejects missing and placeholder-strength credentials", async () => {
    expect((await loadConfig("", "")).authConfigured).toBe(false);
    expect(
      (
        await loadConfig(
          "change-me",
          "replace-with-a-long-random-string"
        )
      ).authConfigured
    ).toBe(false);
  });

  it("accepts a strong password and session secret", async () => {
    const config = await loadConfig(
      "correct-horse-battery-staple",
      "a-session-secret-that-is-at-least-32-characters"
    );

    expect(config.authConfigured).toBe(true);
  });

  it("allows an explicit secure-cookie override", async () => {
    vi.stubEnv("APP_SESSION_COOKIE_SECURE", "0");
    const config = await loadConfig(
      "correct-horse-battery-staple",
      "a-session-secret-that-is-at-least-32-characters"
    );

    expect(config.sessionCookieSecure).toBe(false);
  });
});
