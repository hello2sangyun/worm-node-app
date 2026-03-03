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
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
}

const PLAN_COLORS: Record<string, string> = {
    PRO: 'var(--purple-bright)',
    PREMIUM: 'var(--amber-bright)',
    FREE: 'var(--text-muted)',
    VAULT: 'var(--green-bright)',
};

function PeerCard({ peer }: { peer: PeerProfile }) {
    const initials = peer.displayName.slice(0, 2).toUpperCase();
    const planColor = PLAN_COLORS[peer.plan?.toUpperCase()] || 'var(--text-muted)';

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '7px 10px',
            borderRadius: 8,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            transition: 'border-color 0.2s',
            minWidth: 0,
        }}>
            {/* Avatar */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
                {peer.avatarUrl ? (
                    <img
                        src={peer.avatarUrl}
                        alt={peer.displayName}
                        style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid var(--border-default)' }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                ) : (
                    <div style={{
                        width: 34, height: 34, borderRadius: '50%',
                        background: 'linear-gradient(135deg, var(--green-dim), var(--blue-dim))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700, color: 'var(--text-primary)',
                        border: '1.5px solid var(--border-default)',
                        letterSpacing: 0.5,
                    }}>
                        {initials}
                    </div>
                )}
                {/* Online indicator */}
                <span style={{
                    position: 'absolute', bottom: 0, right: 0,
                    width: 8, height: 8, borderRadius: '50%',
                    background: 'var(--green-bright)',
                    border: '1.5px solid var(--bg-elevated)',
                }} />
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {peer.displayName !== peer.wnsName ? peer.displayName : peer.wnsName.split('.')[0]}
                    </span>
                    <span style={{ fontSize: 9, color: planColor, fontWeight: 700, letterSpacing: 0.5, flexShrink: 0 }}>
                        {peer.plan?.toUpperCase()}
                    </span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {peer.wnsName}
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                    {peer.friendCount > 0 && (
                        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }} title="Friends">
                            👥 {peer.friendCount}
                        </span>
                    )}
                    {peer.msgCount > 0 && (
                        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }} title="Messages in inbox">
                            ✉️ {peer.msgCount}
                        </span>
                    )}
                </div>
                <span style={{ fontSize: 9, color: 'var(--text-disabled)', fontFamily: 'var(--font-mono)' }}>
                    {formatBytes(peer.dataBytes)} · {timeAgo(peer.lastSeen)}
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

    return (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0, padding: 0, overflow: 'hidden' }}>
            {/* Header */}
            <div className="card-header" style={{ padding: '10px 14px', flexShrink: 0 }}>
                <span style={{ fontSize: 13 }}>🌐</span>
                <span className="card-title">GunDB Network</span>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {nodeActive && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--green-bright)' }}>
                            <span className="dot dot-green dot-pulse" style={{ width: 6, height: 6 }} />
                            SYNCING
                        </span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{profiles.length} peers</span>
                </div>
            </div>

            {/* Summary bar */}
            {profiles.length > 0 && (
                <div style={{
                    display: 'flex', gap: 16, padding: '6px 14px',
                    background: 'var(--bg-card)',
                    borderBottom: '1px solid var(--border-subtle)',
                    flexShrink: 0,
                }}>
                    <div style={{ display: 'flex', flex: 1, gap: 16 }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--green-bright)', fontFamily: 'var(--font-mono)' }}>{profiles.length}</div>
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Peers</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--blue-bright)', fontFamily: 'var(--font-mono)' }}>
                                {profiles.reduce((s, p) => s + (p.msgCount > 0 ? 1 : 0), 0)}
                            </div>
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Active MBX</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--amber-bright)', fontFamily: 'var(--font-mono)' }}>{formatBytes(totalBytes)}</div>
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Data Synced</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Peer list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {!nodeActive ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-disabled)', fontSize: 12, padding: '30px 0' }}>
                        Start the node to sync GunDB peers
                    </div>
                ) : profiles.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-disabled)', fontSize: 12, padding: '30px 0' }}>
                        <div style={{ marginBottom: 8 }}>⏳</div>
                        Discovering peers on GunDB mesh…
                    </div>
                ) : profiles.map(peer => (
                    <PeerCard key={peer.id} peer={peer} />
                ))}
            </div>
        </div>
    );
}
