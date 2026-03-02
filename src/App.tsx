import { useState, useEffect } from 'react';
import './index.css';
import { useNodeState } from './hooks/useNodeState';
import { useAutoUpdater } from './hooks/useAutoUpdater';
import { SetupScreen, loadSavedKeypair } from './components/SetupScreen';
import type { KeyPairBundle } from './components/SetupScreen';
import { Header } from './components/Header';
import { ActivityLog } from './components/ActivityLog';
import { RewardTracker } from './components/RewardTracker';
import { StorageStats } from './components/StorageStats';
import { ChainStats } from './components/ChainStats';
import { LaunchNodeModal } from './components/LaunchNodeModal';
import { Icon } from './components/Icons';
import type { NodeConfig } from './hooks/useNodeState';

type Tab = 'dashboard' | 'storage' | 'chain' | 'settings';

export default function App() {
    const {
        config, saveConfig,
        connStatus, nodeActive,
        wmtBalance,
        logs, rewards, posChallenges,
        chainState, stats,
        startNode, stopNode,
        testConnection,
        fetchChainState,
        setKeypair
    } = useNodeState();

    const { updateInfo, isInstalling, installProgress, installUpdate } = useAutoUpdater();

    const [tab, setTab] = useState<Tab>('dashboard');
    const [showLaunchModal, setShowLaunchModal] = useState(false);

    // Auth state: null = checking, false = need setup, KeyPairBundle = authenticated
    const [authState, setAuthState] = useState<KeyPairBundle | null | false>(null);

    // On mount: try to auto-login from saved keypair
    useEffect(() => {
        loadSavedKeypair().then(bundle => {
            if (bundle && config.identity) {
                setKeypair(bundle);
                setAuthState(bundle);
            } else {
                setAuthState(false);
            }
        });
    }, []);

    function handleSetup(cfg: NodeConfig, keypair: KeyPairBundle) {
        saveConfig(cfg);
        setKeypair(keypair);
        setAuthState(keypair);
    }

    function handleLogout() {
        stopNode();
        // Clear stored keypair
        ['worm_node_priv_jwk', 'worm_node_pub_jwk', 'worm_node_identity_name', 'worm_node_enc_priv_jwk'].forEach(k => localStorage.removeItem(k));
        saveConfig({ ...config, identity: '' });
        setAuthState(false);
    }

    // Still checking saved keys
    if (authState === null) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16 }}>
                <div style={{ fontSize: 32 }}>🪐</div>
                <div className="spinner" style={{ width: 20, height: 20 }} />
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading identity…</div>
            </div>
        );
    }

    // Need to authenticate
    if (authState === false) {
        return <SetupScreen onSetup={handleSetup} />;
    }

    return (
        <div id="app-root" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
            {/* ── Header ───────────────────────────────────────── */}
            <Header
                config={config}
                connStatus={connStatus}
                nodeActive={nodeActive}
                wmtBalance={wmtBalance}
                stats={stats}
                isStaked={!!config.tier && config.storageGB > 0}
                onLaunch={() => setShowLaunchModal(true)}
                onResume={startNode}
                onStop={stopNode}
                onLogout={handleLogout}
                onReconnect={testConnection}
                updateInfo={updateInfo}
                isInstalling={isInstalling}
                installProgress={installProgress}
                onUpdate={installUpdate}
            />

            {/* ── Tab Bar ──────────────────────────────────────── */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 2,
                padding: '6px 12px',
                background: 'var(--bg-surface)',
                borderBottom: '1px solid var(--border-subtle)',
                flexShrink: 0
            }}>
                {([
                    { id: 'dashboard', icon: <Icon.Dashboard size={13} color="currentColor" />, label: 'Dashboard' },
                    { id: 'storage', icon: <Icon.Storage size={13} color="currentColor" />, label: 'Storage & PoS' },
                    { id: 'chain', icon: <Icon.Chain size={13} color="currentColor" />, label: 'Chain & Validators' },
                    { id: 'settings', icon: <Icon.Settings size={13} color="currentColor" />, label: 'Settings' },
                ] as { id: Tab; icon: React.ReactNode; label: string }[]).map(t => (
                    <button
                        key={t.id}
                        id={`tab-${t.id}`}
                        onClick={() => setTab(t.id)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '5px 12px', borderRadius: '4px 4px 0 0',
                            border: 'none', cursor: 'pointer',
                            fontSize: 12, fontWeight: 500,
                            background: tab === t.id ? 'var(--bg-elevated)' : 'transparent',
                            color: tab === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
                            transition: 'all 0.15s',
                            borderBottom: tab === t.id ? '2px solid var(--green-bright)' : '2px solid transparent',
                        }}
                    >
                        {t.icon}
                        <span>{t.label}</span>
                    </button>
                ))}

                {nodeActive && (
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="dot dot-green dot-pulse" />
                        <span style={{ fontSize: 11, color: 'var(--green-bright)', fontWeight: 600 }}>MINING</span>
                    </div>
                )}
            </div>

            {/* ── Content ──────────────────────────────────────── */}
            <div style={{ flex: 1, overflow: 'hidden', padding: 12 }}>
                {tab === 'dashboard' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 10, height: '100%' }}>
                        <ActivityLog logs={logs} nodeActive={nodeActive} />
                        <RewardTracker
                            rewards={rewards}
                            totalEarned={stats.totalEarned}
                            sessionStarted={stats.sessionStarted}
                            relayCount={stats.relayRewardCount}
                            posSuccessCount={stats.posSuccessCount}
                        />
                    </div>
                )}

                {tab === 'storage' && (
                    <div style={{ height: '100%', overflow: 'auto' }}>
                        <StorageStats posChallenges={posChallenges} stats={stats} posEnabled={config.posEnabled} />
                    </div>
                )}

                {tab === 'chain' && (
                    <div style={{ height: '100%', overflow: 'auto' }}>
                        <ChainStats chainState={chainState} identity={config.identity} onRefresh={fetchChainState} />
                    </div>
                )}

                {tab === 'settings' && (
                    <SettingsPanel config={config} onSave={saveConfig} keypair={authState as KeyPairBundle} />
                )}
            </div>

            {/* ── Launch Node Modal ──────────────────────────── */}
            {showLaunchModal && (
                <LaunchNodeModal
                    identity={config.identity}
                    balance={wmtBalance}
                    onClose={() => setShowLaunchModal(false)}
                    onNodeLaunched={(tier, storageGB, _multiplier) => {
                        saveConfig({ ...config, tier: tier as any, storageGB });
                        setShowLaunchModal(false);
                        if (!nodeActive) startNode();
                    }}
                />
            )}

            {/* ── Status Bar ───────────────────────────────────── */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '4px 14px',
                background: 'var(--bg-card)',
                borderTop: '1px solid var(--border-subtle)',
                flexShrink: 0,
                fontSize: 10, color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)'
            }}>
                <span>Block #{chainState.height}</span>
                <span style={{ color: 'var(--border-default)' }}>|</span>
                <span>Relay: {stats.relayRewardCount} cycles</span>
                <span style={{ color: 'var(--border-default)' }}>|</span>
                <span>PoS: {stats.posSuccessCount}/{stats.posSuccessCount + stats.posFailCount} passed</span>
                <span style={{ color: 'var(--border-default)' }}>|</span>
                <span>Earned: {stats.totalEarned.toLocaleString()} WMT</span>
                <span style={{ marginLeft: 'auto', color: 'var(--text-disabled)' }}>
                    🔐 {config.identity}
                </span>
            </div>
        </div>
    );
}

