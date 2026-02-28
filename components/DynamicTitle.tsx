'use client'

import { useEffect, useRef } from 'react'

function randomHex(len: number) {
    return '0x' + Array.from({ length: len }, () =>
        Math.floor(Math.random() * 16).toString(16)
    ).join('').toUpperCase()
}

export default function DynamicTitle() {
    useEffect(() => {
        let toggle = true
        const id = setInterval(() => {
            if (toggle) {
                document.title = 'BHOOL BHULAIYAA | SHIELD ACTIVE'
            } else {
                document.title = `BHOOL BHULAIYAA | ${randomHex(8)}`
            }
            toggle = !toggle
        }, 3000)

        return () => clearInterval(id)
    }, [])

    return null // renders nothing
}
