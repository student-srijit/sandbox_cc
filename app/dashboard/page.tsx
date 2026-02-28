import ThreatMap from '@/components/dashboard/ThreatMap'
import HoneypotSessions from '@/components/dashboard/HoneypotSessions'
import AttackTaxonomy from '@/components/dashboard/AttackTaxonomy'
import DOMMutationLog from '@/components/dashboard/DOMMutationLog'
import ThreatFeed from '@/components/ThreatFeed'
import SystemHealth from '@/components/dashboard/SystemHealth'
import DashboardHeader from '@/components/dashboard/DashboardHeader'
import ThreatContainedTrigger from '@/components/dashboard/ThreatContainedTrigger'

export default function DashboardPage() {
    return (
        <div className="w-screen h-screen bg-black overflow-hidden flex flex-col">
            {/* Header */}
            <DashboardHeader />

            {/* Main Grid — 12 columns */}
            <div className="flex-1 grid grid-cols-12 grid-rows-[1fr_1fr] gap-px overflow-hidden" style={{ minHeight: 0 }}>
                {/* Row 1 */}
                <div className="col-span-8 row-span-1 wr-panel overflow-hidden">
                    <ThreatMap />
                </div>
                <div className="col-span-4 row-span-1 wr-panel overflow-hidden">
                    <HoneypotSessions />
                </div>

                {/* Row 2 */}
                <div className="col-span-4 row-span-1 wr-panel overflow-hidden">
                    <AttackTaxonomy />
                </div>
                <div className="col-span-4 row-span-1 wr-panel overflow-hidden">
                    <DOMMutationLog />
                </div>
                <div className="col-span-4 row-span-1 wr-panel flex flex-col overflow-hidden">
                    <ThreatFeed />
                </div>
            </div>

            {/* Bottom Health Bar */}
            <SystemHealth />

            {/* Threat Contained Overlay (trigger wrapper) */}
            <ThreatContainedTrigger />
        </div>
    )
}
