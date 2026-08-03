import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { demoInboundProvider } from "@/lib/providers/demo/inbound";
import { demoMessageStore } from "@/lib/providers/demo/message-store";

describe("demo providers", () => {
  const originalCwd = process.cwd();
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "relaybox-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("lists mailbox counts from indexed fixtures", async () => {
    const mailboxes = await demoInboundProvider.listMailboxes();

    expect(mailboxes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          address: "agent@example.com",
          messageCount: 2,
        }),
        expect.objectContaining({
          address: "ops@example.com",
          messageCount: 1,
        }),
      ])
    );
  });

  it("lists mailbox messages and persists labels", async () => {
    await demoMessageStore.setLabel("demo-roadmap", "priority");

    const messages = await demoMessageStore.listMessages("agent@example.com");

    expect(messages).toHaveLength(2);
    expect(messages[0].date).toBe("2026-03-10T13:00:00.000Z");
    expect(messages[1]).toMatchObject({
      messageId: "demo-roadmap",
      label: "priority",
    });
  });

  it("loads full message details by id", async () => {
    const message = await demoMessageStore.getMessage("demo-ops-alert");

    expect(message).toMatchObject({
      messageId: "demo-ops-alert",
      mailboxAddress: "ops@example.com",
      subject: "Inbound index healthy",
    });
  });
});
