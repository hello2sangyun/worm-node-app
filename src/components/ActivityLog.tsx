import { useEffect, useRef, useState } from 'react';
import type { LogEntry } from '../hooks/useNodeState';
import { Icon } from './Icons';

// Maps log type to a small flat SVG icon
function LogTypeIcon({ type }: { type: LogEntry['type'] }) {
    const map: Record<string, { icon: React.ReactNode; color: string }> = {
        success: { icon: <Icon.Check size={12} />, color: 'var(--green-bright)' },
        error: { icon: <Icon.Close size={12} />, color: 'var(--red-bright)' },
        warn: { icon: <Icon.AlertTriangle size={12} />, color: 'var(--amber-bright)' },
        info: { icon: <Icon.Info size={12} />, color: 'var(--blue-bright)' },
        reward: { icon: <Icon.Coin size={12} />, color: 'var(--purple-bright)' },
        default: { icon: <Icon.Relay size={12} />, color: 'var(--text-muted)' },
    };
    const { icon, color } = map[type] || map.default;
    return <span className="log-icon" style={{ color, display: 'flex', alignItems: 'center' }}>{icon}</span>;
}

interface Props {
    logs: LogEntry[];
    nodeActive: boolean;
}

export function ActivityLog({ logs, nodeActive }: Props) {
    const bottRef = useRef<HTMLDivElement>(null);
    const [paused, setPaused] = useState(false);
    const prevCount = useRef(0);

    useEffect(() => {
        if (!paused && bottRef.current) {
            bottRef.current.scrollTop = 0;
        }
        if (logs.length !== prevCount.current) {
            prevCount.current = logs.length;
        }
    }, [logs, paused]);

    return (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0, padding: 0, overflow: 'hidden' }}>
            <div className="card-header" style={{ padding: '10px 14px', flexShrink: 0 }}>
                <Icon.File size={13} color="var(--text-secondary)" />
                <span className="card-title">Activity Log</span>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {nodeActive && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--green-bright)' }}>
                            <span className="dot dot-green dot-pulse" style={{ width: 6, height: 6 }} />
                            LIVE
                        </span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{logs.length} events</span>
                    <button
                        id="log-pause-btn"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '2px 8px', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}
                        onClick={() => setPaused(v => !v)}
                    >
                        {paused
                            ? <><Icon.Play size={10} color="currentColor" /> Resume</>
                            : <><Icon.Stop size={9} color="currentColor" /> Pause</>}
                    </button>
                </div>
            </div>

            <div
                ref={bottRef}
                style={{
                    flex: 1, overflowY: 'auto', padding: '6px 14px 10px',
                    display: 'flex', flexDirection: 'column', gap: 0
                }}
            >
                {logs.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-disabled)', fontSize: 12, padding: '30px 0' }}>
                        {nodeActive ? 'Waiting for activity…' : 'Start the node to see live activity'}
                    </div>
                ) : logs.map((entry, i) => (
                    <div
                        key={entry.id}
                        className={`log-entry${i === 0 ? ' slide-in' : ''}`}
                    >
                        <span className="log-time">{entry.time}</span>
                        <LogTypeIcon type={entry.type} />
                        <span className={`log-msg ${entry.type}`}>{entry.msg}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
