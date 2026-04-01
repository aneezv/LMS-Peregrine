import CourseBuilder from '@/components/CourseBuilder'
import { AppCard, PageHeader } from '@/components/ui/primitives'

export default function NewCoursePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Create New Course" description="Design your syllabus, add lessons, and configure completion criteria." />
      
      <AppCard className="p-4 sm:p-6">
        <CourseBuilder />
      </AppCard>
    </div>
  )
}
