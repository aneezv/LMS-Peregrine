import { createClient } from '@/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { Award, BookOpen, CalendarDays, Check, IndianRupee, Info, User } from 'lucide-react'
import EnrollButton from '@/components/EnrollButton'
import CourseManageBar from '@/components/CourseManageBar'
import ExpandableText from '@/components/ExpandableText'
import { groupModulesBySection } from '@/lib/course-modules'
import { getLearnerModuleStatusMap } from '@/lib/learner-module-status'
import { toRenderableImageUrl } from '@/lib/drive-image'
import { formatLocalDisplay } from '@/lib/timestamp'
import { ROLES } from '@/lib/roles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { CoursePageMobileShell } from '@/components/courses/course-page-mobile-shell'
import {
  CourseSyllabusAccordion,
  type SyllabusWeek,
} from '@/components/courses/course-syllabus-accordion'
import { cn } from '@/lib/utils'
import { unwrapSingle } from '@/lib/catalog-courses'
import { finalPrice, formatINR } from '@/lib/course-price'

export default async function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const isAuthenticated = !!user

  // Queries that don't need auth
  const [courseResult, modulesResult, sectionsResult] = await Promise.all([
    supabase
      .from('courses')
      .select(`
        id, instructor_id, course_code, title, description, thumbnail_url, starts_at, enrollment_type,
        price, discount_percent,
        profiles:instructor_id ( full_name ),
        department:department_id ( id, name )
      `)
      .eq('id', id)
      .single(),
    supabase
      .from('modules')
      .select('id, title, type, available_from, is_sequential, sort_order, week_index, section_id')
      .eq('course_id', id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('sections')
      .select('id, title, sort_order')
      .eq('course_id', id)
      .order('sort_order', { ascending: true }),
  ])

  const course = courseResult.data
  if (!course) notFound()

  // Auth-dependent queries
  let profileRole: string | null = null
  let isEnrolled = false

  if (user) {
    const [profileResult, enrollmentResult] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
      supabase.from('enrollments').select('id').eq('course_id', id).eq('learner_id', user.id).maybeSingle(),
    ])
    profileRole = profileResult.data?.role ?? null
    isEnrolled = !!enrollmentResult.data
  }

  const isAdmin = profileRole === ROLES.ADMIN
  const isCourseInstructor = !!user && course.instructor_id === user.id
  const isCourseStaff = isCourseInstructor || isAdmin
  const canManageCourse = isCourseInstructor || isAdmin

  if (course.enrollment_type === 'invite_only' && !isCourseStaff && !isEnrolled) {
    redirect('/courses')
  }

  const modules = modulesResult.data
  const sectionGroups = groupModulesBySection(modules ?? [], sectionsResult.data ?? [])

  const moduleUi = isEnrolled && user
    ? await getLearnerModuleStatusMap(
        supabase,
        id,
        user.id,
        (modules ?? []).map((m) => ({ id: m.id, type: m.type })),
      )
    : null

  const totalModules = modules?.length ?? 0

  const eligibleForCompletion =
    !!moduleUi && (modules ?? []).length > 0 && (modules ?? []).every((m) => moduleUi[m.id]?.complete)

  const completedModules = moduleUi
    ? (modules ?? []).reduce((acc, m) => acc + (moduleUi[m.id]?.complete ? 1 : 0), 0)
    : 0

  const completionPct = totalModules > 0 ? Math.round((completedModules * 100) / totalModules) : 0

  let completionRow = isEnrolled && user
    ? (
        await supabase
          .from('course_completions')
          .select('completed_at')
          .eq('course_id', id)
          .eq('learner_id', user.id)
          .maybeSingle()
      ).data
    : null

  if (isEnrolled && user && eligibleForCompletion && !completionRow?.completed_at) {
    await supabase.from('course_completions').insert({
      course_id: id,
      learner_id: user.id,
    })
    completionRow = { completed_at: new Date().toISOString() }
  }

  const completedInternship = !!completionRow?.completed_at

  const now = new Date()

  const instructorName =
    (course.profiles as { full_name?: string } | null)?.full_name ?? 'Unknown'

  const coursePrice = Number((course as { price?: number | string }).price ?? 0) || 0
  const courseDiscount = Number((course as { discount_percent?: number | string }).discount_percent ?? 0) || 0
  const courseFinalPrice = finalPrice({ price: coursePrice, discount_percent: courseDiscount })

  const departmentName =
    unwrapSingle(
      course.department as { name?: string } | { name?: string }[] | null | undefined,
    )?.name?.trim() ?? null

  const syllabusWeeks: SyllabusWeek[] = sectionGroups.map((section) => ({
    id: section.id,
    title: section.title,
    mods: section.mods.map((mod) => {
      const isTimeLocked = !!(mod.available_from && new Date(mod.available_from) > now)
      const learnerBlocked = !isEnrolled || isTimeLocked
      const ui = moduleUi?.[mod.id]
      const variant = isCourseStaff ? 'staff' : learnerBlocked ? 'locked' : 'open'
      const lockDateLabel =
        isTimeLocked && mod.available_from
          ? formatLocalDisplay(mod.available_from, true)
          : null

      return {
        id: mod.id,
        title: mod.title,
        type: mod.type,
        variant,
        href: `/courses/${id}/modules/${mod.id}`,
        timeLocked: isTimeLocked,
        lockDateLabel,
        weekIndex: mod.week_index ?? null,
        ui: {
          complete: !!ui?.complete,
          overdue: !!ui?.overdue && !ui?.complete,
          in_grading: !!ui?.in_grading && !ui?.complete,
          isFailed: !!ui?.isFailed,
        },
      }
    }),
  }))

  const syllabusBody =
    sectionGroups.length === 0 ? (
      <div className="p-4">
        <Empty className="border border-dashed border-border bg-muted/30">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpen aria-hidden />
            </EmptyMedia>
            <EmptyTitle>No lessons yet</EmptyTitle>
            <EmptyDescription>No lessons have been added yet.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    ) : (
      <CourseSyllabusAccordion weeks={syllabusWeeks} />
    )

  const renderCourseCodeThumbnailBadge = (surface: 'photo' | 'panel' = 'photo') => (
    <div
      className="pointer-events-none absolute bottom-2 left-3 z-[6] sm:bottom-3 sm:left-4"
      aria-label={`Course code ${course.course_code}`}
    >
      {surface === 'photo' ? (
        <>
          <p className="text-[9px] font-medium uppercase tracking-wider text-white/80 [text-shadow:0_1px_3px_rgba(0,0,0,0.55)]">
            Course code
          </p>
          <p className="font-mono text-[13px] font-semibold tabular-nums tracking-tight text-white [text-shadow:0_1px_5px_rgba(0,0,0,0.65)]">
            {course.course_code}
          </p>
        </>
      ) : (
        <>
          <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Course code</p>
          <p className="font-mono text-[13px] font-semibold tabular-nums text-foreground">{course.course_code}</p>
        </>
      )}
    </div>
  )

  const mobileHero = course.thumbnail_url ? (
    <div className="relative h-36 w-full min-w-0 overflow-hidden bg-muted sm:h-40">
      <img
        src={toRenderableImageUrl(course.thumbnail_url)}
        alt=""
        className="absolute inset-0 block size-full min-h-full min-w-full object-cover object-center"
      />
      <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-foreground/80 via-foreground/30 to-transparent" />
      {renderCourseCodeThumbnailBadge()}
    </div>
  ) : (
    <div className="relative flex h-36 w-full items-center justify-center overflow-hidden bg-muted sm:h-40">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-foreground/70 via-foreground/20 to-transparent" />
      <BookOpen className="relative z-0 size-14 text-muted-foreground opacity-40" aria-hidden />
      {renderCourseCodeThumbnailBadge('photo')}
    </div>
  )

  const showCompletionChestBadge = isEnrolled && (completedInternship || eligibleForCompletion)

  const completionChestBadge = showCompletionChestBadge ? (
    <div
      role="status"
      aria-label="Internship completed"
      className="inline-flex flex-col items-center gap-0.5 rounded-md border-[2.5px] border-emerald-800 bg-linear-to-b from-white via-white to-emerald-50 px-3 py-2 text-center shadow-[0_3px_12px_rgba(6,95,70,0.22)] ring-2 ring-white"
    >
      <div className="flex items-center gap-1.5">
        <Award className="size-4 shrink-0 text-emerald-700" aria-hidden strokeWidth={2.2} />
        <span className="text-[11px] font-black uppercase leading-none tracking-wide text-emerald-950">
          Completed
        </span>
      </div>
    </div>
  ) : null

  const enrollmentTitleIndicator =
    !isCourseStaff && isEnrolled && !(completedInternship || eligibleForCompletion) ? (
      <div className="flex justify-end gap-1.5">
        <div className="inline-flex w-fit max-w-full items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 py-1 pl-1 pr-3 text-emerald-950 shadow-sm ring-1 ring-emerald-100/70">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-inner">
            <Check className="size-3.5" aria-hidden strokeWidth={3} />
          </span>
          <span className="text-xs font-semibold sm:text-[13px]">Enrolled</span>
        </div>
      </div>
    ) : null

  const courseMetaSubtitle = (
    <p className="text-[13px] leading-snug text-muted-foreground sm:text-sm">
      {departmentName ? (
        <>
          <Badge variant="secondary" className="mr-2 align-middle font-normal">
            {departmentName}
          </Badge>
        </>
      ) : null}
      <span className="font-medium text-foreground/90">{instructorName}</span>
      {totalModules > 0 && (
        <>
          {' · '}
          {totalModules} lesson{totalModules !== 1 ? 's' : ''}
        </>
      )}
      {sectionGroups.length > 0 && (
        <>
          {' · '}
          {sectionGroups.length} week{sectionGroups.length === 1 ? '' : 's'}
        </>
      )}
    </p>
  )

  const renderEnrolledProgressSection = (opts?: { bleed?: boolean }) => {
    const bleed = opts?.bleed !== false
    return isEnrolled ? (
      <div
        className={cn(
          'mt-2 flex flex-col gap-2 border-t border-border/80  px-4 pt-3',
          bleed ? '-mx-4' : 'w-full',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] font-medium text-foreground">
          <span>Your progress</span>
          <span className="tabular-nums text-muted-foreground">
            <span className="font-semibold text-foreground">{completedModules}</span>/{totalModules} lessons
          </span>
        </div>
        <Progress value={completionPct} className="h-2" />
        <p className="text-[11px] text-muted-foreground">{completionPct}% complete</p>
      </div>
    ) : null
  }

  const showEnrollButton = !isCourseStaff && !isEnrolled

  const mobileTitleBlock = (
    <div className="flex flex-col gap-2">
      <h1 className="font-heading text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-2xl">
        {course.title}
      </h1>
      {enrollmentTitleIndicator}
      {courseMetaSubtitle}
      {renderEnrolledProgressSection()}
    </div>
  )

  const renderOverview = (opts?: { showEnrollInline?: boolean }) => {
    const showEnrollInline = opts?.showEnrollInline !== false

    return (
      <div className="flex flex-col gap-4 sm:gap-5">
        <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
          {course.starts_at && (
            <div className="flex min-h-16 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white">
                <CalendarDays className="size-4 text-blue-600" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Starts</p>
                <p className="truncate text-sm font-semibold text-slate-900">
                  {formatLocalDisplay(course.starts_at, false)}
                </p>
              </div>
            </div>
          )}

          <div className="flex min-h-16 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white">
              <User className="size-4 text-blue-600" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Instructor</p>
              <p className="truncate text-sm font-semibold text-slate-900">{instructorName}</p>
            </div>
          </div>

          <div className="flex min-h-16 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 sm:col-span-2">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white">
              <IndianRupee className="size-4 text-blue-600" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Price</p>
              {coursePrice <= 0 ? (
                <p className="text-sm font-semibold text-emerald-700">Free</p>
              ) : (
                <p className="flex items-baseline gap-2">
                  {courseDiscount > 0 && (
                    <span className="text-xs text-slate-400 line-through">{formatINR(coursePrice)}</span>
                  )}
                  <span className="text-sm font-semibold text-slate-900">
                    {formatINR(courseFinalPrice)}
                  </span>
                  {courseDiscount > 0 && (
                    <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                      {Math.round(courseDiscount)}% off
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
        </div>

        {course.description && (
          <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 sm:px-4">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              About this course
            </h3>
            <ExpandableText text={course.description} className="text-sm leading-relaxed text-slate-700" clampLines={5} />
          </div>
        )}

        {showEnrollButton && showEnrollInline && (
          <EnrollButton
            courseId={id}
            courseTitle={course.title}
            price={coursePrice}
            discountPercent={courseDiscount}
            isAuthenticated={isAuthenticated}
          />
        )}

        {isCourseStaff && (
          <Alert className="border-blue-200 bg-blue-50/60">
            <Info className="text-blue-700" aria-hidden />
            <AlertTitle className="text-blue-900">Staff Preview</AlertTitle>
            <AlertDescription className="text-blue-800/90">
              You&apos;re viewing this course as staff. Links open lesson content for preview.
            </AlertDescription>
          </Alert>
        )}
      </div>
    )
  }

  return (
    <>
      <CoursePageMobileShell
        hero={mobileHero}
        titleBlock={mobileTitleBlock}
        defaultTab={isEnrolled && !completedInternship ? 'syllabus' : 'overview'}
        completionBadge={completionChestBadge}
        overview={
          <>
            {renderOverview({ showEnrollInline: false })}
            {canManageCourse && (
              <div className="pt-1">
                <CourseManageBar courseId={id} isAdmin={isAdmin} />
              </div>
            )}
          </>
        }
        syllabus={syllabusBody}
        stickyBottomBar={
          showEnrollButton ? (
            <EnrollButton
            courseId={id}
            courseTitle={course.title}
            price={coursePrice}
            discountPercent={courseDiscount}
            isAuthenticated={isAuthenticated}
          />
          ) : undefined
        }
        liftAboveBottomNav={isAuthenticated && !isCourseStaff}
      />

      <div className="mx-auto hidden w-full max-w-7xl flex-col gap-6 lg:grid lg:max-w-none lg:grid-cols-[minmax(0,1fr)_minmax(260px,22rem)] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,26rem)] xl:gap-8">
        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1">
          <Card className="gap-0 overflow-hidden p-0 shadow-sm">
            {course.thumbnail_url ? (
              <div className="relative h-36 w-full min-w-0 overflow-visible bg-muted sm:h-44">
                <img
                  src={toRenderableImageUrl(course.thumbnail_url)}
                  alt=""
                  className="absolute inset-0 block size-full min-h-full min-w-full object-cover object-center"
                />
                <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-foreground/70 via-foreground/25 to-transparent" />
                {renderCourseCodeThumbnailBadge('photo')}
                {showCompletionChestBadge ? (
                  <div className="pointer-events-none absolute bottom-0 right-3 z-10 translate-y-1/2 rotate-[-2deg] sm:right-5">
                    {completionChestBadge}
                  </div>
                ) : null}
              </div>
            ) : (
              <div
                className={`relative min-h-[6.5rem] border-b border-border px-4 py-5 ${showCompletionChestBadge ? 'bg-emerald-50/35' : 'bg-muted/40'}`}
              >
                {renderCourseCodeThumbnailBadge('panel')}
                {showCompletionChestBadge ? (
                  <div className="pointer-events-none absolute bottom-3 right-4 z-10 rotate-[-2deg] sm:bottom-4 sm:right-5">
                    {completionChestBadge}
                  </div>
                ) : null}
              </div>
            )}

            <CardHeader
              className={cn(
                'flex flex-col gap-0 border-b border-border px-0 pb-4',
                course.thumbnail_url
                  ? showCompletionChestBadge
                    ? 'pt-8 sm:pt-9'
                    : 'pt-5 sm:pt-6'
                  : 'pt-4',
              )}
            >
              <div className="flex flex-col gap-3 px-4">
                <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  {course.title}
                </h1>
                {enrollmentTitleIndicator}
                {courseMetaSubtitle}
              </div>
              {renderEnrolledProgressSection({ bleed: false })}
            </CardHeader>

            <CardContent className="flex flex-col gap-4 px-4 pb-6 pt-4">
              {renderOverview()}
              {canManageCourse && <CourseManageBar courseId={id} isAdmin={isAdmin} />}
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 lg:sticky lg:top-20 lg:col-start-2 lg:self-start">
          <Card className="flex max-h-none flex-col gap-0 overflow-hidden shadow-sm lg:max-h-[calc(100vh-6rem)]">
            <CardHeader className="shrink-0 pb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-lg">Course Syllabus</CardTitle>
                <Badge variant="outline">
                  {sectionGroups.length} week{sectionGroups.length === 1 ? '' : 's'}
                </Badge>
              </div>
            </CardHeader>
            <Separator />
            <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto p-0">
              {syllabusBody}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