// ── Settings Panel ──────────────────────────────────────────────
function SettingsPanel({ config, onSave, keypair }: { config: NodeConfig; onSave: (cfg: NodeConfig) => void; keypair: KeyPairBundle }) {
    const [draft, setDraft] = useState(config);
    const [saved, setSaved] = useState(false);
    const [fingerprint, setFingerprint] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const spki = await crypto.subtle.exportKey('spki', keypair.signingPub);
                const hash = await crypto.subtle.digest('SHA-256', spki);
                const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
                setFingerprint(`0x${hex.slice(0, 16).toUpperCase()}…`);
            } catch { /* ignore */ }
        })();
    }, [keypair]);

    function save() {
        onSave(draft);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    }

    return (
        <div style={{ maxWidth: 500, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Identity info */}
            <div className="card">
                <div className="card-header">
                    <span>🔐</span>
                    <span className="card-title">Identity</span>
                    <span className="badge badge-green" style={{ marginLeft: 'auto' }}>Verified</span>
                </div>
                <div className="stat-row">
                    <span className="stat-label">WNS Name</span>
                    <span className="stat-value mono">{config.identity}</span>
                </div>
                <div className="stat-row">
                    <span className="stat-label">Key Fingerprint</span>
                    <span className="stat-value mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fingerprint || '…'}</span>
                </div>
                <div className="stat-row">
                    <span className="stat-label">Algorithm</span>
                    <span className="stat-value" style={{ color: 'var(--text-secondary)' }}>ECDSA P-256</span>
                </div>
            </div>

            {/* Node settings */}
            <div className="card">
                <div className="card-header">
                    <span>⚙️</span>
                    <span className="card-title">Node Settings</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                    <div className="divider" style={{ margin: '4px 0' }} />

                    {[
                        { key: 'autoReconnect', label: '🔄 Auto-reconnect on disconnect', desc: 'Retry connection automatically' },
                        { key: 'relayEnabled', label: '📡 Relay Node Participation', desc: 'Earn WMT by relaying messages' },
                        { key: 'posEnabled', label: '💾 Proof-of-Storage', desc: 'Earn WMT by proving stored chunks' },
                    ].map(opt => (
                        <label key={opt.key} style={{ display: 'flex', gap: 12, cursor: 'pointer', alignItems: 'center' }}
                            onClick={() => setDraft(p => ({ ...p, [opt.key]: !(p as any)[opt.key] }))}>
                            <div style={{
                                width: 36, height: 20, borderRadius: 10,
                                background: (draft as any)[opt.key] ? 'var(--green-mid)' : 'var(--border-default)',
                                position: 'relative', flexShrink: 0, transition: 'background 0.2s'
                            }}>
                                <div style={{
                                    width: 14, height: 14, borderRadius: 7, background: '#fff',
                                    position: 'absolute', top: 3,
                                    left: (draft as any)[opt.key] ? 19 : 3, transition: 'left 0.2s'
                                }} />
                            </div>
                            <div>
                                <div style={{ fontSize: 12, color: 'var(--text-primary)', userSelect: 'none' }}>{opt.label}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{opt.desc}</div>
                            </div>
                        </label>
                    ))}
                </div>

                <div style={{ marginTop: 20 }}>
                    <button id="save-settings-btn" className={`btn ${saved ? 'btn-secondary' : 'btn-primary'}`} onClick={save} style={{ width: '100%' }}>
                        {saved ? '✅ Saved!' : 'Save Settings'}
                    </button>
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <span>ℹ️</span>
                    <span className="card-title">Reward Schedule</span>
                </div>
                <div className="stat-row"><span className="stat-label">📡 Relay Reward</span><span className="stat-value text-blue">5 WMT / 5 min</span></div>
                <div className="stat-row"><span className="stat-label">💾 PoS Reward</span><span className="stat-value text-green">10 WMT / proof</span></div>
                <div className="stat-row"><span className="stat-label">⏳ Batch Settlement</span><span className="stat-value text-secondary">Every 1 hour</span></div>
            </div>
        </div>
    );
}
