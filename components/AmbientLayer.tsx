/** Ambient glow blobs — pure CSS, server component */
export default function AmbientLayer() {
    return (
        <div
            className="fixed inset-0 z-0 overflow-hidden pointer-events-none"
            aria-hidden="true"
        >
            <div className="blob blob-1" />
            <div className="blob blob-2" />
            <div className="blob blob-3" />
            <div className="blob blob-4" />
        </div>
    )
}
