"use client";

import { startTransition, useState } from "react";

interface ComposeFormProps {
  senderOptions: string[];
  initialValues: {
    from: string;
    to: string;
    cc: string;
    subject: string;
    body: string;
    inReplyTo: string;
  };
}

export function ComposeForm({
  senderOptions,
  initialValues,
}: ComposeFormProps) {
  const [from, setFrom] = useState(initialValues.from);
  const [to, setTo] = useState(initialValues.to);
  const [cc, setCc] = useState(initialValues.cc);
  const [subject, setSubject] = useState(initialValues.subject);
  const [body, setBody] = useState(initialValues.body);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");

    const response = await fetch("/api/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        cc,
        subject,
        body,
        replyToMessageId: initialValues.inReplyTo || undefined,
      }),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string; detail?: string };
      setError(data.detail ?? data.error ?? "Failed to send message");
      setSending(false);
      return;
    }

    startTransition(() => {
      setSent(true);
    });
    setSending(false);
  }

  if (sent) {
    return (
      <div className="text-center py-20">
        <p className="text-sm text-[var(--success)] mb-4">Email sent.</p>
        <button
          type="button"
          onClick={() => window.location.assign("/")}
          className="text-sm text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSend} className="space-y-4 max-w-2xl">
      <Field label="From" htmlFor="compose-from">
        <select
          id="compose-from"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--fg)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-1 focus:ring-offset-[var(--bg)]"
        >
          {senderOptions.map((address) => (
            <option key={address} value={address}>
              {address}
            </option>
          ))}
        </select>
      </Field>

      <Field label="To" htmlFor="compose-to">
        <input
          id="compose-to"
          type="text"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="recipient@example.com"
          required
          className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--fg)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-1 focus:ring-offset-[var(--bg)]"
        />
      </Field>

      <Field label="CC" htmlFor="compose-cc">
        <input
          id="compose-cc"
          type="text"
          value={cc}
          onChange={(e) => setCc(e.target.value)}
          placeholder="Optional"
          className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--fg)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-1 focus:ring-offset-[var(--bg)]"
        />
      </Field>

      <Field label="Subject" htmlFor="compose-subject">
        <input
          id="compose-subject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          required
          className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--fg)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-1 focus:ring-offset-[var(--bg)]"
        />
      </Field>

      <Field label="Body" htmlFor="compose-body">
        <textarea
          id="compose-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          required
          className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--fg)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-1 focus:ring-offset-[var(--bg)] resize-y"
        />
      </Field>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={sending || !from || !to || !subject || !body}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--accent)] text-[var(--bg)] hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {sending ? "Sending..." : "Send"}
        </button>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 items-start">
      <label
        htmlFor={htmlFor}
        className="text-sm text-[var(--muted)] w-16 shrink-0 pt-2"
      >
        {label}
      </label>
      <div className="flex-1">{children}</div>
    </div>
  );
}
