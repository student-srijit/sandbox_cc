import Topbar from '@/components/Topbar'
import HeroSection from '@/components/HeroSection'
import ThreatFeed from '@/components/ThreatFeed'
import StatusBar from '@/components/StatusBar'
import HexGridCanvas from '@/components/HexGridCanvas'
import CustomCursor from '@/components/CustomCursor'
import AmbientLayer from '@/components/AmbientLayer'
import SvgDefs from '@/components/SvgDefs'
import DynamicTitle from '@/components/DynamicTitle'

export default function Home() {
  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0A0A0F]">
      {/* Dynamic browser tab title */}
      <DynamicTitle />

      {/* Static SVG gradient definitions */}
      <SvgDefs />

      {/* Background layers */}
      <div className="scanline-overlay" />
      <div className="scan-beam" />
      <AmbientLayer />
      <HexGridCanvas />

      {/* Custom cursor */}
      <CustomCursor />

      {/* App Grid */}
      <div
        className="
          relative z-10
          w-screen h-screen
          grid
          grid-cols-[1fr_290px]
          grid-rows-[64px_1fr_56px]
          overflow-hidden
        "
      >
        <div className="col-span-2">
          <Topbar />
        </div>

        <HeroSection />
        <ThreatFeed />

        <div className="col-span-2">
          <StatusBar />
        </div>
      </div>
    </main>
  )
}
