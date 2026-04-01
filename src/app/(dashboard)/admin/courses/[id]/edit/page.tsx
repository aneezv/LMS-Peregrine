import CourseBuilder from '@/components/CourseBuilder'
import { AppCard, PageHeader } from '@/components/ui/primitives'

export default async function EditCoursePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <div className="space-y-4 p-2">
      <PageHeader title="Edit Course" description="Update title, syllabus, modules, and publish status." />

      <AppCard className="p-2">
        <CourseBuilder courseId={id} />
      </AppCard>
    </div>
  )
}
