import { NextResponse, NextRequest } from 'next/server'

const FASTAPI_URL = 'http://127.0.0.1:8000'

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()

        const apiRes = await fetch(`${FASTAPI_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })

        const data = await apiRes.json()

        return NextResponse.json(data, { status: apiRes.ok ? 200 : apiRes.status })
    } catch (err) {
        return NextResponse.json(
            { error: { code: -32603, message: "Internal proxy error" } },
            { status: 500 }
        )
    }
}
