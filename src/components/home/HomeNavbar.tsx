import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'

export function HomeNavbar() {
  return (
    <nav className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-16 min-w-0 items-center justify-between gap-2 py-2 sm:gap-3">
          <Link href="/" className="flex min-w-0 items-center gap-2 shrink">
            <Image
              src="/logo.png"
              alt="Peregrine T&C"
              width={45}
              height={45}
              className="h-9 w-9 shrink-0 rounded-full sm:h-11 sm:w-11"
            />
            <span className="truncate text-sm font-bold text-slate-900 sm:text-lg">
              Peregrine T&amp;C
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="sm" asChild className="hidden px-2 sm:inline-flex sm:px-3">
              <Link href="/explore">Explore</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild className="px-2 sm:px-3">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild className="px-3 sm:px-4">
              <Link href="/signup" aria-label="Get started with Peregrine">
                Get started
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  )
}
