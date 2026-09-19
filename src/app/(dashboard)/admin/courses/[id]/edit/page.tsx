import CourseBuilder from '@/components/CourseBuilder'

export default async function EditCoursePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <div className="w-full">
      <CourseBuilder courseId={id} />
    </div>
  )
}
