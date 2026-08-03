export interface Mailbox {
  address: string;
  type: "address" | "agent";
  status: "active" | "disabled";
  messageCount: number;
  unreadCount?: number;
}

export interface MessageSummary {
  messageId: string;
  mailboxAddress: string;
  direction?: string;
  from: string;
  to: string;
  subject: string;
  date: string | null;
  size: number;
  replyTo: string | null;
  label?: string;
  bodyPreview: string;
  attachmentCount: number;
  readAt: string | null;
  unread: boolean;
  starred: boolean;
  archived: boolean;
}

export interface MessageAttachment {
  filename: string | null;
  contentType: string;
  size: number;
}

export interface MessageDetail extends MessageSummary {
  text: string;
  html: string | null;
  headers: {
    replyTo: string | null;
    messageId: string | null;
  };
  attachments: MessageAttachment[];
  ses: Record<string, { status: string }> | null;
}

export interface SendMessageInput {
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  replyToMessageId?: string;
}

export interface SendMessageResult {
  messageId: string;
}

export type Labels = Record<string, string>;

export interface MessageStateUpdate {
  mailboxAddress: string;
  read?: boolean;
  starred?: boolean;
  archived?: boolean;
}
