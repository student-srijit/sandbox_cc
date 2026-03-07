import Topbar from '@/components/Topbar'
import HeroSection from '@/components/HeroSection'
import CustomCursor from '@/components/CustomCursor'

export default function Home() {
  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0A0A0F]">
      {/* Custom cursor */}
      <CustomCursor />

      {/* App layout */}
      <div className="relative z-10 w-screen h-screen flex flex-col overflow-hidden">
        <div className="flex-shrink-0">
          <Topbar />
        </div>
        <div className="flex-1 overflow-hidden">
          <HeroSection />
        </div>
      </div>
    </main>
  )
}
