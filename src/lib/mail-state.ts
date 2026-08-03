import "server-only";

import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

type StateMessage = {
  messageId: string;
  mailboxAddress: string;
  date: string | null;
  direction?: string;
};

type StoredMessageState = {
  readAt?: string | null;
  unread?: boolean;
  starred?: boolean;
  archived?: boolean;
  updatedAt?: string;
};

type StoredMailState = {
  version: 1;
  initializedAt: string | null;
  messages: Record<string, StoredMessageState>;
};

export type ResolvedMessageState = {
  readAt: string | null;
  unread: boolean;
  starred: boolean;
  archived: boolean;
};

const STATE_FILE = "mail-state.json";

function dataDir(): string {
  return join(
    /* turbopackIgnore: true */ process.cwd(),
    process.env.APP_DATA_DIR ?? ".data"
  );
}

function stateFile(): string {
  return join(dataDir(), STATE_FILE);
}

export function messageStateKey(messageId: string, mailboxAddress: string): string {
  return `${mailboxAddress}:${messageId}`;
}

export async function hydrateMessageStates<
  T extends StateMessage & ResolvedMessageState,
>(messages: T[]): Promise<T[]> {
  const store = await readMailState();
  let changed = false;

  if (!store.initializedAt) {
    store.initializedAt = new Date().toISOString();
    changed = true;
  }

  const hydrated = messages.map((message) => ({
    ...message,
    ...resolveState(message, store),
  }));

  if (changed) {
    await writeMailState(store);
  }

  return hydrated;
}

export async function getResolvedMessageState(
  message: StateMessage
): Promise<ResolvedMessageState> {
  const store = await readMailState();

  if (!store.initializedAt) {
    store.initializedAt = new Date().toISOString();
    await writeMailState(store);
  }

  return resolveState(message, store);
}

export async function setMessageReadState(
  messageId: string,
  mailboxAddress: string,
  read: boolean
): Promise<ResolvedMessageState> {
  const now = new Date().toISOString();
  const store = await readMailState();
  if (!store.initializedAt) {
    store.initializedAt = now;
  }

  const key = messageStateKey(messageId, mailboxAddress);
  const existing = store.messages[key] ?? {};
  store.messages[key] = {
    ...existing,
    readAt: read ? now : null,
    unread: !read,
    updatedAt: now,
  };

  await writeMailState(store);
  return resolveState({ messageId, mailboxAddress, date: null }, store);
}

export async function updateMessageState(
  messageId: string,
  mailboxAddress: string,
  patch: {
    read?: boolean;
    starred?: boolean;
    archived?: boolean;
  }
): Promise<ResolvedMessageState> {
  const now = new Date().toISOString();
  const store = await readMailState();
  if (!store.initializedAt) {
    store.initializedAt = now;
  }

  const key = messageStateKey(messageId, mailboxAddress);
  const existing = store.messages[key] ?? {};
  const next: StoredMessageState = {
    ...existing,
    updatedAt: now,
  };

  if (typeof patch.read === "boolean") {
    next.readAt = patch.read ? now : null;
    next.unread = !patch.read;
  }

  if (typeof patch.starred === "boolean") {
    next.starred = patch.starred;
  }

  if (typeof patch.archived === "boolean") {
    next.archived = patch.archived;
  }

  store.messages[key] = next;
  await writeMailState(store);
  return resolveState({ messageId, mailboxAddress, date: null }, store);
}

function resolveState(
  message: StateMessage,
  store: StoredMailState
): ResolvedMessageState {
  const key = messageStateKey(message.messageId, message.mailboxAddress);
  const stored = store.messages[key];
  const baseline = parseTime(store.initializedAt);
  const messageTime = parseTime(message.date);
  const isOutbound = message.direction === "outbound";
  const arrivedAfterBaseline =
    baseline !== null && messageTime !== null && messageTime > baseline;
  const defaultUnread = !isOutbound && arrivedAfterBaseline;

  if (stored?.unread === true) {
    return {
      readAt: null,
      unread: true,
      starred: stored.starred === true,
      archived: stored.archived === true,
    };
  }

  const readAt =
    stored?.readAt ??
    (defaultUnread ? null : store.initializedAt);

  return {
    readAt,
    unread: stored?.unread ?? !readAt,
    starred: stored?.starred === true,
    archived: stored?.archived === true,
  };
}

async function readMailState(): Promise<StoredMailState> {
  try {
    const raw = await readFile(stateFile(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<StoredMailState>;

    return {
      version: 1,
      initializedAt:
        typeof parsed.initializedAt === "string" ? parsed.initializedAt : null,
      messages:
        parsed.messages && typeof parsed.messages === "object"
          ? parsed.messages
          : {},
    };
  } catch {
    return {
      version: 1,
      initializedAt: null,
      messages: {},
    };
  }
}

async function writeMailState(state: StoredMailState): Promise<void> {
  await mkdir(dataDir(), { recursive: true });
  await writeFile(stateFile(), JSON.stringify(state, null, 2));
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}
