import Link from "next/link";
import { Shell } from "@/components/shell";
import { requirePageAuth } from "@/lib/auth";
import { listMessages } from "@/lib/mail-service";

export default async function MailboxPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  await requirePageAuth();

  const { address } = await params;
  const decodedAddress = decodeURIComponent(address);
  const messages = await listMessages(decodedAddress);

  return (
    <Shell title={decodedAddress} back="/">
      {messages.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-[var(--muted)] text-sm">
            No messages in this mailbox yet.
          </p>
        </div>
      ) : (
        <div className="border border-[var(--border)] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--accent-subtle)]">
                <th className="text-left px-4 py-3 font-medium text-[var(--muted)]">
                  Subject
                </th>
                <th className="text-left px-4 py-3 font-medium text-[var(--muted)]">
                  From
                </th>
                <th className="text-left px-4 py-3 font-medium text-[var(--muted)]">
                  Label
                </th>
                <th className="text-left px-4 py-3 font-medium text-[var(--muted)]">
                  Date
                </th>
                <th className="text-left px-4 py-3 font-medium text-[var(--muted)]">
                  Size
                </th>
              </tr>
            </thead>
            <tbody>
              {messages.map((message) => (
                <tr
                  key={message.messageId}
                  className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--accent-subtle)] transition-colors"
                >
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/message/${message.messageId}?mailbox=${encodeURIComponent(
                        decodedAddress
                      )}`}
                    >
                      {message.subject}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)] text-xs truncate max-w-56">
                    {message.from}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)] text-xs">
                    {message.label ? (
                      <span className="inline-flex items-center rounded-full border border-[var(--border)] px-2 py-0.5">
                        {message.label}
                      </span>
                    ) : (
                      "--"
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)] text-xs whitespace-nowrap">
                    {message.date
                      ? new Date(message.date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "--"}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)] text-xs">
                    {formatSize(message.size)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}

function formatSize(bytes: number): string {
  if (!bytes) return "--";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
