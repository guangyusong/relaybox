import type {
  Labels,
  Mailbox,
  MessageDetail,
  MessageSummary,
  SendMessageInput,
  SendMessageResult,
} from "@/lib/mail-types";

export interface AuthProvider {
  createSession(): Promise<void>;
  destroySession(): Promise<void>;
  verifySession(): Promise<boolean>;
  verifyPassword(input: string): boolean;
}

export interface InboundProvider {
  listMailboxes(): Promise<Mailbox[]>;
}

export interface MessageStore {
  listMessages(mailboxAddress: string): Promise<MessageSummary[]>;
  getMessage(
    messageId: string,
    mailboxAddress?: string
  ): Promise<MessageDetail | null>;
  getLabels(): Promise<Labels>;
  setLabel(messageId: string, label: string): Promise<Labels>;
}

export interface OutboundProvider {
  listSenderIdentities(): Promise<string[]>;
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
}
