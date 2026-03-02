import { useState, useEffect, useRef } from 'react';
import { Icon } from './Icons';
import { SERVER_URL } from '../hooks/useNodeState';

interface Props {
    identity: string;      // e.g. "money.wormit"
    balance: number;
    onClose: () => void;
}

type View = 'home' | 'receive' | 'send';

export function WalletPanel({ identity, balance, onClose }: Props) {
    const [view, setView] = useState<View>('home');
    const [sendTo, setSendTo] = useState('');
    const [sendAmt, setSendAmt] = useState('');
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState('');
    const [sendSuccess, setSendSuccess] = useState('');
    const [copied, setCopied] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        function handler(e: MouseEvent) {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                onClose();
            }
        }
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    function copyIdentity() {
        navigator.clipboard.writeText(identity).catch(() => { });
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
    }

    async function handleSend() {
        const amount = parseFloat(sendAmt);
        if (!sendTo.trim()) { setSendError('Recipient is required.'); return; }
        if (!amount || amount <= 0) { setSendError('Enter a valid amount.'); return; }
        if (amount > balance) { setSendError(`Insufficient balance (${balance} WMT available).`); return; }

        setSending(true);
        setSendError('');
        setSendSuccess('');

        try {
            const tx = {
                txId: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                from: identity,
                to: sendTo.trim().toLowerCase(),
                amount,
                type: 'TRANSFER',
                timestamp: Date.now(),
                signature: 'USER_SEND',
            };
            const res = await fetch(`${SERVER_URL}/api/chain/tx`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tx }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || `Error ${res.status}`);
            setSendSuccess(`Sent ${amount} WMT to ${sendTo.trim()} ✓`);
            setSendTo('');
            setSendAmt('');
        } catch (e: any) {
            setSendError(e.message || 'Transfer failed');
        } finally {
            setSending(false);
        }
    }

    return (
        <>
            {/* Backdrop (subtle) */}
            <div style={{
                position: 'fixed', inset: 0, zIndex: 998,
                background: 'transparent',
            }} />

            {/* Panel */}
            <div ref={panelRef} style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                width: 320, zIndex: 999,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-xl)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                animation: 'slideUp 0.18s ease-out',
                overflow: 'hidden',
            }}>

                {/* Header */}
                <div style={{
                    padding: '16px 18px 12px',
                    borderBottom: '1px solid var(--border-subtle)',
                    background: 'linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(139,92,246,0.06) 100%)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Icon.Coin size={15} color="var(--amber-text)" />
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Wallet</span>
                        </div>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
                            <Icon.Close size={14} color="currentColor" />
                        </button>
                    </div>

                    {/* Balance */}
                    <div style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>AVAILABLE BALANCE</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 800, color: 'var(--green-bright)' }}>
                                {balance.toLocaleString()}
                            </span>
                            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>WMT</span>
                        </div>
                    </div>

                    {/* Identity (receive address) */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '5px 8px', background: 'var(--bg-surface)',
                        borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)',
                        marginTop: 6,
                    }}>
                        <Icon.Identity size={11} color="var(--text-muted)" />
                        <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {identity}
                        </span>
                        <button onClick={copyIdentity} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? 'var(--green-bright)' : 'var(--text-muted)', padding: 0, fontSize: 10, fontWeight: 600 }}>
                            {copied ? 'Copied!' : <Icon.Upload size={11} color="currentColor" />}
                        </button>
                    </div>
                </div>

                {/* Action Tabs */}
                {view === 'home' && (
                    <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <button
                            id="wallet-receive-btn"
                            onClick={() => setView('receive')}
                            style={{
                                padding: '12px 0', borderRadius: 'var(--radius)',
                                border: '1px solid var(--border-default)',
                                background: 'var(--bg-surface)',
                                cursor: 'pointer', color: 'var(--text-primary)',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                                transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--green-mid)')}
                            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-default)')}
                        >
                            <Icon.Upload size={18} color="var(--green-bright)" style={{ transform: 'rotate(180deg)' }} />
                            <span style={{ fontSize: 12, fontWeight: 600 }}>Receive</span>
                        </button>

                        <button
                            id="wallet-send-btn"
                            onClick={() => setView('send')}
                            style={{
                                padding: '12px 0', borderRadius: 'var(--radius)',
                                border: '1px solid var(--border-default)',
                                background: 'var(--bg-surface)',
                                cursor: 'pointer', color: 'var(--text-primary)',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                                transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--blue-mid)')}
                            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-default)')}
                        >
                            <Icon.Upload size={18} color="var(--blue-bright)" />
                            <span style={{ fontSize: 12, fontWeight: 600 }}>Send</span>
                        </button>
                    </div>
                )}

                {/* Receive View */}
                {view === 'receive' && (
                    <div style={{ padding: '16px 18px' }}>
                        <button onClick={() => setView('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, padding: 0, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 14 }}>
                            ← Back
                        </button>

                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Receive WMT</div>

                        <div style={{ padding: '12px', background: 'var(--bg-surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border-subtle)', marginBottom: 12 }}>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>Your WORMIT account name</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--green-bright)', wordBreak: 'break-all' }}>
                                {identity}
                            </div>
                        </div>

                        <div style={{
                            padding: '10px 12px', background: 'rgba(16,185,129,0.06)',
                            border: '1px solid rgba(16,185,129,0.2)', borderRadius: 'var(--radius)',
                            fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 14,
                        }}>
                            Share your account name above to receive WMT. Senders can use your WORMIT name (e.g. <strong style={{ color: 'var(--text-primary)' }}>{identity}</strong>) directly.
                        </div>

                        <button
                            id="wallet-copy-addr-btn"
                            className="btn btn-primary"
                            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                            onClick={copyIdentity}
                        >
                            {copied ? <><Icon.Check size={13} color="#fff" /> Copied!</> : <><Icon.Upload size={13} color="#fff" style={{ transform: 'rotate(180deg)' }} /> Copy Account Name</>}
                        </button>
                    </div>
                )}

                {/* Send View */}
                {view === 'send' && (
                    <div style={{ padding: '16px 18px' }}>
                        <button onClick={() => { setView('home'); setSendError(''); setSendSuccess(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, padding: 0, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 14 }}>
                            ← Back
                        </button>

                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Send WMT</div>

                        {/* Instructions */}
                        <div style={{
                            padding: '10px 12px',
                            background: 'rgba(59,130,246,0.06)',
                            border: '1px solid rgba(59,130,246,0.2)',
                            borderRadius: 'var(--radius)',
                            fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7,
                            marginBottom: 14,
                        }}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                                <Icon.Info size={13} color="var(--blue-bright)" style={{ flexShrink: 0, marginTop: 1 }} />
                                <div>
                                    Enter the recipient's <strong style={{ color: 'var(--text-primary)' }}>WORMIT account name</strong> (e.g. <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>alice.wormit</code>) or their <strong style={{ color: 'var(--text-primary)' }}>wallet address</strong>. Double-check the address — transactions on WormChain are <strong style={{ color: 'var(--text-primary)' }}>irreversible</strong>.
                                </div>
                            </div>
                        </div>

                        <div style={{ marginBottom: 12 }}>
                            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>To (WORMIT account or address)</label>
                            <input
                                id="wallet-send-to"
                                className="input"
                                placeholder="e.g. alice.wormit"
                                value={sendTo}
                                onChange={e => setSendTo(e.target.value)}
                                style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                            />
                        </div>

                        <div style={{ marginBottom: 14 }}>
                            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>
                                Amount (WMT) <span style={{ color: 'var(--text-disabled)' }}>— Balance: {balance.toLocaleString()} WMT</span>
                            </label>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <input
                                    id="wallet-send-amount"
                                    className="input"
                                    type="number"
                                    placeholder="0"
                                    min={1}
                                    max={balance}
                                    value={sendAmt}
                                    onChange={e => setSendAmt(e.target.value)}
                                    style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700 }}
                                />
                                <button
                                    onClick={() => setSendAmt(String(balance))}
                                    style={{ padding: '0 10px', fontSize: 10, fontWeight: 700, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}
                                >
                                    MAX
                                </button>
                            </div>
                        </div>

                        {sendError && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ef4444', fontSize: 11, marginBottom: 12, padding: '7px 10px', background: 'rgba(239,68,68,0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239,68,68,0.2)' }}>
                                <Icon.AlertTriangle size={13} color="#ef4444" /> {sendError}
                            </div>
                        )}
                        {sendSuccess && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--green-bright)', fontSize: 11, marginBottom: 12, padding: '7px 10px', background: 'rgba(16,185,129,0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(16,185,129,0.2)' }}>
                                <Icon.Check size={13} color="var(--green-bright)" /> {sendSuccess}
                            </div>
                        )}

                        <button
                            id="wallet-send-confirm-btn"
                            className="btn btn-primary"
                            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                            onClick={handleSend}
                            disabled={sending || !sendTo || !sendAmt}
                        >
                            {sending
                                ? <><span className="spinner" /> Sending…</>
                                : <><Icon.Upload size={13} color="#fff" /> Send {sendAmt ? `${sendAmt} WMT` : 'WMT'}</>}
                        </button>
                    </div>
                )}
            </div>
        </>
    );
}
