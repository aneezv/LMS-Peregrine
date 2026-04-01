import MatrixLoader from '@/components/MatrixLoader'

export default function ModulesSegmentLoading() {
  return (
    <div className="flex min-h-[55vh] items-center justify-center">
      <MatrixLoader label="Loading lesson..." />
    </div>
  )
}
