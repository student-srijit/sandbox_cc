import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { FASTAPI_URL } from '@/lib/backend-config'

export const runtime = 'nodejs'

const dataDir = path.join(process.cwd(), 'data')
const dbPath = path.join(dataDir, 'protected_nodes.json')

const START_NODES = 14820

function initFile() {
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true })
    }
    if (!fs.existsSync(dbPath)) {
        fs.writeFileSync(dbPath, JSON.stringify({ count: START_NODES }))
    }
}

async function isAuthorized(authHeader: string): Promise<boolean> {
    if (!authHeader.startsWith('Bearer ')) {
        return false
    }

    try {
        const res = await fetch(`${FASTAPI_URL}/api/dashboard`, {
            headers: {
                Authorization: authHeader,
                'Content-Type': 'application/json',
            },
            cache: 'no-store',
            signal: AbortSignal.timeout(2500),
        })
        return res.ok
    } catch {
        return false
    }
}

function atomicWriteJson(filePath: string, data: unknown) {
    const tempPath = `${filePath}.tmp`
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8')
    fs.renameSync(tempPath, filePath)
}

export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('authorization') || ''
        if (!(await isAuthorized(authHeader))) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        initFile()
        const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'))
        return NextResponse.json(data)
    } catch {
        return NextResponse.json({ count: START_NODES })
    }
}

export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get('authorization') || ''
        if (!(await isAuthorized(authHeader))) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        initFile()
        const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'))
        data.count += 1
        atomicWriteJson(dbPath, data)
        return NextResponse.json({ success: true, count: data.count })
    } catch {
        return NextResponse.json({ error: 'Failed to update nodes' }, { status: 500 })
    }
}
