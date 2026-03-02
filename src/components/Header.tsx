import { useState, useEffect, useRef } from 'react';
import type { ConnStatus, NodeStats, NodeConfig } from '../hooks/useNodeState';
import type { UpdateInfo } from '../hooks/useAutoUpdater';
import { Icon } from './Icons';
import { WalletPanel } from './WalletPanel';

// ── Animated balance display ─────────────────────────────────────────────────
function BalanceDisplay({ wmtBalance }: { wmtBalance: number }) {
    const prevRef = useRef(wmtBalance);
    const [flash, setFlash] = useState<'up' | 'down' | null>(null);

    useEffect(() => {
        if (wmtBalance !== prevRef.current) {
            setFlash(wmtBalance > prevRef.current ? 'up' : 'down');
            prevRef.current = wmtBalance;
            const t = setTimeout(() => setFlash(null), 1500);
            return () => clearTimeout(t);
        }
    }, [wmtBalance]);

    const borderColor = flash === 'up' ? 'var(--green-mid)' : flash === 'down' ? 'var(--red-mid)' : 'var(--border-subtle)';
    const numColor = flash === 'up' ? 'var(--green-glow)' : 'var(--purple-text)';

    return (
        <div style={{
            display: 'flex', alignItems: 'baseline', gap: 4, flexShrink: 0,
            background: 'var(--bg-surface)', borderRadius: 'var(--radius)',
            padding: '4px 10px',
            border: `1px solid ${borderColor}`,
            transition: 'border-color 0.4s',
            boxShadow: flash === 'up' ? '0 0 12px rgba(16,185,129,0.3)' : 'none',
            position: 'relative',
        }}>
            {flash === 'up' && (
                <span style={{
                    position: 'absolute', top: -10, right: 4,
                    fontSize: 9, color: 'var(--green-bright)', fontWeight: 700,
                    animation: 'floatUp 1.2s ease-out forwards',
                    pointerEvents: 'none',
                }}>▲</span>
            )}
            <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: numColor, transition: 'color 0.4s' }}>
                {wmtBalance.toLocaleString()}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>WMT</span>
        </div>
    );
}
// ─────────────────────────────────────────────────────────────────────────────


interface Props {
    config: NodeConfig;
    connStatus: ConnStatus;
    nodeActive: boolean;
    wmtBalance: number;
    stats: NodeStats;
    isStaked: boolean;
    onLaunch: () => void;
    onResume: () => void;
    onStop: () => void;
    onLogout: () => void;
    onReconnect: () => void;
    // Auto-updater
    updateInfo?: UpdateInfo | null;
    isInstalling?: boolean;
    installProgress?: number;
    onUpdate?: () => void;
}

