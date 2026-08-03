import { describe, expect, it } from "vitest";
import { demoOutboundProvider } from "@/lib/providers/demo/outbound";

describe("demo outbound provider", () => {
  it("returns configured sender identities", async () => {
    const senders = await demoOutboundProvider.listSenderIdentities();

    expect(senders.length).toBeGreaterThan(0);
    expect(senders[0]).toContain("@");
  });

  it("returns a synthetic message id on send", async () => {
    const result = await demoOutboundProvider.sendMessage({
      from: "noreply@example.com",
      to: ["agent@example.com"],
      cc: [],
      subject: "Test message",
      body: "hello",
    });

    expect(result.messageId.startsWith("demo-")).toBe(true);
  });
});
