import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageLabelEditor } from "@/components/message-label-editor";
import { Shell } from "@/components/shell";
import { requirePageAuth } from "@/lib/auth";
import { getMessage, listSenderIdentities } from "@/lib/mail-service";

function extractEmail(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return match ? match[1] : value.trim();
}

function buildQuotedBody(text: string, date: string | null, from: string): string {
  const formattedDate = date
    ? new Date(date).toLocaleString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const lines = text.split("\n").map((line) => `> ${line}`);
  return `\n\nOn ${formattedDate}, ${from} wrote:\n${lines.join("\n")}`;
}

export default async function MessagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mailbox?: string }>;
}) {
  await requirePageAuth();

  const { id } = await params;
  const { mailbox } = await searchParams;
  const mailboxAddress = mailbox ? decodeURIComponent(mailbox) : undefined;
  const message = await getMessage(id, mailboxAddress, { markRead: true });
  if (!message) {
    notFound();
  }
  const senderIdentities = await listSenderIdentities();

  const replyTo = message.headers.replyTo
    ? extractEmail(message.headers.replyTo)
    : extractEmail(message.from);
  const replySubject = message.subject.startsWith("Re:")
    ? message.subject
    : `Re: ${message.subject}`;
  const forwardSubject = message.subject.startsWith("Fwd:")
    ? message.subject
    : `Fwd: ${message.subject}`;

  const ownAddresses = new Set(
    senderIdentities.map((address) => address.toLowerCase())
  );

  const replyAllCc = message.to
    .split(",")
    .map((item) => extractEmail(item))
    .filter(
      (email) =>
        !ownAddresses.has(email.toLowerCase()) &&
        email.toLowerCase() !== replyTo.toLowerCase()
    )
    .join(", ");

  const replyHref = composeHref({
    from: message.mailboxAddress,
    to: replyTo,
    subject: replySubject,
    body: buildQuotedBody(message.text, message.date, message.from),
    ...(message.headers.messageId && { inReplyTo: message.headers.messageId }),
  });

  const replyAllHref = composeHref({
    from: message.mailboxAddress,
    to: replyTo,
    ...(replyAllCc && { cc: replyAllCc }),
    subject: replySubject,
    body: buildQuotedBody(message.text, message.date, message.from),
    ...(message.headers.messageId && { inReplyTo: message.headers.messageId }),
  });

  const forwardHref = composeHref({
    from: message.mailboxAddress,
    subject: forwardSubject,
    body: [
      "",
      "",
      "---------- Forwarded message ----------",
      `From: ${message.from}`,
      `Date: ${message.date ? new Date(message.date).toLocaleString() : ""}`,
      `Subject: ${message.subject}`,
      `To: ${message.to}`,
      "",
      message.text,
    ].join("\n"),
  });

  return (
    <Shell title={message.subject} back={`/mailbox/${encodeURIComponent(message.mailboxAddress)}`}>
      <div className="space-y-6">
        <div className="border border-[var(--border)] rounded-lg px-5 py-4 space-y-2">
          <Field label="Mailbox" value={message.mailboxAddress} />
          <Field label="From" value={message.from} />
          <Field label="To" value={message.to} />
          {message.headers.replyTo && (
            <Field label="Reply-To" value={message.headers.replyTo} />
          )}
          <Field
            label="Date"
            value={
              message.date
                ? new Date(message.date).toLocaleString("en-US", {
                    weekday: "short",
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZoneName: "short",
                  })
                : "--"
            }
          />
          {message.headers.messageId && (
            <Field label="Message-ID" value={message.headers.messageId} mono />
          )}
        </div>

        <div className="flex gap-3">
          <ActionLink href={replyHref}>Reply</ActionLink>
          <ActionLink href={replyAllHref}>Reply all</ActionLink>
          <ActionLink href={forwardHref}>Forward</ActionLink>
        </div>

        <MessageLabelEditor
          messageId={message.messageId}
          initialLabel={message.label}
        />

        {message.ses && (
          <div className="flex gap-3 flex-wrap">
            {Object.entries(message.ses).map(([key, value]) => (
              <VerdictChip key={key} label={key} status={value.status} />
            ))}
          </div>
        )}

        {message.attachments.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider mb-2">
              Attachments
            </h3>
            <div className="space-y-1">
              {message.attachments.map((attachment) => (
                <div
                  key={`${attachment.filename}-${attachment.size}`}
                  className="text-sm border border-[var(--border)] rounded-lg px-3 py-2 flex justify-between"
                >
                  <span>{attachment.filename ?? "unnamed"}</span>
                  <span className="text-[var(--muted)] text-xs">
                    {attachment.contentType} · {(attachment.size / 1024).toFixed(1)} KB
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider mb-3">
            Body
          </h3>
          <div className="border border-[var(--border)] rounded-lg px-5 py-4 bg-[var(--surface)]">
            <pre className="text-sm whitespace-pre-wrap leading-relaxed font-sans">
              {message.text}
            </pre>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function composeHref(params: Record<string, string>): string {
  return `/compose?${new URLSearchParams(params).toString()}`;
}

function ActionLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 text-sm rounded-lg border border-[var(--border)] text-[var(--fg)] hover:bg-[var(--accent-subtle)] transition-colors"
    >
      {children}
    </Link>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="text-[var(--muted)] w-24 shrink-0">{label}</span>
      <span className={mono ? "font-mono text-xs break-all" : "break-all"}>
        {value}
      </span>
    </div>
  );
}

function VerdictChip({ label, status }: { label: string; status: string }) {
  const pass = status === "PASS";
  const colorClass = pass
    ? "text-[var(--success)] border-[var(--success)]"
    : "text-[var(--muted)] border-[var(--border)]";
  const name = label.replace("Verdict", "").toUpperCase();
  return (
    <span
      className={`text-xs border rounded-full px-2.5 py-0.5 ${colorClass}`}
    >
      {name}: {status}
    </span>
  );
}