function uptime(started: number) {
    if (!started) return '—';
    const s = Math.floor((Date.now() - started) / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

const TIER_COLORS: Record<string, string> = {
    VAULT: '#8b5cf6', ARCHIVE: '#3b82f6', SEEDLING: '#10b981'
};

type HeaderStyle = React.CSSProperties & { WebkitAppRegion?: string };

export function Header({
    config, connStatus, nodeActive, wmtBalance, stats,
    isStaked, onLaunch, onResume, onStop, onLogout, onReconnect,
    updateInfo, isInstalling = false, installProgress = 0, onUpdate
}: Props) {
    const [showMenu, setShowMenu] = useState(false);
    const [showWallet, setShowWallet] = useState(false);
    const tierColor = TIER_COLORS[config.tier] || '#10b981';

    const connDot =
        connStatus === 'connected' ? 'dot-green' :
            connStatus === 'connecting' ? 'dot-amber dot-pulse' :
                connStatus === 'error' ? 'dot-red' : 'dot-muted';

    const connLabel =
        connStatus === 'connected' ? 'Connected' :
            connStatus === 'connecting' ? 'Connecting…' :
                connStatus === 'error' ? 'Error' : 'Offline';

    const dragStyle: HeaderStyle = {
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 16px', height: 48,
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-subtle)',
        flex: '0 0 48px', userSelect: 'none',
        WebkitAppRegion: 'drag',
    };
    const noDragStyle: HeaderStyle = { WebkitAppRegion: 'no-drag' };

    // Single action button with clear semantics
    const ActionButton = () => {
        if (nodeActive) {
            return (
                <button id="header-stop-btn" className="btn btn-danger btn-sm" onClick={onStop}>
                    ■ Stop
                </button>
            );
        }
        if (isStaked) {
            // Already staked, just restart without going through modal
            return (
                <button id="header-resume-btn" className="btn btn-primary btn-sm" onClick={onResume}
                    style={{ background: 'var(--blue-mid)', borderColor: 'var(--blue-bright)' }}>
                    ▶ Resume
                </button>
            );
        }
        // Not staked yet → open Launch modal
        return (
            <button id="header-launch-btn" className="btn btn-primary btn-sm" onClick={onLaunch}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon.Launch size={13} color="#fff" />
                Launch Node
            </button>
        );
    };

    const StopBtn = () => (
        <button id="header-stop-btn" className="btn btn-danger btn-sm" onClick={onStop}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon.Stop size={11} color="currentColor" />
            Stop
        </button>
    );
    const ResumeBtn = () => (
        <button id="header-resume-btn" className="btn btn-primary btn-sm" onClick={onResume}
            style={{ background: 'var(--blue-mid)', borderColor: 'var(--blue-bright)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon.Play size={12} color="#fff" />
            Resume
        </button>
    );

    return (
        <header style={dragStyle as React.CSSProperties}>
            {/* Logo */}
            <Icon.Logo size={20} color="var(--green-bright)" style={{ flexShrink: 0 }} />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                    WORM Node
                </span>
                <span style={{
                    fontSize: 9, fontWeight: 600,
                    color: 'var(--green-bright)',
                    background: 'rgba(16,185,129,0.1)',
                    border: '1px solid rgba(16,185,129,0.25)',
                    borderRadius: 3, padding: '1px 4px',
                    letterSpacing: '0.02em',
                    fontFamily: 'var(--font-mono)',
                }}>
                    v{__APP_VERSION__}
                </span>
            </div>

            {/* Identity chip */}
            <div className="chip" style={{ flexShrink: 0, ...noDragStyle } as React.CSSProperties}>
                <Icon.Identity size={11} color={tierColor} />
                <span className="mono" style={{ fontSize: 10 }}>{config.identity}</span>
            </div>

            {/* Tier badge — only when staked */}
            {isStaked && (
                <div className="badge badge-muted" style={{ flexShrink: 0 }}>
                    {config.tier}
                </div>
            )}

            {/* Connection status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4, flexShrink: 0 }}>
                <span className={`dot ${connDot}`} />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{connLabel}</span>
                {(connStatus === 'error' || connStatus === 'disconnected') && (
                    <button id="reconnect-btn" className="btn btn-ghost btn-sm"
                        style={{ padding: '2px 8px', fontSize: 10 } as React.CSSProperties}
                        onClick={onReconnect}>
                        Retry
                    </button>
                )}

                {/* ── Update badge — shown next to connection status when update available ── */}
                {updateInfo?.available && onUpdate && (
                    <button
                        id="update-btn"
                        onClick={onUpdate}
                        disabled={isInstalling}
                        title={`Release notes:\n${updateInfo.notes}`}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '2px 9px',
                            borderRadius: 4,
                            border: '1px solid rgba(251,191,36,0.5)',
                            background: isInstalling
                                ? 'rgba(251,191,36,0.05)'
                                : 'rgba(251,191,36,0.12)',
                            color: '#fbbf24',
                            fontSize: 10,
                            fontWeight: 700,
                            cursor: isInstalling ? 'wait' : 'pointer',
                            transition: 'all 0.15s',
                            flexShrink: 0,
                            letterSpacing: '0.01em',
                            position: 'relative',
                            overflow: 'hidden',
                        } as React.CSSProperties}
                    >
                        {/* progress bar fill */}
                        {isInstalling && (
                            <div style={{
                                position: 'absolute', left: 0, top: 0, bottom: 0,
                                width: `${installProgress}%`,
                                background: 'rgba(251,191,36,0.2)',
                                transition: 'width 0.4s ease',
                                zIndex: 0,
                            }} />
                        )}
                        <span style={{ position: 'relative', zIndex: 1 }}>
                            {isInstalling
                                ? `Installing… ${installProgress}%`
                                : `↑ v${updateInfo.version} · Update`}
                        </span>
                    </button>
                )}
            </div>

            <div style={{ flex: 1 }} />

            {/* Balance — clickable to open wallet panel */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
                <button
                    id="header-balance-btn"
                    onClick={() => setShowWallet(v => !v)}
                    style={{
                        display: 'flex', alignItems: 'baseline', gap: 4,
                        background: showWallet ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                        borderRadius: 'var(--radius)', padding: '4px 10px',
                        border: `1px solid ${showWallet ? 'var(--green-mid)' : 'var(--border-subtle)'}`,
                        cursor: 'pointer', transition: 'all 0.15s',
                    }}
                >
                    <BalanceDisplay wmtBalance={wmtBalance} />
                </button>
                {showWallet && (
                    <WalletPanel
                        identity={config.identity}
                        balance={wmtBalance}
                        onClose={() => setShowWallet(false)}
                    />
                )}
            </div>

            {/* Session uptime */}
            {nodeActive && stats.sessionStarted > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                    <Icon.Clock size={12} color="var(--text-muted)" />
                    {uptime(stats.sessionStarted)}
                </div>
            )}

            {/* Action button + menu */}
            <div style={{ display: 'flex', gap: 6, ...noDragStyle } as React.CSSProperties}>
                {nodeActive ? <StopBtn /> : isStaked ? <ResumeBtn /> : <ActionButton />}

                <div style={{ position: 'relative' }}>
                    <button id="header-menu-btn" className="btn btn-ghost btn-sm"
                        style={{ padding: '5px 8px', display: 'flex', alignItems: 'center' }}
                        onClick={() => setShowMenu(v => !v)}>
                        <Icon.Menu size={15} color="var(--text-muted)" />
                    </button>
                    {showMenu && (
                        <div style={{
                            position: 'absolute', right: 0, top: 'calc(100% + 6px)',
                            background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius)', padding: '4px',
                            minWidth: 160, zIndex: 100, boxShadow: '0 8px 30px rgba(0,0,0,0.5)'
                        }}>
                            {isStaked && (
                                <button className="btn btn-ghost"
                                    style={{ width: '100%', justifyContent: 'flex-start', gap: 8, padding: '7px 10px', fontSize: 12, borderRadius: 6 }}
                                    onClick={() => { setShowMenu(false); onLaunch(); }}>
                                    <Icon.Settings size={13} color="currentColor" />
                                    Manage Stake
                                </button>
                            )}
                            <button className="btn btn-ghost"
                                style={{ width: '100%', justifyContent: 'flex-start', gap: 8, padding: '7px 10px', fontSize: 12, borderRadius: 6 }}
                                onClick={() => { setShowMenu(false); onLogout(); }}>
                                <Icon.Logout size={13} color="currentColor" />
                                Change Identity
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
