import { describe, expect, it } from "vitest";
import { awsMessageStoreInternals } from "@/lib/providers/aws/message-store";

describe("awsMessageStoreInternals", () => {
  it("maps the live inbox schema into Relaybox summaries", () => {
    const summary = awsMessageStoreInternals.toSummary(
      {
        inbox_id: "db9070160fe7d53d8d2af2c0",
        message_id: "0gc44vh067i2l178jglb30u2fadjmq5vcbpm2no1",
        subject: "Provisioned inbox smoke",
        received_at: 1773219401,
        raw_size: 3701,
        from: [{ name: "", email: "noreply@example.com" }],
        to: [
          {
            name: "",
            email: "db9070160fe7d53d8d2af2c0@inbox.example.com",
          },
        ],
      },
      {}
    );

    expect(summary).toEqual({
      messageId: "0gc44vh067i2l178jglb30u2fadjmq5vcbpm2no1",
      mailboxAddress: "db9070160fe7d53d8d2af2c0",
      direction: undefined,
      from: "noreply@example.com",
      to: "db9070160fe7d53d8d2af2c0@inbox.example.com",
      subject: "Provisioned inbox smoke",
      date: "2026-03-11T08:56:41.000Z",
      size: 3701,
      replyTo: null,
      label: undefined,
      bodyPreview: "",
      attachmentCount: 0,
      readAt: null,
      unread: false,
      starred: false,
      archived: false,
    });
  });
});
