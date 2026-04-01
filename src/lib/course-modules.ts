/** Group course modules for syllabus UI: Week 1, Week 2, … ordered by week_index then sort_order. */

export type ModuleWithSchedule = {
  id: string
  week_index?: number | null
  sort_order?: number | null
}

export function groupModulesByWeek<T extends ModuleWithSchedule>(modules: T[]): {
  id: string
  title: string
  mods: T[]
}[] {
  const sorted = [...modules].sort((a, b) => {
    const wa = a.week_index ?? 1
    const wb = b.week_index ?? 1
    if (wa !== wb) return wa - wb
    return (a.sort_order ?? 0) - (b.sort_order ?? 0)
  })

  const weekOrder: number[] = []
  const byWeek = new Map<number, T[]>()

  for (const m of sorted) {
    const w = m.week_index ?? 1
    if (!byWeek.has(w)) {
      byWeek.set(w, [])
      weekOrder.push(w)
    }
    byWeek.get(w)!.push(m)
  }

  weekOrder.sort((a, b) => a - b)

  return weekOrder.map((w) => ({
    id: `week-${w}`,
    title: `Week ${w}`,
    mods: byWeek.get(w)!,
  }))
}
