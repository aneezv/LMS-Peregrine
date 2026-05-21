import Link from 'next/link'
import Image from 'next/image'
import { Heart } from 'lucide-react'

export function HomeFooter() {
  return (
    <footer className="bg-slate-900 py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt="Peregrine T&C"
              width={32}
              height={32}
              className="shrink-0 rounded-full"
            />
            <span className="text-sm font-semibold text-slate-300">Peregrine T&C</span>
          </div>

          {/* Nav groups */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-2 sm:gap-x-12">
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Explore
              </p>
              <Link href="/explore" className="text-sm text-slate-400 transition hover:text-slate-200">
                Courses
              </Link>
              <Link href="/login" className="text-sm text-slate-400 transition hover:text-slate-200">
                Sign in
              </Link>
              <Link href="/signup" className="text-sm text-slate-400 transition hover:text-slate-200">
                Get started
              </Link>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Legal
              </p>
              <a
                href="https://www.peregrinehub.com/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-slate-400 transition hover:text-slate-200"
              >
                Privacy policy
              </a>
              <a
                href="https://www.peregrinehub.com/terms-conditions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-slate-400 transition hover:text-slate-200"
              >
                Terms &amp; conditions
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-slate-800 pt-5 sm:flex-row">
          <p className="text-xs text-slate-500">
            &copy; {new Date().getFullYear()}&nbsp; Peregrine T&amp;C. All rights reserved.
          </p>
          <p className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            Built with
            <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500" aria-hidden />
            in Kerala
          </p>
        </div>
      </div>
    </footer>
  )
}
