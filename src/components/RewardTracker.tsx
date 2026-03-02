import { useEffect, useRef } from 'react';
import type { RewardEvent } from '../hooks/useNodeState';
import { Icon } from './Icons';

interface Props {
    rewards: RewardEvent[];
    totalEarned: number;
    sessionStarted: number;
    relayCount: number;
    posSuccessCount: number;
}

const REWARD_ICONS: Record<string, React.ReactNode> = {
    RELAY_REWARD: <Icon.Relay size={15} color="var(--blue-bright)" />,
    STORAGE_REWARD: <Icon.Storage size={15} color="var(--green-bright)" />,
    REWARD_BATCH: <Icon.Block size={15} color="var(--purple-bright)" />,
    GENESIS_AIRDROP: <Icon.Coin size={15} color="var(--amber-bright)" />,
};

const DEFAULT_ICON = <Icon.Proof size={15} color="var(--cyan-bright)" />;

const REWARD_COLORS: Record<string, string> = {
    RELAY_REWARD: 'var(--blue-text)',
    STORAGE_REWARD: 'var(--green-text)',
    REWARD_BATCH: 'var(--purple-text)',
    GENESIS_AIRDROP: 'var(--amber-text)',
};

function timeAgo(ts: number) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}

export function RewardTracker({ rewards, totalEarned, sessionStarted, relayCount, posSuccessCount }: Props) {
    const prevTotal = useRef(totalEarned);
    const flashRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (totalEarned > prevTotal.current && flashRef.current) {
            flashRef.current.classList.remove('reward-flash');
            void flashRef.current.offsetWidth;
            flashRef.current.classList.add('reward-flash');
        }
        prevTotal.current = totalEarned;
    }, [totalEarned]);

    // Session earnings (from sessionStarted)
    const sessionRewards = rewards.filter(r => r.timestamp >= (sessionStarted || 0));
    const sessionEarned = sessionRewards.reduce((s, r) => s + r.amount, 0);

    return (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0, overflow: 'hidden', gap: 0 }}>
            <div className="card-header" style={{ padding: '10px 14px', flexShrink: 0 }}>
                <Icon.Coin size={13} color="var(--amber-text)" />
                <span className="card-title">Rewards</span>
                <span className="badge badge-purple" style={{ marginLeft: 'auto' }}>{rewards.length} events</span>
            </div>

            {/* Total balance big display */}
            <div ref={flashRef} style={{
                padding: '14px 14px 12px',
                background: 'linear-gradient(135deg, var(--purple-dim) 0%, transparent 100%)',
                borderBottom: '1px solid var(--border-subtle)',
                flexShrink: 0
            }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Total Earned</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span className="big-number" style={{ color: 'var(--purple-text)', fontSize: 24 }}>
                        {totalEarned.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>WMT</span>
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 12 }}>
                    <div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>This Session</div>
                        <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--green-bright)' }}>
                            +{sessionEarned.toLocaleString(undefined, { maximumFractionDigits: 2 })} WMT
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Relay Cycles</div>
                        <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--blue-text)' }}>{relayCount}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>PoS Wins</div>
                        <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--green-text)' }}>{posSuccessCount}</div>
                    </div>
                </div>
            </div>

            {/* Reward list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px 10px' }}>
                {rewards.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-disabled)', fontSize: 12, padding: '24px 0' }}>
                        No rewards yet. Start the node to begin earning.
                    </div>
                ) : rewards.map((r, i) => (
                    <div key={r.id} className={i === 0 ? 'slide-in' : ''} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '7px 0', borderBottom: '1px solid var(--border-subtle)'
                    }}>
                        <span style={{ fontSize: 15, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                            {REWARD_ICONS[r.type] || DEFAULT_ICON}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, color: REWARD_COLORS[r.type] || 'var(--purple-text)', fontWeight: 600 }}>
                                {r.type.replace(/_/g, ' ')}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{timeAgo(r.timestamp)}</div>
                        </div>
                        <div style={{
                            fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
                            color: 'var(--green-bright)', flexShrink: 0
                        }}>
                            +{r.amount}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
