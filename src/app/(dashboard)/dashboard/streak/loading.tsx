import MatrixLoader from '@/components/MatrixLoader'

export default function StreakLoading() {
  return (
    <div className="flex min-h-[55vh] items-center justify-center">
      <MatrixLoader label="Loading your streak..." />
    </div>
  )
}
