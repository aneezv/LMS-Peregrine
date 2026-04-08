'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Lock,
  MapPin,
  Video,
  ListChecks,
  MessageSquare,
  ExternalLink,
  CircleAlert,
} from 'lucide-react'
import type { ModuleUiStatus } from '@/lib/learner-module-status'

/** Matches modules grouped by week in modules/layout.tsx */
export type SidebarModule = {
  id: string
  title: string
  type: string | null
  available_from: string | null
}

type SectionGroup = {
  id: string
  title: string
  mods: SidebarModule[]
}

/** HTML id tokens: stable and safe for aria-controls */
function sectionPanelId(sectionId: string) {
  return `syllabus-panel-${sectionId.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

export default function ModuleSidebar({
  courseId,
  courseTitle,
  courseCode,
  sectionGroups,
  isEnrolled,
  isPreviewStaff = false,
  moduleUi = null,
  courseCompleted = false,
}: {
  courseId: string
  courseTitle: string
  courseCode: string
  sectionGroups: SectionGroup[]
  isEnrolled: boolean
  /** Instructor or admin: navigate all modules; time locks shown as preview elsewhere */
  isPreviewStaff?: boolean
  /** Enrolled learner progress (null for staff preview without enrollment) */
  moduleUi?: Record<string, ModuleUiStatus> | null
  /** Enrolled learner course completion (all modules complete) */
  courseCompleted?: boolean
}) {
  const params = useParams()
  const currentModuleId = params.moduleId as string
  const now = new Date()
  const navId = useId()

  const allMods = sectionGroups.flatMap((s) => s.mods)
  const totalModules = allMods.length
  const completedModules =
    isEnrolled && moduleUi
      ? allMods.reduce((acc, m) => acc + (moduleUi[m.id]?.complete ? 1 : 0), 0)
      : 0
  const completionPct =
    totalModules > 0 ? Math.round((completedModules * 100) / totalModules) : 0

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() =>
    sectionGroups.reduce<Record<string, boolean>>((acc, sec) => {
      acc[sec.id] = true
      return acc
    }, {})
  )

  const toggleSection = (secId: string) => {
    setExpandedSections((prev) => ({ ...prev, [secId]: !prev[secId] }))
  }

  const moduleIcon = (type: string | null, active: boolean) => {
    const color = active ? 'text-blue-600' : 'text-slate-400'
    switch (type) {
      case 'video':
        return <Video className={`w-4 h-4 shrink-0 ${color}`} aria-hidden />
      case 'assignment':
        return <FileText className={`w-4 h-4 shrink-0 ${color}`} aria-hidden />
      case 'live_session':
        return <CalendarDays className={`w-4 h-4 shrink-0 ${color}`} aria-hidden />
      case 'offline_session':
        return <MapPin className={`w-4 h-4 shrink-0 ${color}`} aria-hidden />
      case 'mcq':
        return <ListChecks className={`w-4 h-4 shrink-0 ${color}`} aria-hidden />
      case 'feedback':
        return <MessageSquare className={`w-4 h-4 shrink-0 ${color}`} aria-hidden />
      case 'external_resource':
        return <ExternalLink className={`w-4 h-4 shrink-0 ${color}`} aria-hidden />
      default:
        return <BookOpen className={`w-4 h-4 shrink-0 ${color}`} aria-hidden />
    }
  }

  return (
    <aside
      className="flex w-full flex-col rounded-xl border border-slate-200 bg-white shadow-sm"
      aria-label="Course syllabus"
    >
      <div className="flex items-center gap-2 border-b border-slate-100 p-5">
        <div className="min-w-0 flex items-center justify-between gap-2 w-full">
          <Link
            href={`/courses/${courseId}`}
            className="block flex-1 min-w-0 max-w-full truncate text-xs text-blue-600 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            ← {courseTitle}
          </Link>
          <span className="flex-shrink-0 rounded-full bg-blue-50 text-center px-2.5 py-1 text-xs font-semibold text-blue-700 ml-2">
            <em className="not-italic text-blue-700">{courseCode}</em>
          </span>
        </div>
      </div>

      <nav
        id={navId}
        className="p-3 space-y-4"
        aria-label="Course lessons by week"
      >
        {isEnrolled && moduleUi && totalModules > 0 && (
          <div className="px-1">
            <div className="flex items-center justify-between gap-3 text-xs">
              <p className="font-semibold text-slate-700">Progress</p>
              <p className="text-slate-500">
                <span className="font-semibold text-slate-800">{completedModules}</span>/{totalModules}
              </p>
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-slate-100 overflow-hidden border border-slate-200">
              <div
                className="h-full rounded-full bg-emerald-600 transition-[width] duration-300 motion-reduce:transition-none"
                style={{ width: `${completionPct}%` }}
                aria-hidden
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-500">{completionPct}% complete</p>
          </div>
        )}

        {sectionGroups.map((section) => {
          const expanded = expandedSections[section.id] ?? true
          const panelId = sectionPanelId(section.id)
          const triggerId = `${panelId}-trigger`

          return (
            <section key={section.id} className="space-y-1">
              <h3 className="m-0">
                <button
                  type="button"
                  id={triggerId}
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center justify-between px-2 py-1.5 text-left group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 rounded-md"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                >
                  <span className="font-semibold text-slate-600 text-xs uppercase tracking-wider group-hover:text-slate-900 transition motion-reduce:transition-none flex-1 text-left">
                    {section.title}
                  </span>
                  {expanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 shrink-0" aria-hidden />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 shrink-0" aria-hidden />
                  )}
                </button>
              </h3>

              {expanded && (
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={triggerId}
                  className="space-y-1"
                >
                  <ul className="space-y-1 list-none p-0 m-0">
                    {section.mods.map((mod) => {
                      const isActive = mod.id === currentModuleId
                      const isTimeLocked = mod.available_from != null && new Date(mod.available_from) > now
                      const isLocked =
                        !isPreviewStaff && (!isEnrolled || isTimeLocked)

                      if (isLocked) {
                        const lockReason = !isEnrolled
                          ? 'Enroll in the course to access this lesson'
                          : 'This lesson is not yet available'
                        return (
                          <li key={mod.id}>
                            <div
                              className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-transparent text-sm bg-slate-50/50"
                              title={lockReason}
                              aria-label={`${mod.title}. ${lockReason}`}
                            >
                              {moduleIcon(mod.type, false)}
                              <span className="flex-1 text-slate-400 truncate select-none" aria-hidden>
                                {mod.title}
                              </span>
                              <Lock className="w-3 h-3 text-slate-300 shrink-0" aria-hidden />
                            </div>
                          </li>
                        )
                      }

                      const ui = moduleUi?.[mod.id]

                      return (
                        <li key={mod.id}>
                          <Link
                            href={`/courses/${courseId}/modules/${mod.id}`}
                            aria-current={isActive ? 'page' : undefined}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm transition motion-reduce:transition-none group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                              isActive
                                ? 'bg-blue-50 border-blue-200 text-blue-800 shadow-sm'
                                : 'border-transparent text-slate-700 hover:bg-slate-50 hover:border-slate-200'
                            }`}
                          >
                            {moduleIcon(mod.type, isActive)}
                            <span className={`flex-1 truncate ${isActive ? 'font-semibold' : 'font-medium'}`}>
                              {mod.title}
                            </span>
                            {ui?.complete && (
                              <span
                                className="shrink-0 text-emerald-600"
                                title="Completed"
                                aria-label="Completed"
                              >
                                <Check className="w-4 h-4" aria-hidden />
                              </span>
                            )}
                            {ui?.overdue && !ui?.complete && (
                              <span
                                className="shrink-0 text-xs font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded"
                                title="Overdue"
                              >
                                Overdue
                              </span>
                            )}{
                              (ui?.in_grading && !ui.complete) && (
                                <span
                                  className="shrink-0 text-xs font-medium text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded"
                                  title="In grading"
                                >
                                  In grading
                                </span>
                              )
                            }
                            {ui?.isFailed && (
                            <CircleAlert className="w-4 h-4 text-amber-500 shrink-0" aria-label="Not passed" />
                            )}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                  {section.mods.length === 0 && (
                    <p className="text-xs text-slate-400 pl-3 py-1 italic">No lessons.</p>
                  )}
                </div>
              )}
            </section>
          )
        })}
      </nav>

      {isEnrolled && courseCompleted && (
        <div className="p-3 border-t border-slate-100">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-emerald-900">
            <div className="flex items-center gap-2 font-semibold">
              <Check className="w-4 h-4 text-emerald-700" aria-hidden />
              Course completed
            </div>
            <p className="text-xs text-emerald-800 mt-1">
              You’ve completed every lesson in this course.
            </p>
          </div>
        </div>
      )}
    </aside>
  )
}
