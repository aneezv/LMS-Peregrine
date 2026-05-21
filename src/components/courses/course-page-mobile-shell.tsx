'use client'

import type { ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { BookOpen, Info } from 'lucide-react'

type Props = {
  hero: ReactNode
  titleBlock: ReactNode
  overview: ReactNode
  syllabus: ReactNode
  defaultTab?: 'overview' | 'syllabus'
  /** Pinned between hero and title, right side (e.g. completion name-tag). */
  completionBadge?: ReactNode
  /** Fixed above the safe area on small screens (e.g. primary CTA). Hidden at `xl`. */
  stickyBottomBar?: ReactNode
  /** When true, lift the sticky bar above the learner BottomNav (~3.5rem + safe-area). */
  liftAboveBottomNav?: boolean
}

/**
 * Coursera-inspired mobile layout: full-width hero, title block, then segmented Overview / Syllabus.
 * Hidden from `xl` — desktop uses the two-column course layout in the page.
 */
export function CoursePageMobileShell({
  hero,
  titleBlock,
  overview,
  syllabus,
  defaultTab = 'overview',
  completionBadge,
  stickyBottomBar,
  liftAboveBottomNav = false,
}: Props) {
  return (
    <>
    <div
      className={cn(
        'lg:hidden',
        stickyBottomBar
          ? liftAboveBottomNav
            ? 'pb-[calc(9.25rem+env(safe-area-inset-bottom,0px))]'
            : 'pb-[calc(6rem+env(safe-area-inset-bottom,0px))]'
          : 'pb-6',
      )}
    >
      <div className="-mx-1 flex flex-col overflow-visible rounded-none border-x-0 border-t-0 border-border bg-card shadow-sm sm:mx-0 sm:overflow-clip sm:rounded-xl sm:border sm:border-border">
        <div className="relative shrink-0">
          {hero}
          {completionBadge ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-end pr-3 sm:pr-4">
              <div className="translate-y-1/2 rotate-[-2deg]">{completionBadge}</div>
            </div>
          ) : null}
        </div>
        <div
          className={`flex flex-col gap-2 border-b border-border px-4 pb-3 ${completionBadge ? 'pt-8 sm:pt-9' : 'pt-4'}`}
        >
          {titleBlock}
        </div>
        <Tabs defaultValue={defaultTab} className="flex flex-col gap-0 py-2">
          <TabsList
            variant="line"
            className="sticky top-16 z-20 grid h-11 w-full grid-cols-2 rounded-none border-b shadow border-border bg-background/95 px-0 backdrop-blur supports-[backdrop-filter]:bg-background/80"
          >
            <TabsTrigger value="overview" className="rounded-none text-[13px]">
              <Info className="size-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="syllabus" className="rounded-none text-[13px]">
              <BookOpen className="size-4 mr-2" />
              Syllabus
            </TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-0 flex flex-col gap-4 px-4 py-4">
            {overview}
          </TabsContent>
          <TabsContent value="syllabus" className="mt-0 flex flex-col gap-0 px-0 py-0">
            {syllabus}
          </TabsContent>
        </Tabs>
      </div>
    </div>

    {stickyBottomBar ? (
      <div
        className={cn(
          'fixed inset-x-0 z-40 border-t border-border bg-background/95 px-4 pt-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/80 lg:hidden',
          liftAboveBottomNav
            ? 'bottom-[calc(3.25rem+env(safe-area-inset-bottom,0px))] pb-3'
            : 'bottom-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]',
        )}
        role="region"
        aria-label="Course actions"
      >
        {stickyBottomBar}
      </div>
    ) : null}
    </>
  )
}
