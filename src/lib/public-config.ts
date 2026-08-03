export const publicAppName =
  process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Relaybox";

export const publicPinnedMailboxes = new Set(
  (process.env.NEXT_PUBLIC_PINNED_MAILBOXES ?? "")
    .split(",")
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean)
);
