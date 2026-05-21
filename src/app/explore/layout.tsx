import { HomeNavbar } from '@/components/home/HomeNavbar'
import { HomeFooter } from '@/components/home/HomeFooter'

export default function ExploreLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <HomeNavbar />
      <main className="flex-1">{children}</main>
      <HomeFooter />
    </div>
  )
}
