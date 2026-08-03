import { defineConfig } from "@playwright/test";

const port = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `rm -rf .tmp/playwright-data && npm run build && PORT=${port} npm run start`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_APP_NAME: "Relaybox",
      MAIL_PROVIDER: "demo",
      APP_ADMIN_PASSWORD: "playwright-password",
      APP_SESSION_SECRET: "playwright-session-secret-at-least-32-chars",
      APP_SESSION_COOKIE_SECURE: "0",
      APP_SESSION_COOKIE_NAME: "relaybox_playwright_session",
      APP_DATA_DIR: ".tmp/playwright-data",
      PORT: `${port}`,
      HOSTNAME: "127.0.0.1",
    },
  },
});
