"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Mailbox, MessageDetail, MessageSummary } from "@/lib/mail-types";
import {
  publicAppName,
  publicPinnedMailboxes,
} from "@/lib/public-config";

type InboxWorkspaceProps = {
  initialMessage: MessageDetail | null;
  mailboxes: Mailbox[];
  messages: MessageSummary[];
  totalMessages: number;
};

type MessageApiResponse = {
  attachments: MessageDetail["attachments"];
  attachment_count: number;
  archived: boolean;
  body_preview: string;
  date: string | null;
  direction: string | null;
  from: string;
  headers: {
    message_id: string | null;
    reply_to: string | null;
  };
  html: string | null;
  label: string | null;
  mailbox_address: string;
  message_id: string;
  read_at: string | null;
  ses: MessageDetail["ses"];
  size: number;
  starred: boolean;
  subject: string;
  text: string;
  to: string;
  unread: boolean;
};

type MessageStateApiResponse = {
  archived: boolean;
  mailbox_address: string;
  message_id: string;
  read_at: string | null;
  starred: boolean;
  unread: boolean;
};

type FilterMode = "inbox" | "unread" | "starred" | "archived";
type StatePatch = Partial<Pick<MessageSummary, "unread" | "starred" | "archived" | "readAt">>;

const ALL_MAILBOXES = "__all__";
export function InboxWorkspace({
  initialMessage,
  mailboxes,
  messages,
  totalMessages,
}: InboxWorkspaceProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeMailbox, setActiveMailbox] = useState(ALL_MAILBOXES);
  const [filterMode, setFilterMode] = useState<FilterMode>("inbox");
  const [localMessages, setLocalMessages] = useState(messages);
  const [selectedKey, setSelectedKey] = useState(() =>
    initialMessage
      ? messageKey(initialMessage.mailboxAddress, initialMessage.messageId)
      : ""
  );
  const [detail, setDetail] = useState<MessageDetail | null>(initialMessage);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState("");

  const unreadByMailbox = useMemo(() => {
    const counts = new Map<string, number>();

    for (const message of localMessages) {
      if (!message.unread || message.archived) continue;
      counts.set(
        message.mailboxAddress,
        (counts.get(message.mailboxAddress) ?? 0) + 1
      );
    }

    return counts;
  }, [localMessages]);

  const displayMailboxes = useMemo(
    () =>
      mailboxes.map((mailbox) => ({
        ...mailbox,
        unreadCount: unreadByMailbox.get(mailbox.address) ?? 0,
      })),
    [mailboxes, unreadByMailbox]
  );

  const unreadTotal = useMemo(
    () =>
      localMessages.filter((message) => message.unread && !message.archived)
        .length,
    [localMessages]
  );

  const filteredMessages = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return localMessages.filter((message) => {
      const matchesMailbox =
        activeMailbox === ALL_MAILBOXES ||
        message.mailboxAddress === activeMailbox;
      if (!matchesMailbox) return false;

      if (filterMode === "inbox" && message.archived) return false;
      if (filterMode === "unread" && (!message.unread || message.archived)) {
        return false;
      }
      if (filterMode === "starred" && (!message.starred || message.archived)) {
        return false;
      }
      if (filterMode === "archived" && !message.archived) return false;

      if (!normalizedQuery) return true;

      return [
        message.subject,
        message.from,
        message.to,
        message.mailboxAddress,
        message.label ?? "",
        message.bodyPreview,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [activeMailbox, filterMode, localMessages, query]);

  const filterCounts = useMemo(
    () => ({
      inbox: localMessages.filter((message) => !message.archived).length,
      unread: localMessages.filter(
        (message) => message.unread && !message.archived
      ).length,
      starred: localMessages.filter(
        (message) => message.starred && !message.archived
      ).length,
      archived: localMessages.filter((message) => message.archived).length,
    }),
    [localMessages]
  );

  const mailboxGroups = useMemo(
    () => groupMailboxes(displayMailboxes),
    [displayMailboxes]
  );

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  async function selectMessage(message: MessageSummary) {
    const key = messageKey(message.mailboxAddress, message.messageId);
    setSelectedKey(key);
    setDetailError("");
    setLoadingDetail(true);

    const response = await fetch(
      `/api/messages/${encodeURIComponent(
        message.messageId
      )}?mailbox=${encodeURIComponent(message.mailboxAddress)}`
    );

    if (!response.ok) {
      setDetail(null);
      setDetailError("Unable to load this message.");
      setLoadingDetail(false);
      return;
    }

    const data = (await response.json()) as MessageApiResponse;
    const nextDetail = fromApiMessage(data);
    setDetail(nextDetail);
    applyStateToMessage(nextDetail.messageId, nextDetail.mailboxAddress, {
      readAt: nextDetail.readAt,
      unread: nextDetail.unread,
      starred: nextDetail.starred,
      archived: nextDetail.archived,
    });
    setLoadingDetail(false);
  }

  async function patchMessageState(
    message: Pick<MessageSummary, "messageId" | "mailboxAddress">,
    patch: {
      read?: boolean;
      starred?: boolean;
      archived?: boolean;
    }
  ) {
    const optimistic = statePatchFromAction(patch);
    applyStateToMessage(message.messageId, message.mailboxAddress, optimistic);
    setDetailError("");

    const response = await fetch(
      `/api/messages/${encodeURIComponent(message.messageId)}/state`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mailbox: message.mailboxAddress,
          ...patch,
        }),
      }
    );

    if (!response.ok) {
      setDetailError("Unable to update this message.");
      return;
    }

    const data = (await response.json()) as MessageStateApiResponse;
    applyStateToMessage(data.message_id, data.mailbox_address, {
      readAt: data.read_at,
      unread: data.unread,
      starred: data.starred,
      archived: data.archived,
    });
  }

  function applyStateToMessage(
    messageId: string,
    mailboxAddress: string,
    patch: StatePatch
  ) {
    setLocalMessages((current) =>
      current.map((message) =>
        message.messageId === messageId &&
        message.mailboxAddress === mailboxAddress
          ? { ...message, ...patch }
          : message
      )
    );

    setDetail((current) =>
      current &&
      current.messageId === messageId &&
      current.mailboxAddress === mailboxAddress
        ? { ...current, ...patch }
        : current
    );
  }

  const activeMailboxLabel =
    activeMailbox === ALL_MAILBOXES ? "All inboxes" : activeMailbox;

  return (
    <div className="min-h-screen bg-[#f6f8fc] text-[#202124]">
      <header className="flex min-h-16 flex-wrap items-center gap-3 border-b border-[#dfe3eb] bg-[#f6f8fc] px-4 py-3 lg:flex-nowrap">
        <Link href="/" className="w-48 text-[18px] font-semibold tracking-tight">
          {publicAppName}
        </Link>
        <label htmlFor="mail-search" className="sr-only">
          Search mail
        </label>
        <input
          id="mail-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search mail"
          className="h-11 min-w-[220px] flex-1 rounded-full border border-transparent bg-[#eaf1fb] px-5 text-sm outline-none transition-colors placeholder:text-[#5f6368] focus:border-[#c7d2e3] focus:bg-white"
        />
        <div className="flex items-center gap-3">
          {unreadTotal > 0 && (
            <span className="rounded-full bg-[#d3e3fd] px-3 py-1 text-xs font-semibold text-[#174ea6]">
              {unreadTotal} unread
            </span>
          )}
          <Link
            href="/compose"
            className="inline-flex h-10 items-center rounded-full bg-[#1a73e8] px-5 text-sm font-medium text-white transition-colors hover:bg-[#1765cc]"
          >
            Compose
          </Link>
          <button
            type="button"
            onClick={logout}
            className="text-sm text-[#5f6368] transition-colors hover:text-[#202124]"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-4rem)] grid-cols-1 lg:grid-cols-[280px_minmax(380px,560px)_minmax(440px,1fr)]">
        <aside className="border-b border-[#dfe3eb] bg-[#f6f8fc] px-3 py-4 lg:border-b-0 lg:border-r">
          <nav className="space-y-5">
            <div className="space-y-1">
              <MailboxButton
                active={activeMailbox === ALL_MAILBOXES}
                count={totalMessages}
                label="All inboxes"
                unreadCount={unreadTotal}
                onClick={() => setActiveMailbox(ALL_MAILBOXES)}
              />
            </div>

            {mailboxGroups.pinned.length > 0 && (
              <MailboxSection title="Pinned">
                {mailboxGroups.pinned.map((mailbox) => (
                  <MailboxButton
                    key={mailbox.address}
                    active={activeMailbox === mailbox.address}
                    count={mailbox.messageCount}
                    label={mailbox.address}
                    unreadCount={mailbox.unreadCount ?? 0}
                    onClick={() => setActiveMailbox(mailbox.address)}
                  />
                ))}
              </MailboxSection>
            )}

            {mailboxGroups.groups.map((group) => (
              <MailboxSection key={group.title} title={group.title}>
                {group.mailboxes.map((mailbox) => (
                  <MailboxButton
                    key={mailbox.address}
                    active={activeMailbox === mailbox.address}
                    count={mailbox.messageCount}
                    label={mailbox.address}
                    muted={mailbox.type === "agent"}
                    unreadCount={mailbox.unreadCount ?? 0}
                    onClick={() => setActiveMailbox(mailbox.address)}
                  />
                ))}
              </MailboxSection>
            ))}
          </nav>
        </aside>

        <section className="border-b border-[#dfe3eb] bg-white lg:border-b-0 lg:border-r">
          <div className="border-b border-[#eef0f4] px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold">
                  {activeMailboxLabel}
                </h1>
                <p className="text-xs text-[#5f6368]">
                  {filteredMessages.length} shown
                </p>
              </div>
              <span className="shrink-0 text-xs text-[#5f6368]">
                Newest first
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <FilterButton
                active={filterMode === "inbox"}
                count={filterCounts.inbox}
                label="Inbox"
                onClick={() => setFilterMode("inbox")}
              />
              <FilterButton
                active={filterMode === "unread"}
                count={filterCounts.unread}
                label="Unread"
                onClick={() => setFilterMode("unread")}
              />
              <FilterButton
                active={filterMode === "starred"}
                count={filterCounts.starred}
                label="Starred"
                onClick={() => setFilterMode("starred")}
              />
              <FilterButton
                active={filterMode === "archived"}
                count={filterCounts.archived}
                label="Archived"
                onClick={() => setFilterMode("archived")}
              />
            </div>
          </div>

          <div className="max-h-[44vh] overflow-auto lg:max-h-[calc(100vh-9.75rem)]">
            {filteredMessages.length === 0 ? (
              <div className="px-5 py-16 text-center text-sm text-[#5f6368]">
                No messages match this view.
              </div>
            ) : (
              filteredMessages.map((message) => (
                <MessageRow
                  key={messageKey(message.mailboxAddress, message.messageId)}
                  message={message}
                  selected={
                    selectedKey ===
                    messageKey(message.mailboxAddress, message.messageId)
                  }
                  onSelect={() => selectMessage(message)}
                  onToggleStar={() =>
                    patchMessageState(message, { starred: !message.starred })
                  }
                />
              ))
            )}
          </div>
        </section>

        <main className="bg-white">
          <MessagePreview
            detail={detail}
            error={detailError}
            loading={loadingDetail}
            onPatchState={patchMessageState}
          />
        </main>
      </div>
    </div>
  );
}

function MailboxSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <div>
      <h2 className="mb-1 px-4 text-[11px] font-semibold uppercase tracking-wide text-[#6f7782]">
        {title}
      </h2>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function MailboxButton({
  active,
  count,
  label,
  muted,
  onClick,
  unreadCount,
}: {
  active: boolean;
  count: number;
  label: string;
  muted?: boolean;
  onClick: () => void;
  unreadCount: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-9 w-full items-center gap-2 rounded-r-full px-4 py-2 text-left text-sm transition-colors ${
        active
          ? "bg-[#d3e3fd] font-semibold text-[#001d35]"
          : "text-[#3c4043] hover:bg-[#e8eaed]"
      }`}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          unreadCount > 0 ? "bg-[#1a73e8]" : "bg-transparent"
        }`}
        aria-hidden="true"
      />
      <span className={muted ? "min-w-0 flex-1 truncate font-mono text-xs" : "min-w-0 flex-1 truncate"}>
        {label}
      </span>
      {unreadCount > 0 ? (
        <span className="shrink-0 rounded-full bg-[#1a73e8] px-2 py-0.5 text-[11px] font-semibold text-white">
          {unreadCount}
        </span>
      ) : (
        <span className="shrink-0 text-xs text-[#5f6368]">{count}</span>
      )}
    </button>
  );
}

function FilterButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors ${
        active
          ? "border-[#1a73e8] bg-[#e8f0fe] text-[#174ea6]"
          : "border-[#dadce0] bg-white text-[#5f6368] hover:bg-[#f8fafd]"
      }`}
    >
      <span>{label}</span>
      <span className={active ? "text-[#174ea6]" : "text-[#80868b]"}>
        {count}
      </span>
    </button>
  );
}

function MessageRow({
  message,
  onSelect,
  onToggleStar,
  selected,
}: {
  message: MessageSummary;
  onSelect: () => void;
  onToggleStar: () => void;
  selected: boolean;
}) {
  const primaryParty =
    message.direction === "outbound"
      ? `To: ${message.to || "(unknown recipient)"}`
      : message.from || "(unknown sender)";

  return (
    <div
      className={`grid grid-cols-[32px_minmax(0,1fr)] border-b border-[#eef0f4] transition-colors hover:bg-[#f8fafd] ${
        selected ? "bg-[#eaf1fb] shadow-[inset_3px_0_0_#1a73e8]" : "bg-white"
      }`}
    >
      <div className="flex flex-col items-center gap-2 py-3 pl-2">
        <span
          className={`mt-1 h-2.5 w-2.5 rounded-full ${
            message.unread ? "bg-[#1a73e8]" : "bg-transparent"
          }`}
          aria-label={message.unread ? "Unread" : "Read"}
        />
        <button
          type="button"
          onClick={onToggleStar}
          aria-label={message.starred ? "Unstar message" : "Star message"}
          className={`text-base leading-none ${
            message.starred
              ? "text-[#f9ab00]"
              : "text-[#bdc1c6] hover:text-[#5f6368]"
          }`}
        >
          {message.starred ? "★" : "☆"}
        </button>
      </div>

      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 px-3 py-3 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Avatar value={primaryParty} size="sm" />
            <p
              className={`min-w-0 truncate text-sm ${
                message.unread ? "font-semibold" : "font-medium"
              }`}
            >
              {primaryParty}
            </p>
          </div>
          <time
            className={`shrink-0 text-[11px] ${
              message.unread
                ? "font-semibold text-[#174ea6]"
                : "text-[#5f6368]"
            }`}
          >
            {formatSmartDate(message.date)}
          </time>
        </div>
        <p
          className={`mt-1 truncate text-sm ${
            message.unread ? "font-semibold" : "font-medium"
          }`}
        >
          {message.direction === "outbound" ? "Sent: " : ""}
          {message.subject}
        </p>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#5f6368]">
          {message.bodyPreview || message.mailboxAddress}
        </p>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-[#5f6368]">
          <span className="truncate">{message.mailboxAddress}</span>
          {message.label && (
            <span className="rounded-full border border-[#dadce0] px-2 py-0.5">
              {message.label}
            </span>
          )}
          {message.attachmentCount > 0 && (
            <span className="rounded-full bg-[#f1f3f4] px-2 py-0.5">
              {message.attachmentCount} attach
            </span>
          )}
          {message.archived && (
            <span className="rounded-full bg-[#f1f3f4] px-2 py-0.5">
              Archived
            </span>
          )}
        </div>
      </button>
    </div>
  );
}

function MessagePreview({
  detail,
  error,
  loading,
  onPatchState,
}: {
  detail: MessageDetail | null;
  error: string;
  loading: boolean;
  onPatchState: (
    message: Pick<MessageSummary, "messageId" | "mailboxAddress">,
    patch: {
      read?: boolean;
      starred?: boolean;
      archived?: boolean;
    }
  ) => void;
}) {
  if (loading) {
    return (
      <div className="h-full px-8 py-10">
        <div className="h-5 w-2/3 rounded bg-[#eef0f4]" />
        <div className="mt-5 h-3 w-1/3 rounded bg-[#eef0f4]" />
        <div className="mt-10 space-y-3">
          <div className="h-3 rounded bg-[#eef0f4]" />
          <div className="h-3 rounded bg-[#eef0f4]" />
          <div className="h-3 w-4/5 rounded bg-[#eef0f4]" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[320px] items-center justify-center px-8 text-sm text-[#b3261e]">
        {error}
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex min-h-[320px] items-center justify-center px-8 text-sm text-[#5f6368]">
        Select a message to read it.
      </div>
    );
  }

  const replyTarget =
    detail.direction === "outbound"
      ? extractFirstEmail(detail.to)
      : extractEmail(detail.headers.replyTo ?? detail.from);

  const replyHref = composeHref({
    from: detail.mailboxAddress,
    to: replyTarget,
    subject: detail.subject.startsWith("Re:")
      ? detail.subject
      : `Re: ${detail.subject}`,
    body: buildQuotedBody(detail.text, detail.date, detail.from),
    ...(detail.headers.messageId && { inReplyTo: detail.headers.messageId }),
  });

  const forwardHref = composeHref({
    from: detail.mailboxAddress,
    subject: detail.subject.startsWith("Fwd:")
      ? detail.subject
      : `Fwd: ${detail.subject}`,
    body: [
      "",
      "",
      "---------- Forwarded message ----------",
      `From: ${detail.from}`,
      `Date: ${detail.date ? new Date(detail.date).toLocaleString() : ""}`,
      `Subject: ${detail.subject}`,
      `To: ${detail.to}`,
      "",
      detail.text,
    ].join("\n"),
  });

  return (
    <article className="h-full max-h-[calc(100vh-4rem)] overflow-auto px-6 py-6 lg:px-8">
      <div className="flex flex-col gap-4 border-b border-[#eef0f4] pb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {detail.unread && (
                <span className="rounded-full bg-[#d3e3fd] px-2 py-1 text-xs font-semibold text-[#174ea6]">
                  Unread
                </span>
              )}
              {detail.starred && (
                <span className="rounded-full bg-[#fef7e0] px-2 py-1 text-xs font-semibold text-[#b06000]">
                  Starred
                </span>
              )}
              {detail.direction === "outbound" && (
                <span className="rounded-full bg-[#e8f0fe] px-2 py-1 text-xs font-medium text-[#174ea6]">
                  Sent
                </span>
              )}
              {detail.archived && (
                <span className="rounded-full bg-[#f1f3f4] px-2 py-1 text-xs font-medium text-[#5f6368]">
                  Archived
                </span>
              )}
            </div>
            <h2 className="text-2xl font-normal leading-tight text-[#202124]">
              {detail.subject}
            </h2>
            <p className="mt-2 text-xs text-[#5f6368]">{detail.mailboxAddress}</p>
          </div>
          <time className="shrink-0 text-xs text-[#5f6368]">
            {formatLongDate(detail.date)}
          </time>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={replyHref}
            className="rounded-full border border-[#dadce0] px-4 py-2 text-sm transition-colors hover:bg-[#f8fafd]"
          >
            Reply
          </Link>
          <Link
            href={forwardHref}
            className="rounded-full border border-[#dadce0] px-4 py-2 text-sm transition-colors hover:bg-[#f8fafd]"
          >
            Forward
          </Link>
          <StateButton
            onClick={() => onPatchState(detail, { read: detail.unread })}
          >
            {detail.unread ? "Mark read" : "Mark unread"}
          </StateButton>
          <StateButton
            onClick={() => onPatchState(detail, { starred: !detail.starred })}
          >
            {detail.starred ? "Unstar" : "Star"}
          </StateButton>
          <StateButton
            onClick={() => onPatchState(detail, { archived: !detail.archived })}
          >
            {detail.archived ? "Unarchive" : "Archive"}
          </StateButton>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Avatar value={detail.from} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{detail.from}</p>
            <p className="truncate text-xs text-[#5f6368]">to {detail.to}</p>
          </div>
        </div>
      </div>

      {detail.attachments.length > 0 && (
        <div className="border-b border-[#eef0f4] py-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#5f6368]">
            Attachments
          </p>
          <div className="flex flex-wrap gap-2">
            {detail.attachments.map((attachment) => (
              <span
                key={`${attachment.filename}-${attachment.size}`}
                className="rounded-lg border border-[#dadce0] px-3 py-2 text-xs text-[#3c4043]"
              >
                {attachment.filename ?? "unnamed"} ·{" "}
                {(attachment.size / 1024).toFixed(1)} KB
              </span>
            ))}
          </div>
        </div>
      )}

      <pre className="whitespace-pre-wrap py-6 font-sans text-[14px] leading-7 text-[#202124]">
        {detail.text || "(no text body)"}
      </pre>
    </article>
  );
}

function StateButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-[#dadce0] px-4 py-2 text-sm transition-colors hover:bg-[#f8fafd]"
    >
      {children}
    </button>
  );
}

function Avatar({
  size = "md",
  value,
}: {
  size?: "sm" | "md";
  value: string;
}) {
  const name = value.replace(/<.*>/, "").replace(/^To:\s*/i, "").trim() || value;
  const className =
    size === "sm"
      ? "h-7 w-7 text-xs"
      : "h-10 w-10 text-sm";

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-[#d3e3fd] font-semibold text-[#174ea6] ${className}`}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function fromApiMessage(data: MessageApiResponse): MessageDetail {
  return {
    archived: data.archived,
    attachmentCount: data.attachment_count,
    attachments: data.attachments,
    bodyPreview: data.body_preview,
    date: data.date,
    direction: data.direction ?? undefined,
    from: data.from,
    headers: {
      messageId: data.headers.message_id,
      replyTo: data.headers.reply_to,
    },
    html: data.html,
    label: data.label ?? undefined,
    mailboxAddress: data.mailbox_address,
    messageId: data.message_id,
    readAt: data.read_at,
    replyTo: data.headers.reply_to,
    ses: data.ses,
    size: data.size,
    starred: data.starred,
    subject: data.subject,
    text: data.text,
    to: data.to,
    unread: data.unread,
  };
}

