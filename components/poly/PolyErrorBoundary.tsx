'use client'

import React, { Component, ErrorInfo } from 'react'

interface Props {
    children: React.ReactNode
}

interface State {
    hasHydrationError: boolean
}

/**
 * Error Boundary specifically designed to catch React Hydration Mismatches (Error #418 / #423)
 * triggered by the Polymorphic Engine if the server/client seeds drift.
 * 
 * If a mismatch occurs, this boundary catches the crash, logs the security event,
 * and forces a clean fallback render to ensure the user experience is never broken.
 */
export class PolyErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props)
        this.state = { hasHydrationError: false }
    }

    static getDerivedStateFromError(error: Error): State {
        // Next.js hydration errors typically include terms like "hydration", "did not match", or 
        // minified error code references (418, 423) from react-dom.
        const errMessage = error.message?.toLowerCase() || ''
        const isHydrationMismatch =
            errMessage.includes('hydration') ||
            errMessage.includes('did not match') ||
            errMessage.includes('minified react error #418') ||
            errMessage.includes('minified react error #423')

        if (isHydrationMismatch) {
            return { hasHydrationError: true }
        }

        // Not a hydration error, don't handle it here
        return { hasHydrationError: false }
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        if (this.state.hasHydrationError) {
            console.error(
                '[Polymorphic Engine] Caught Hydration Mismatch. ' +
                'Falling back to unmutated DOM tree.',
                errorInfo
            )
            // In a production security system, you might emit a telemetry event here
            // fetch('/api/telemetry', { type: 'HYDRATION_DRIFT' })
        }
    }

    render() {
        if (this.state.hasHydrationError) {
            // Graceful degradation: If hydration fails catastrophically, we render the children
            // but the PolyContext will have fallen back to default class names, rendering the page
            // safely using fallback-poly.css
            return (
                <div data-poly-fallback="true" style={{ width: '100%', height: '100%' }}>
                    {this.props.children}
                </div>
            )
        }

        return this.props.children
    }
}
