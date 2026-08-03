import type { InboundProvider } from "@/lib/providers/types";
import { demoMailboxes, demoMessages } from "@/lib/providers/demo/fixtures";

export const demoInboundProvider: InboundProvider = {
  async listMailboxes() {
    return demoMailboxes.map((mailbox) => ({
      ...mailbox,
      messageCount: demoMessages.filter(
        (message) => message.mailboxAddress === mailbox.address
      ).length,
    }));
  },
};