function statePatchFromAction(patch: {
  read?: boolean;
  starred?: boolean;
  archived?: boolean;
}): StatePatch {
  return {
    ...(typeof patch.read === "boolean" && {
      readAt: patch.read ? new Date().toISOString() : null,
      unread: !patch.read,
    }),
    ...(typeof patch.starred === "boolean" && { starred: patch.starred }),
    ...(typeof patch.archived === "boolean" && { archived: patch.archived }),
  };
}

function groupMailboxes(mailboxes: Mailbox[]): {
  pinned: Mailbox[];
  groups: Array<{ title: string; mailboxes: Mailbox[] }>;
} {
  const pinned = mailboxes.filter((mailbox) =>
    publicPinnedMailboxes.has(mailbox.address.toLowerCase())
  );
  const byGroup = new Map<string, Mailbox[]>();

  for (const mailbox of mailboxes) {
    if (publicPinnedMailboxes.has(mailbox.address.toLowerCase())) continue;
    const title = mailbox.address.includes("@")
      ? mailbox.address.split("@").at(-1) ?? "Other"
      : "Generated inboxes";
    byGroup.set(title, [...(byGroup.get(title) ?? []), mailbox]);
  }

  return {
    pinned,
    groups: [...byGroup.entries()]
      .map(([title, groupMailboxes]) => ({
        title,
        mailboxes: groupMailboxes,
      }))
      .sort((a, b) => a.title.localeCompare(b.title)),
  };
}

function messageKey(mailboxAddress: string, messageId: string): string {
  return `${mailboxAddress}:${messageId}`;
}

function formatSmartDate(value: string | null): string {
  if (!value) return "--";

  const date = new Date(value);
  const now = new Date();
  if (Number.isNaN(date.getTime())) return "--";

  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const ageMs = now.getTime() - date.getTime();
  if (ageMs > 0 && ageMs < 6 * 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatLongDate(value: string | null): string {
  if (!value) return "--";
  return new Date(value).toLocaleString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function extractEmail(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return match ? match[1] : value.trim();
}

function extractFirstEmail(value: string): string {
  return extractEmail(value.split(",")[0] ?? value);
}

function buildQuotedBody(text: string, date: string | null, from: string): string {
  const formattedDate = date ? new Date(date).toLocaleString("en-US") : "";
  const lines = text.split("\n").map((line) => `> ${line}`);
  return `\n\nOn ${formattedDate}, ${from} wrote:\n${lines.join("\n")}`;
}

function composeHref(params: Record<string, string>): string {
  return `/compose?${new URLSearchParams(params).toString()}`;
}
