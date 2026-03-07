import dynamic from "next/dynamic";

const ThreatMapLeaflet = dynamic(() => import("./ThreatMapLeaflet"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-[#020a07] border border-[#123428] text-[10px] tracking-[0.2em] text-[#8ca39c] uppercase">
      Loading Real Threat Map...
    </div>
  ),
});

export default function ThreatMap() {
  return <ThreatMapLeaflet />;
}
