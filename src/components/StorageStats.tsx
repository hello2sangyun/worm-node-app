import { useState, useEffect, useCallback } from 'react';
import type { PosChallenge, NodeStats } from '../hooks/useNodeState';
import { Icon } from './Icons';
import { isTauriEnv, getChunkStorePath, listChunkCIDs, clearAllChunks as nativeClearAll } from '../utils/NativeChunkStore';

// ── IndexedDB fallback (non-Tauri / browser env) ──────────────────
async function getAllCIDs(): Promise<string[]> {
    try {
        const db = await new Promise<IDBDatabase>((res, rej) => {
            const req = indexedDB.open('WSNChunkCache');
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });
        return new Promise<string[]>((res) => {
            try {
                const tx = db.transaction('chunks', 'readonly');
                const req = tx.objectStore('chunks').getAllKeys();
                req.onsuccess = () => res((req.result || []) as string[]);
                req.onerror = () => res([]);
            } catch { res([]); }
        });
    } catch { return []; }
}

async function clearAllChunks(): Promise<void> {
    const db = await new Promise<IDBDatabase>((res, rej) => {
        const req = indexedDB.open('WSNChunkCache');
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
    });
    return new Promise((res, rej) => {
        const stores = ['chunks', 'sessions', 'metadata'].filter(s =>
            db.objectStoreNames.contains(s)
        );
        if (stores.length === 0) { res(); return; }
        const tx = db.transaction(stores, 'readwrite');
        stores.forEach(s => tx.objectStore(s).clear());
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
    });
}

interface Props {
    posChallenges: PosChallenge[];
    stats: NodeStats;
    posEnabled: boolean;
    onClearChunks?: () => void;
}

function cidShort(cid: string) {
    return cid.length > 16 ? cid.slice(0, 8) + '…' + cid.slice(-6) : cid;
}

type WarningStep = 'idle' | 'confirm1' | 'confirm2' | 'deleting' | 'done';

