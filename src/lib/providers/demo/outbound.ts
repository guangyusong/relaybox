import { randomUUID } from "node:crypto";
import { appConfig } from "@/lib/config";
import type { OutboundProvider } from "@/lib/providers/types";

export const demoOutboundProvider: OutboundProvider = {
  async listSenderIdentities() {
    return appConfig.fromAddresses;
  },

  async sendMessage() {
    return {
      messageId: `demo-${randomUUID()}`,
    };
  },
};
