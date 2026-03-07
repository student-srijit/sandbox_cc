import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

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

export async function GET() {
    try {
        initFile()
        const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'))
        return NextResponse.json(data)
    } catch {
        return NextResponse.json({ count: START_NODES })
    }
}

export async function POST() {
    try {
        initFile()
        const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'))
        data.count += 1
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2))
        return NextResponse.json({ success: true, count: data.count })
    } catch {
        return NextResponse.json({ error: 'Failed to update nodes' }, { status: 500 })
    }
}
