import { useEffect, useState } from 'react';
import { subscribeToProfiles } from '../utils/GunPeer';
import type { PeerProfile } from '../utils/GunPeer';

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function timeAgo(ts: number): string {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 10) return 'just now';
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h`;
}

// Deterministic hash from identity string (djb2 variant)
function identityHash(str: string): number {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h, 31) ^ str.charCodeAt(i);
    }
    return h >>> 0;
}

function toNodeId(id: string): string {
    return identityHash(id).toString(16).padStart(8, '0');
}

// Derives a unique accent color from the hash (used as left border only)
function toAccentColor(id: string): string {
    const h = identityHash(id);
    const hue = h % 360;
    return `hsl(${hue}, 60%, 55%)`;
}

// "Activity level" based on data bytes — proxy for network participation
function activityTag(bytes: number): { label: string; color: string } {
    if (bytes > 50_000) return { label: 'HIGH', color: 'var(--green-bright)' };
    if (bytes > 5_000) return { label: 'MED', color: 'var(--amber-bright)' };
    return { label: 'LOW', color: 'var(--text-disabled)' };
}

function PeerRow({ peer }: { peer: PeerProfile }) {
    const nodeId = toNodeId(peer.id);
    const accent = toAccentColor(peer.id);
    const isOnline = (Date.now() - peer.lastSeen) < 60_000;
    const activity = activityTag(peer.dataBytes);
    // Second derived hash for checksum display (XOR shifted)
    const checksum = ((identityHash(peer.id) ^ 0xdeadbeef) >>> 0).toString(16).padStart(8, '0');

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: '3px 1fr auto',
            alignItems: 'center',
            gap: 10,
            padding: '6px 10px 6px 0',
            borderRadius: 6,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            overflow: 'hidden',
        }}>
            {/* Left accent bar — derived from node hash, replaces avatar */}
            <div style={{ width: 3, alignSelf: 'stretch', borderRadius: '3px 0 0 3px', background: accent }} />

            {/* Node identity info */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                {/* Top row: node ID + status dot */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                        fontSize: 11, fontWeight: 700,
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: 0.5,
                    }}>
                        {nodeId.slice(0, 4)}·{nodeId.slice(4)}
                    </span>
                    <span style={{
                        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                        background: isOnline ? 'var(--green-bright)' : 'var(--border-default)',
                        boxShadow: isOnline ? '0 0 4px var(--green-bright)' : 'none',
                    }} />
                </div>
                {/* Bottom row: checksum + activity tag */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 9, color: 'var(--text-disabled)', fontFamily: 'var(--font-mono)' }}>
                        crc·{checksum.slice(0, 6)}
                    </span>
                    <span style={{
                        fontSize: 8, fontWeight: 700, letterSpacing: 0.6,
                        color: activity.color, padding: '1px 4px',
                        border: `1px solid ${activity.color}`,
                        borderRadius: 3, opacity: 0.85,
                    }}>
                        {activity.label}
                    </span>
                </div>
            </div>

            {/* Right: bytes + time */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, paddingRight: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    {formatBytes(peer.dataBytes)}
                </span>
                <span style={{ fontSize: 9, color: 'var(--text-disabled)' }}>
                    {timeAgo(peer.lastSeen)}
                </span>
            </div>
        </div>
    );
}

interface Props {
    nodeActive: boolean;
}

export function GunNetworkPanel({ nodeActive }: Props) {
    const [profiles, setProfiles] = useState<PeerProfile[]>([]);
    const [totalBytes, setTotalBytes] = useState(0);

    useEffect(() => {
        const unsub = subscribeToProfiles((list) => {
            setProfiles(list);
            setTotalBytes(list.reduce((s, p) => s + p.dataBytes, 0));
        });
        return unsub;
    }, []);

    const onlineCount = profiles.filter(p => (Date.now() - p.lastSeen) < 60_000).length;

    return (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0, padding: 0, overflow: 'hidden' }}>
            {/* ── Header ── */}
            <div className="card-header" style={{ padding: '10px 14px', flexShrink: 0 }}>
                <span style={{ fontSize: 13 }}>🌐</span>
                <span className="card-title">GunDB Network</span>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {nodeActive && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--green-bright)' }}>
                            <span className="dot dot-green dot-pulse" style={{ width: 6, height: 6 }} />
                            LIVE
                        </span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {onlineCount}/{profiles.length}
                    </span>
                </div>
            </div>

            {/* ── Stats bar ── */}
            {profiles.length > 0 && (
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                    padding: '6px 14px',
                    background: 'var(--bg-card)',
                    borderBottom: '1px solid var(--border-subtle)',
                    flexShrink: 0,
                }}>
                    {[
                        { val: profiles.length, label: 'NODES', color: 'var(--green-bright)' },
                        { val: onlineCount, label: 'ONLINE', color: 'var(--blue-bright)' },
                        { val: formatBytes(totalBytes), label: 'SYNCED', color: 'var(--amber-bright)' },
                    ].map(s => (
                        <div key={s.label} style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: s.color, fontFamily: 'var(--font-mono)' }}>{s.val}</div>
                            <div style={{ fontSize: 8, color: 'var(--text-disabled)', letterSpacing: 0.8, textTransform: 'uppercase' }}>{s.label}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Column header ── */}
            {profiles.length > 0 && (
                <div style={{
                    display: 'grid', gridTemplateColumns: '3px 1fr auto',
                    gap: 10, padding: '4px 10px 2px 0',
                    flexShrink: 0,
                }}>
                    <div />
                    <div style={{ paddingLeft: 10, fontSize: 8, color: 'var(--text-disabled)', letterSpacing: 0.8 }}>NODE · STATUS</div>
                    <div style={{ paddingRight: 10, fontSize: 8, color: 'var(--text-disabled)', letterSpacing: 0.8, textAlign: 'right' }}>SYNCED · AGO</div>
                </div>
            )}

            {/* ── Peer list ── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {!nodeActive ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-disabled)', fontSize: 12, padding: '30px 0' }}>
                        Start the node to sync GunDB peers
                    </div>
                ) : profiles.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-disabled)', fontSize: 12, padding: '30px 0' }}>
                        <div style={{ marginBottom: 8 }}>⏳</div>
                        Discovering nodes on mesh…
                    </div>
                ) : profiles.map(peer => (
                    <PeerRow key={peer.id} peer={peer} />
                ))}
            </div>
        </div>
    );
}
