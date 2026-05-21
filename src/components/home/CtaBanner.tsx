import Link from 'next/link'

export function CtaBanner() {
  return (
    <section className="bg-emerald-700 py-16">
      <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Built for serious learners.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-emerald-100 sm:text-base">
          Structured programs, progress tracking, and instructor-led courses — all in one place.
        </p>
        <div className="mt-8">
          <Link
            href="/signup"
            className="inline-flex items-center rounded-xl bg-white px-6 py-3 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-700"
          >
            Get started
          </Link>
        </div>
      </div>
    </section>
  )
}
