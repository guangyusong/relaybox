"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { publicAppName } from "@/lib/public-config";

export function Shell({
  children,
  title,
  back,
}: {
  children: React.ReactNode;
  title?: string;
  back?: string;
}) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <header className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-4">
          {back && (
            <Link
              href={back}
              className="text-[var(--muted)] hover:text-[var(--fg)] transition-colors text-sm"
            >
              &larr; Back
            </Link>
          )}
          <h1 className="text-lg font-medium tracking-tight">
            {title ?? publicAppName}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/compose"
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-[var(--accent)] text-[var(--bg)] hover:opacity-90 transition-opacity"
          >
            Compose
          </Link>
          <button
            onClick={logout}
            className="text-sm text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
