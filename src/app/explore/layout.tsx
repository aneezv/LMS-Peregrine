import { SiteNavbar } from '@/components/site/SiteNavbar'
import { HomeFooter } from '@/components/home/HomeFooter'

export default function ExploreLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <SiteNavbar />
      <main className="flex-1">{children}</main>
      <HomeFooter />
    </div>
  )
}
