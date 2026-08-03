import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  hydrateMessageStates,
  updateMessageState,
} from "@/lib/mail-state";
import type { MessageSummary } from "@/lib/mail-types";

describe("mail state", () => {
  const originalCwd = process.cwd();
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "relaybox-state-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("bootstraps existing messages as read and treats later messages as unread", async () => {
    const [existing] = await hydrateMessageStates([
      messageSummary({
        date: "2020-01-01T00:00:00.000Z",
        messageId: "existing",
      }),
    ]);

    expect(existing.unread).toBe(false);
    expect(existing.readAt).toEqual(expect.any(String));

    const [future] = await hydrateMessageStates([
      messageSummary({
        date: "2999-01-01T00:00:00.000Z",
        messageId: "future",
      }),
    ]);

    expect(future.unread).toBe(true);
    expect(future.readAt).toBeNull();
  });

  it("persists read, starred, and archived state", async () => {
    await hydrateMessageStates([
      messageSummary({
        date: "2020-01-01T00:00:00.000Z",
        messageId: "stateful",
      }),
    ]);

    const state = await updateMessageState("stateful", "agent@example.com", {
      read: false,
      starred: true,
      archived: true,
    });

    expect(state).toMatchObject({
      unread: true,
      readAt: null,
      starred: true,
      archived: true,
    });

    const [hydrated] = await hydrateMessageStates([
      messageSummary({
        date: "2020-01-01T00:00:00.000Z",
        messageId: "stateful",
      }),
    ]);

    expect(hydrated).toMatchObject({
      unread: true,
      readAt: null,
      starred: true,
      archived: true,
    });
  });
});

function messageSummary(
  overrides: Partial<MessageSummary>
): MessageSummary {
  return {
    archived: false,
    attachmentCount: 0,
    bodyPreview: "",
    date: null,
    direction: undefined,
    from: "Sender <sender@example.com>",
    label: undefined,
    mailboxAddress: "agent@example.com",
    messageId: "message-id",
    readAt: null,
    replyTo: null,
    size: 1,
    starred: false,
    subject: "Subject",
    to: "agent@example.com",
    unread: false,
    ...overrides,
  };
}
