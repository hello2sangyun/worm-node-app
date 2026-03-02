import type { ChainState } from '../hooks/useNodeState';
import { Icon } from './Icons';

interface Props {
    chainState: ChainState;
    identity: string;
    onRefresh: () => void;
}

function hashShort(h: string) {
    if (!h || h.length < 12) return h;
    return h.slice(0, 8) + '…' + h.slice(-6);
}

export function ChainStats({ chainState, identity, onRefresh }: Props) {
    const { height, lastHash, totalTxs, validators, validatorThreshold, recentBlocks, isValidator } = chainState;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Chain overview */}
            <div className="card">
                <div className="card-header">
                    <Icon.Chain size={13} color="var(--text-secondary)" />
                    <span className="card-title">Worm Chain</span>
                    <button id="refresh-chain-btn" className="btn btn-ghost btn-sm"
                        style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}
                        onClick={onRefresh}>
                        <Icon.Resume size={11} color="currentColor" /> Refresh
                    </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                        { label: 'Block Height', value: height.toLocaleString(), color: 'var(--cyan-bright)' },
                        { label: 'Total Txs', value: totalTxs.toLocaleString(), color: 'var(--text-primary)' },
                    ].map(item => (
                        <div key={item.label} style={{
                            background: 'var(--bg-surface)', borderRadius: 'var(--radius)',
                            padding: '8px 10px', border: '1px solid var(--border-subtle)'
                        }}>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>{item.label}</div>
                            <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: item.color }}>{item.value}</div>
                        </div>
                    ))}
                </div>
                {lastHash && (
                    <div className="stat-row" style={{ marginTop: 10 }}>
                        <span className="stat-label">Last Hash</span>
                        <span className="stat-value mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>{hashShort(lastHash)}</span>
                    </div>
                )}
            </div>

            {/* Validator Status */}
            <div className="card">
                <div className="card-header">
                    <Icon.Validator size={13} color="var(--text-secondary)" />
                    <span className="card-title">PoA Validators</span>
                    <span className="badge badge-blue" style={{ marginLeft: 'auto' }}>
                        {validators.length} nodes · t={validatorThreshold}
                    </span>
                </div>

                {isValidator ? (
                    <div style={{
                        padding: '10px', borderRadius: 'var(--radius)',
                        background: 'var(--green-dim)', border: '1px solid var(--green-mid)',
                        marginBottom: 10
                    }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--green-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Icon.Check size={13} color="var(--green-bright)" />
                            You are a Validator
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                            Co-signing block proposals via GunDB
                        </div>
                    </div>
                ) : (
                    <div style={{
                        padding: '10px', borderRadius: 'var(--radius)',
                        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                        marginBottom: 10
                    }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            Not a validator — participating as storage/relay node
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {validators.slice(0, 5).map(v => (
                        <div key={v} className="chip" style={{ justifyContent: 'flex-start', borderRadius: 'var(--radius-sm)' }}>
                            <Icon.Validator size={11}
                                color={v === identity ? 'var(--green-bright)' : 'var(--text-muted)'} />
                            <span style={{ fontSize: 10, color: v === identity ? 'var(--green-text)' : 'var(--text-secondary)' }}>
                                {v}{v === identity && ' (you)'}
                            </span>
                        </div>
                    ))}
                    {validators.length > 5 && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', paddingLeft: 6 }}>+ {validators.length - 5} more</div>
                    )}
                </div>
            </div>

            {/* Recent Blocks */}
            <div className="card">
                <div className="card-header">
                    <Icon.Block size={13} color="var(--text-secondary)" />
                    <span className="card-title">Recent Blocks</span>
                </div>
                {recentBlocks.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-disabled)', fontSize: 12, padding: '16px 0' }}>
                        Loading blocks…
                    </div>
                ) : [...recentBlocks].reverse().map(block => (
                    <div key={block.index} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '5px 0', borderBottom: '1px solid var(--border-subtle)'
                    }}>
                        <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--cyan-bright)', flexShrink: 0 }}>
                            #{block.index}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {hashShort(block.hash)}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-disabled)' }}>{block.validator}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div className="badge badge-muted" style={{ fontSize: 9 }}>{block.txCount} txs</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
