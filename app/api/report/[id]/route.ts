import { NextRequest, NextResponse } from 'next/server'
import { FASTAPI_URL } from '@/lib/backend-config'

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const threatId = params.id

        const apiRes = await fetch(`${FASTAPI_URL}/api/report/${threatId}`, {
            method: 'GET'
        })

        if (!apiRes.ok) {
            console.error("FastAPI returned error status for PDF generation:", apiRes.status)
            return NextResponse.json({ error: "Failed to generate report" }, { status: apiRes.status })
        }

        // Return the raw PDF stream wrapped in a standard NextResponse
        return new NextResponse(apiRes.body, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename=Threat_Intel_Report_${threatId}.pdf`,
            }
        })

    } catch (err) {
        console.error("Failed to proxy PDF report download:", err)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
