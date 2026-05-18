import MatrixLoader from '@/components/MatrixLoader'

export default function SettingsLoading() {
  return (
    <div className="flex min-h-[55vh] items-center justify-center">
      <MatrixLoader label="Loading settings..." />
    </div>
  )
}
