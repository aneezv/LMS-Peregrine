'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import {
  BookOpen,
  ClipboardCheck,
  Clock,
  LayoutDashboard,
  LogOut,
  Menu,
  PlusCircle,
  UserCheck,
  Users,
  X,
} from 'lucide-react'

type NavItem = {
  href: string
  label: string
  icon: 'dashboard' | 'courses' | 'grading' | 'attendance' | 'internship' | 'createCourse' | 'users'
}

export default function DashboardNavDrawer({
  name,
  role,
  links,
}: {
  name: string
  role: string
  links: NavItem[]
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const iconFor = (icon: NavItem['icon']) => {
    switch (icon) {
      case 'dashboard':
        return <LayoutDashboard className="h-4 w-4" />
      case 'courses':
        return <BookOpen className="h-4 w-4" />
      case 'grading':
        return <ClipboardCheck className="h-4 w-4" />
      case 'attendance':
        return <UserCheck className="h-4 w-4" />
      case 'internship':
        return <Clock className="h-4 w-4" />
      case 'createCourse':
        return <PlusCircle className="h-4 w-4" />
      case 'users':
        return <Users className="h-4 w-4" />
      default:
        return <BookOpen className="h-4 w-4" />
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-lg border border-slate-200 px-2.5 py-2 text-slate-700 hover:bg-slate-100"
        aria-label="Open navigation menu"
        aria-expanded={open}
      >
        <Menu className="h-4 w-4" />
      </button>

      {open && mounted && createPortal(
        <>
          <button
            type="button"
            aria-label="Close menu overlay"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-slate-950/35"
          />

          <aside className="fixed inset-y-0 right-0 z-50 flex h-[100dvh] w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">{name}</p>
                <p className="text-xs capitalize text-slate-500">{role}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close navigation menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {links.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  {iconFor(item.icon)}
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="border-t border-slate-100 p-3">
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </form>
            </div>
          </aside>
        </>,
        document.body,
      )}
    </>
  )
}

