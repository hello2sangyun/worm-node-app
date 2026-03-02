/**
 * WORM Node — Flat SVG Icon Library
 * All icons are 16×16, stroke-based, design matches Lucide/Heroicons style.
 * Usage: <Icon.Dashboard size={16} color="currentColor" />
 */

interface IconProps {
    size?: number;
    color?: string;
    style?: React.CSSProperties;
    className?: string;
}

const base = ({ size = 16, color = 'currentColor', style, className }: IconProps, children: React.ReactNode) => (
    <svg
        width={size} height={size} viewBox="0 0 16 16"
        fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
        className={className}
    >
        {children}
    </svg>
);

export const Icon = {
    // ── Navigation ───────────────────────────────────────────────
    Dashboard: (p: IconProps) => base(p, <>
        <rect x="1" y="1" width="6" height="6" rx="1" />
        <rect x="9" y="1" width="6" height="6" rx="1" />
        <rect x="1" y="9" width="6" height="6" rx="1" />
        <rect x="9" y="9" width="6" height="6" rx="1" />
    </>),

    Storage: (p: IconProps) => base(p, <>
        <ellipse cx="8" cy="5" rx="6" ry="2.5" />
        <path d="M2 5v3c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V5" />
        <path d="M2 8v3c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V8" />
    </>),

    Chain: (p: IconProps) => base(p, <>
        <path d="M6 4h-.5A2.5 2.5 0 0 0 3 6.5v0A2.5 2.5 0 0 0 5.5 9H6" />
        <path d="M10 4h.5A2.5 2.5 0 0 1 13 6.5v0A2.5 2.5 0 0 1 10.5 9H10" />
        <line x1="6" y1="6.5" x2="10" y2="6.5" />
        <rect x="2" y="10" width="5" height="4" rx="1" />
        <rect x="9" y="10" width="5" height="4" rx="1" />
        <line x1="4.5" y1="10" x2="4.5" y2="8.5" />
        <line x1="11.5" y1="10" x2="11.5" y2="8.5" />
    </>),

    Settings: (p: IconProps) => base(p, <>
        <circle cx="8" cy="8" r="2.5" />
        <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1" />
    </>),

    // ── Actions ──────────────────────────────────────────────────
    Play: (p: IconProps) => base(p, <>
        <polygon points="4,2 14,8 4,14" fill="currentColor" stroke="none" />
    </>),

    Stop: (p: IconProps) => base(p, <>
        <rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />
    </>),

    Launch: (p: IconProps) => base(p, <>
        <path d="M8 13V3M4 7l4-4 4 4" />
        <path d="M3 13h10" />
    </>),

    Resume: (p: IconProps) => base(p, <>
        <polyline points="1,4 1,1 4,1" />
        <path d="M1 1a7 7 0 1 1-1 5" />
    </>),

    Logout: (p: IconProps) => base(p, <>
        <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
        <polyline points="11,11 14,8 11,5" />
        <line x1="14" y1="8" x2="5" y2="8" />
    </>),

    Retry: (p: IconProps) => base(p, <>
        <polyline points="1,4 1,1 4,1" />
        <path d="M1 1a7 7 0 1 1-1 5" />
    </>),

    Menu: (p: IconProps) => base(p, <>
        <circle cx="8" cy="4" r="1" fill="currentColor" stroke="none" />
        <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
        <circle cx="8" cy="12" r="1" fill="currentColor" stroke="none" />
    </>),

    Close: (p: IconProps) => base(p, <>
        <line x1="3" y1="3" x2="13" y2="13" />
        <line x1="13" y1="3" x2="3" y2="13" />
    </>),

    Save: (p: IconProps) => base(p, <>
        <path d="M13 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V4.4L11.6 2" />
        <rect x="5" y="9" width="6" height="5" />
        <rect x="5" y="2" width="5" height="3" />
    </>),

    UnstakeLock: (p: IconProps) => base(p, <>
        <rect x="3" y="7" width="10" height="7" rx="1" />
        <path d="M5 7V5a3 3 0 0 1 6 0v2" />
        <circle cx="8" cy="10.5" r="1" fill="currentColor" stroke="none" />
    </>),

    UpdateStake: (p: IconProps) => base(p, <>
        <polyline points="1,4 1,1 4,1" />
        <path d="M1 1a7 7 0 1 1-1 5" />
        <line x1="5" y1="8" x2="11" y2="8" />
        <line x1="8" y1="5" x2="8" y2="11" />
    </>),

    // ── Status ───────────────────────────────────────────────────
    Check: (p: IconProps) => base(p, <polyline points="2,8 6,12 14,4" />),

    AlertTriangle: (p: IconProps) => base(p, <>
        <path d="M8 2L1 13h14L8 2z" />
        <line x1="8" y1="6" x2="8" y2="9" />
        <circle cx="8" cy="11.5" r=".7" fill="currentColor" stroke="none" />
    </>),

    Info: (p: IconProps) => base(p, <>
        <circle cx="8" cy="8" r="6.5" />
        <line x1="8" y1="7" x2="8" y2="11" />
        <circle cx="8" cy="5" r=".7" fill="currentColor" stroke="none" />
    </>),

    // ── Node / Tier icons ─────────────────────────────────────────
    NodeSeedling: (p: IconProps) => base(p, <>
        <path d="M8 14V8" />
        <path d="M8 8C8 5 5 3 2 3c0 3 2.5 5 6 5z" />
        <path d="M8 8c0-3 3-5 6-5 0 3-2.5 5-6 5z" />
    </>),

    NodeArchive: (p: IconProps) => base(p, <>
        <rect x="1" y="3" width="14" height="3" rx="1" />
        <rect x="1" y="9" width="14" height="5" rx="1" />
        <line x1="5" y1="6" x2="5" y2="9" />
        <line x1="8" y1="6" x2="8" y2="9" />
        <line x1="11" y1="6" x2="11" y2="9" />
    </>),

    NodeVault: (p: IconProps) => base(p, <>
        <path d="M8 1L1 4v4c0 3.3 3 6.4 7 7 4-0.6 7-3.7 7-7V4L8 1z" />
        <polyline points="5,8 7,10 11,6" />
    </>),

    // ── Data / Chain ──────────────────────────────────────────────
    Block: (p: IconProps) => base(p, <>
        <path d="M8 1l6 3.5v7L8 15l-6-3.5v-7L8 1z" />
        <line x1="8" y1="1" x2="8" y2="8" />
        <line x1="2" y1="4.5" x2="8" y2="8" />
        <line x1="14" y1="4.5" x2="8" y2="8" />
    </>),

    Coin: (p: IconProps) => base(p, <>
        <circle cx="8" cy="8" r="6.5" />
        <path d="M8 4.5v7M5.5 6.5c0-1.1.9-2 2.5-2s2.5.9 2.5 2-2.5 2-2.5 2-2.5.9-2.5 2 .9 2 2.5 2 2.5-.9 2.5-2" />
    </>),

    Relay: (p: IconProps) => base(p, <>
        <circle cx="3" cy="8" r="2" />
        <circle cx="13" cy="4" r="2" />
        <circle cx="13" cy="12" r="2" />
        <line x1="5" y1="8" x2="11" y2="4.8" />
        <line x1="5" y1="8" x2="11" y2="11.2" />
    </>),

    Proof: (p: IconProps) => base(p, <>
        <rect x="2" y="2" width="12" height="12" rx="1.5" />
        <path d="M5 8l2 2 4-4" />
    </>),

    // ── Misc ─────────────────────────────────────────────────────
    Identity: (p: IconProps) => base(p, <>
        <circle cx="8" cy="5.5" r="3" />
        <path d="M1 14.5c0-3.6 3.1-6.5 7-6.5s7 2.9 7 6.5" />
    </>),

    Clock: (p: IconProps) => base(p, <>
        <circle cx="8" cy="8" r="6.5" />
        <polyline points="8,4 8,8 10.5,10" />
    </>),

    Wifi: (p: IconProps) => base(p, <>
        <path d="M1.5 7.5C4 5 6 4 8 4s4 1 6.5 3.5" />
        <path d="M4 10c1.1-1 2.5-1.7 4-1.7s2.9.7 4 1.7" />
        <circle cx="8" cy="13" r="1" fill="currentColor" stroke="none" />
    </>),

    WifiOff: (p: IconProps) => base(p, <>
        <line x1="2" y1="2" x2="14" y2="14" />
        <path d="M8.5 4.1C9.7 4.3 11 4.8 12.5 6" />
        <path d="M1.5 7.5c.8-.8 1.7-1.4 2.7-1.9" />
        <path d="M5.5 10.5C6.2 9.9 7 9.5 8 9.5" />
        <circle cx="8" cy="13" r="1" fill="currentColor" stroke="none" />
    </>),

    Key: (p: IconProps) => base(p, <>
        <circle cx="5.5" cy="5.5" r="4" />
        <line x1="9" y1="9" x2="15" y2="15" />
        <line x1="12" y1="12" x2="14" y2="10" />
    </>),

    File: (p: IconProps) => base(p, <>
        <path d="M9 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6L9 2z" />
        <polyline points="9,2 9,6 13,6" />
    </>),

    Upload: (p: IconProps) => base(p, <>
        <path d="M2 12v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" />
        <line x1="8" y1="2" x2="8" y2="10" />
        <polyline points="5,5 8,2 11,5" />
    </>),

    Logo: (p: IconProps) => base({ ...p, style: { ...p.style } }, <>
        <circle cx="8" cy="8" r="6" />
        <path d="M5 8c0-3 1.5-5 3-5s3 2 3 5-1.5 5-3 5-3-2-3-5z" />
        <line x1="2" y1="8" x2="14" y2="8" />
    </>),

    Validator: (p: IconProps) => base(p, <>
        <circle cx="8" cy="5" r="3" />
        <path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" />
        <polyline points="10,11 11,13 14,10" />
    </>),
};
