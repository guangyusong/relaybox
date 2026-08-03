"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { publicAppName } from "@/lib/public-config";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      startTransition(() => {
        router.push("/");
      });
    } else {
      setError("Invalid password");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-medium tracking-tight mb-1">{publicAppName}</h1>
        <p className="text-sm text-[var(--muted)] mb-8">
          Sign in to manage your inboxes.
        </p>
        <form onSubmit={handleSubmit}>
          <label
            htmlFor="admin-password"
            className="block text-sm text-[var(--muted)] mb-2"
          >
            Admin password
          </label>
          <input
            id="admin-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            autoFocus
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--fg)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-1 focus:ring-offset-[var(--bg)]"
          />
          {error && (
            <p className="text-sm text-[var(--danger)] mt-2">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full mt-4 px-3 py-2 text-sm font-medium rounded-lg bg-[var(--accent)] text-[var(--bg)] hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
