import Link from "next/link";

export default function OfflinePage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[var(--background)] px-4 text-center">
      <h1 className="text-xl font-semibold text-[var(--foreground)]">
        You are offline
      </h1>
      <p className="max-w-md text-[var(--muted)]">
        This page is not available without a network connection. Check your
        connection and try again.
      </p>
      <Link
        href="/"
        className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
      >
        Go home
      </Link>
    </div>
  );
}