export function StorageStats({ posChallenges, stats, posEnabled, onClearChunks }: Props) {
    const total = stats.posSuccessCount + stats.posFailCount;
    const rate = total > 0 ? Math.round((stats.posSuccessCount / total) * 100) : 0;
    const usedPct = stats.storageUsedMB > 0
        ? Math.min(100, Math.round((stats.storageUsedMB / (1024)) * 100))
        : 0;

    const [storagePath, setStoragePath] = useState('Loading…');
    const [cids, setCids] = useState<string[]>([]);
    const [showCids, setShowCids] = useState(false);
    const [warningStep, setWarningStep] = useState<WarningStep>('idle');

    // 실제 경로를 Tauri에서 가져옴
    useEffect(() => {
        if (isTauriEnv()) {
            getChunkStorePath().then(p => setStoragePath(p)).catch(() =>
                setStoragePath('~/Library/Application Support/WORM Node/chunks')
            );
        } else {
            setStoragePath('IndexedDB → WSNChunkCache / chunks');
        }
    }, []);

    const loadCids = useCallback(async () => {
        try {
            const all = isTauriEnv()
                ? await listChunkCIDs()
                : await getAllCIDs();
            setCids(all);
        } catch { /* silent */ }
    }, []);

    useEffect(() => { loadCids(); }, [loadCids, stats.chunksStored]);

    const handleDeleteRequest = () => setWarningStep('confirm1');
    const handleCancel = () => setWarningStep('idle');

    const handleConfirm1 = () => setWarningStep('confirm2');

    const handleFinalDelete = async () => {
        setWarningStep('deleting');
        try {
            if (isTauriEnv()) {
                await nativeClearAll();
            } else {
                await clearAllChunks();
            }
            setCids([]);
            setWarningStep('done');
            onClearChunks?.();
            setTimeout(() => setWarningStep('idle'), 2500);
        } catch {
            setWarningStep('idle');
        }
    };

    return (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0, gap: 0, overflow: 'hidden' }}>
            <div className="card-header" style={{ padding: '10px 14px', flexShrink: 0 }}>
                <Icon.Storage size={13} color="var(--text-secondary)" />
                <span className="card-title">Storage &amp; PoS</span>
                <div className={`badge ${posEnabled ? 'badge-green' : 'badge-muted'}`} style={{ marginLeft: 'auto' }}>
                    {posEnabled ? 'Active' : 'Disabled'}
                </div>
            </div>

            {/* Stats grid */}
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                        { label: 'Chunks Stored', value: stats.chunksStored, color: 'var(--cyan-bright)' },
                        { label: 'PoS Success Rate', value: `${rate}%`, color: rate >= 80 ? 'var(--green-bright)' : rate >= 50 ? 'var(--amber-bright)' : 'var(--red-bright)' },
                        { label: 'Proofs Passed', value: stats.posSuccessCount, color: 'var(--green-text)' },
                        { label: 'Proofs Failed', value: stats.posFailCount, color: 'var(--red-text)' },
                    ].map(item => (
                        <div key={item.label} style={{
                            background: 'var(--bg-surface)', borderRadius: 'var(--radius)',
                            padding: '8px 10px', border: '1px solid var(--border-subtle)'
                        }}>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{item.label}</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: item.color }}>
                                {item.value}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Storage bar */}
                <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Storage Used</span>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                            {stats.storageUsedMB.toFixed(1)} MB
                        </span>
                    </div>
                    <div className="progress-bar">
                        <div className="progress-fill progress-blue" style={{ width: `${usedPct}%` }} />
                    </div>
                </div>

                {/* Storage Path + Manage */}
                <div style={{
                    marginTop: 10,
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius)',
                    padding: '8px 10px'
                }}>
                    {/* Path header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Storage Location
                            </div>
                            <div
                                className="mono"
                                style={{
                                    fontSize: 10, color: 'var(--cyan-bright)',
                                    cursor: 'pointer', userSelect: 'all',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                }}
                                title={storagePath}
                                onClick={() => setShowCids(v => !v)}
                            >
                                {storagePath}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            <button
                                onClick={() => { setShowCids(v => !v); loadCids(); }}
                                style={{
                                    fontSize: 9, padding: '3px 7px',
                                    background: 'var(--bg-elevated)',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: 4, color: 'var(--text-secondary)',
                                    cursor: 'pointer'
                                }}
                            >
                                {showCids ? 'Hide CIDs' : `View ${cids.length} CIDs`}
                            </button>
                            {cids.length > 0 && warningStep === 'idle' && (
                                <button
                                    onClick={handleDeleteRequest}
                                    style={{
                                        fontSize: 9, padding: '3px 7px',
                                        background: 'transparent',
                                        border: '1px solid var(--red-text)',
                                        borderRadius: 4, color: 'var(--red-text)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Clear All
                                </button>
                            )}
                        </div>
                    </div>

                    {/* CID list */}
                    {showCids && (
                        <div style={{
                            marginTop: 8,
                            maxHeight: 100, overflowY: 'auto',
                            borderTop: '1px solid var(--border-subtle)',
                            paddingTop: 6
                        }}>
                            {cids.length === 0 ? (
                                <div style={{ fontSize: 10, color: 'var(--text-disabled)', textAlign: 'center', padding: '4px 0' }}>
                                    No chunks cached locally
                                </div>
                            ) : cids.map((cid, i) => (
                                <div key={cid} style={{
                                    fontFamily: 'var(--font-mono)', fontSize: 9,
                                    color: 'var(--text-muted)', padding: '1px 0',
                                    borderBottom: i < cids.length - 1 ? '1px solid var(--border-subtle)' : 'none'
                                }}>
                                    {cidShort(cid)}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ─── WARNING DIALOGS ─── */}

                {/* Step 1: First warning */}
                {warningStep === 'confirm1' && (
                    <div style={{
                        marginTop: 10,
                        background: 'rgba(239,68,68,0.08)',
                        border: '1px solid var(--red-text)',
                        borderRadius: 'var(--radius)',
                        padding: '10px 12px'
                    }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red-text)', marginBottom: 6 }}>
                            ⚠️ Warning — Read carefully
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 8 }}>
                            Stored chunks are the <strong style={{ color: 'var(--amber-bright)' }}>proof of your storage contribution</strong> to the WORM network.<br /><br />
                            Deleting chunks means you can no longer respond to PoS (Proof of Storage) challenges for those files — your <strong style={{ color: 'var(--amber-bright)' }}>PoS rewards will stop immediately</strong> and your success rate will drop.<br /><br />
                            The fewer chunks you store, the smaller your rewards.
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button
                                onClick={handleCancel}
                                style={{
                                    flex: 1, fontSize: 10, padding: '5px 0',
                                    background: 'var(--bg-elevated)',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: 4, color: 'var(--text-secondary)',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel — Keep Chunks
                            </button>
                            <button
                                onClick={handleConfirm1}
                                style={{
                                    flex: 1, fontSize: 10, padding: '5px 0',
                                    background: 'transparent',
                                    border: '1px solid var(--red-text)',
                                    borderRadius: 4, color: 'var(--red-text)',
                                    cursor: 'pointer'
                                }}
                            >
                                I understand, continue →
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 2: Final confirmation */}
                {warningStep === 'confirm2' && (
                    <div style={{
                        marginTop: 10,
                        background: 'rgba(239,68,68,0.12)',
                        border: '2px solid var(--red-text)',
                        borderRadius: 'var(--radius)',
                        padding: '10px 12px'
                    }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red-text)', marginBottom: 6 }}>
                            Final Confirmation
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 8 }}>
                            You are about to permanently delete all <strong style={{ color: 'var(--red-text)' }}>{cids.length} cached chunk{cids.length !== 1 ? 's' : ''}</strong> ({stats.storageUsedMB.toFixed(1)} MB) from this device.<br /><br />
                            <strong style={{ color: '#fff' }}>This cannot be undone.</strong> The WORM network will be unable to verify your storage for these files until you re-download them.
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button
                                onClick={handleCancel}
                                style={{
                                    flex: 1, fontSize: 10, padding: '5px 0',
                                    background: 'var(--bg-elevated)',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: 4, color: 'var(--text-secondary)',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleFinalDelete}
                                style={{
                                    flex: 1, fontSize: 10, padding: '5px 0',
                                    background: 'var(--red-text)',
                                    border: 'none',
                                    borderRadius: 4, color: '#fff',
                                    cursor: 'pointer', fontWeight: 700
                                }}
                            >
                                Delete All {cids.length} Chunks
                            </button>
                        </div>
                    </div>
                )}

                {/* Deleting */}
                {warningStep === 'deleting' && (
                    <div style={{
                        marginTop: 10, textAlign: 'center', fontSize: 11,
                        color: 'var(--text-secondary)', padding: '8px 0'
                    }}>
                        Deleting chunks…
                    </div>
                )}

                {/* Done */}
                {warningStep === 'done' && (
                    <div style={{
                        marginTop: 10, textAlign: 'center', fontSize: 11,
                        color: 'var(--green-text)', padding: '6px 0',
                        background: 'rgba(34,197,94,0.08)',
                        borderRadius: 'var(--radius)', border: '1px solid var(--green-text)'
                    }}>
                        All chunks cleared successfully.
                    </div>
                )}
            </div>

            {/* PoS Challenge list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px 10px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, paddingTop: 4 }}>
                    PoS Challenge History
                </div>
                {posChallenges.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-disabled)', fontSize: 12, padding: '20px 0' }}>
                        {posEnabled ? 'Waiting for first challenge…' : 'PoS disabled'}
                    </div>
                ) : posChallenges.map((ch, i) => {
                    const statusDot = ch.status === 'success' ? 'dot-green' : ch.status === 'failed' ? 'dot-red' : 'dot-amber dot-pulse';
                    const statusColor = ch.status === 'success' ? 'var(--green-text)' : ch.status === 'failed' ? 'var(--red-text)' : 'var(--amber-text)';
                    return (
                        <div key={ch.id} className={i === 0 ? 'slide-in' : ''} style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '6px 0', borderBottom: '1px solid var(--border-subtle)',
                            fontSize: 11
                        }}>
                            <span className={`dot ${statusDot}`} style={{ width: 6, height: 6, flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="mono" style={{ color: 'var(--text-secondary)', fontSize: 10 }}>
                                    {cidShort(ch.cid)}
                                </div>
                                <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                                    {new Date(ch.timestamp).toLocaleTimeString()}
                                </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <div style={{ color: statusColor, fontWeight: 600, textTransform: 'uppercase', fontSize: 10 }}>
                                    {ch.status}
                                </div>
                                {ch.rewardEarned && (
                                    <div style={{ color: 'var(--green-bright)', fontFamily: 'var(--font-mono)' }}>
                                        +{ch.rewardEarned} WMT
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
