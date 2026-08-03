import { expect, test } from "@playwright/test";

test("demo-mode core workflow", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  await expect(async () => {
    await page.getByLabel("Admin password").fill("playwright-password");
    await expect(
      page.getByRole("button", { name: "Sign in" })
    ).toBeEnabled();
  }).toPass();

  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL("http://127.0.0.1:3100/");
  await expect(page.getByLabel("Search mail")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "agent@example.com 2" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "ops@example.com 1" })
  ).toBeVisible();

  await page.getByLabel("Search mail").fill("Roadmap");
  await expect(
    page.getByRole("button", { name: /Roadmap review/ })
  ).toBeVisible();
  await page.getByRole("button", { name: /Roadmap review/ }).click();
  await expect(page.getByRole("heading", { name: "Roadmap review" })).toBeVisible();

  await page.getByRole("link", { name: "Reply", exact: true }).click();
  await expect(page).toHaveURL(/\/compose\?/);
  await expect(page.getByLabel("To")).toHaveValue("product@example.net");
  await expect(page.getByLabel("Subject")).toHaveValue("Re: Roadmap review");

  await page.getByLabel("Body").fill("Browser smoke message");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Email sent.")).toBeVisible();

  await page.getByRole("button", { name: "Back to dashboard" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
