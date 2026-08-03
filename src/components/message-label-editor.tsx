"use client";

import { startTransition, useState } from "react";

export function MessageLabelEditor({
  messageId,
  initialLabel,
}: {
  messageId: string;
  initialLabel?: string;
}) {
  const [label, setLabel] = useState(initialLabel ?? "");
  const [savedLabel, setSavedLabel] = useState(initialLabel ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dirty = label.trim() !== savedLabel.trim();

  async function saveLabel() {
    if (!dirty) return;

    setSaving(true);
    setError("");

    const response = await fetch("/api/labels", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: messageId,
        label,
      }),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? "Failed to save label");
      setSaving(false);
      return;
    }

    startTransition(() => {
      setSavedLabel(label.trim());
      setLabel(label.trim());
      setSaving(false);
    });
  }

  function clearLabel() {
    setLabel("");
  }

  return (
    <div className="border border-[var(--border)] rounded-lg px-5 py-4">
      <div className="flex items-center justify-between gap-4 mb-3">
        <div>
          <h3 className="text-sm font-medium">Label</h3>
          <p className="text-xs text-[var(--muted)]">
            Add a lightweight classification for this message.
          </p>
        </div>
        {savedLabel ? (
          <span className="text-xs border border-[var(--border)] rounded-full px-2.5 py-1 text-[var(--muted)]">
            {savedLabel}
          </span>
        ) : (
          <span className="text-xs text-[var(--muted)]">No label</span>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label htmlFor="message-label" className="sr-only">
          Message label
        </label>
        <input
          id="message-label"
          type="text"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="priority, needs-reply, billing..."
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--fg)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-1 focus:ring-offset-[var(--bg)]"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={saveLabel}
            disabled={!dirty || saving}
            className="px-3 py-2 text-sm rounded-lg bg-[var(--accent)] text-[var(--bg)] hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save label"}
          </button>
          <button
            type="button"
            onClick={clearLabel}
            disabled={saving || !label}
            className="px-3 py-2 text-sm rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)] transition-colors disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </div>

      {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}
