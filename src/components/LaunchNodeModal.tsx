import { useState, useEffect, useRef } from 'react';
import { SERVER_URL } from '../hooks/useNodeState';
import { Icon } from './Icons';
import { invoke } from '@tauri-apps/api/tauri';

// 서버에서 실시간으로 tier config를 불러오므로 기본값은 fallback용
const DEFAULT_TIER_REQUIREMENTS = {
    VAULT: { minStake: 1000000, minStorage: 1000, rewardRate: 15, rewardMultiplier: 5.0, color: '#8b5cf6' },
    ARCHIVE: { minStake: 50000, minStorage: 300, rewardRate: 5, rewardMultiplier: 3.0, color: '#3b82f6' },
    SEEDLING: { minStake: 1000, minStorage: 10, rewardRate: 0.5, rewardMultiplier: 1.5, color: '#10b981' },
} as const;

type TierKey = 'VAULT' | 'ARCHIVE' | 'SEEDLING';
type TierCfg = { minStake: number; minStorage: number; rewardRate: number; rewardMultiplier: number; color: string };
type TierRequirements = Record<TierKey, TierCfg>;

interface StakeStatus {
    staked: boolean;
    stakedWMT: number;
    storageGB: number;
    tier: TierKey | null;
    multiplier: number;
    maturityScore: number;
    persistenceBonus: string;
    stakedAt?: number;
}

interface Props {
    identity: string;
    balance: number;
    onClose: () => void;
    onNodeLaunched: (tier: TierKey, storageGB: number, multiplier: number) => void;
}

/** 티어별 설명 tooltip 콘텐츠 */
const TIER_TOOLTIP_DATA: Record<TierKey, { icon: string; label: string; color: string; desc: string; perks: string[] }> = {
    SEEDLING: {
        icon: '🌱', label: 'SEEDLING', color: '#10b981',
        desc: '시작하는 노드 참여자를 위한 기본 등급입니다.',
        perks: ['× 1.5 보상 배율', '+최대 50% 지속성 보너스', '10GB 이상 스토리지 제공', '최소 1,000 WMT 스테이킹'],
    },
    ARCHIVE: {
        icon: '🗄️', label: 'ARCHIVE', color: '#3b82f6',
        desc: '대용량 스토리지를 제공하는 중급 등급입니다.',
        perks: ['× 3.0 보상 배율', '+최대 50% 지속성 보너스', '300GB 이상 스토리지 제공', '최소 50,000 WMT 스테이킹'],
    },
    VAULT: {
        icon: '🔐', label: 'VAULT', color: '#8b5cf6',
        desc: '최고 등급. 대규모 인프라를 운영하는 전문 노드입니다.',
        perks: ['× 5.0 보상 배율', '+최대 50% 지속성 보너스', '1TB 이상 스토리지 제공', '최소 1,000,000 WMT 스테이킹'],
    },
};

export function LaunchNodeModal({ identity, balance, onClose, onNodeLaunched }: Props) {
    const [storageGB, setStorageGB] = useState(10);
    const [stakeInput, setStakeInput] = useState('');
    const [stakeWMT, setStakeWMT] = useState(0);
    const [hwCapacity, setHwCapacity] = useState<number>(558);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [existingStake, setExistingStake] = useState<StakeStatus | null>(null);
    const [view, setView] = useState<'setup' | 'active'>('setup');
    const [liveBalance, setLiveBalance] = useState<number>(balance);
    const [showTierTooltip, setShowTierTooltip] = useState(false);
    const [tierReqs, setTierReqs] = useState<TierRequirements>(DEFAULT_TIER_REQUIREMENTS);
    const tooltipRef = useRef<HTMLDivElement>(null);

    // 서버에서 tier config 불러오기
    useEffect(() => {
        fetch(`${SERVER_URL}/api/admin/tier-config`)
            .then(r => r.json())
            .then(data => {
                if (data.tiers) {
                    // color는 서버에 없으니 기본값에서 merge
                    const merged: TierRequirements = { ...DEFAULT_TIER_REQUIREMENTS };
                    for (const k of ['VAULT', 'ARCHIVE', 'SEEDLING'] as TierKey[]) {
                        if (data.tiers[k]) {
                            merged[k] = { ...DEFAULT_TIER_REQUIREMENTS[k], ...data.tiers[k] };
                        }
                    }
                    setTierReqs(merged);
                }
            }).catch(() => { });
    }, []);

    // 실제 디스크 여유 공간: Tauri invoke (네이티브), fallback은 navigator API
    useEffect(() => {
        const detectDiskSpace = async () => {
            try {
                // Tauri 환경: Rust 커맨드로 실제 여유 공간 조회
                if ('__TAURI__' in window) {
                    const freeGB = await invoke<number>('get_disk_free_gb');
                    if (freeGB > 0) { setHwCapacity(freeGB); return; }
                }
                // 브라우저 fallback (부정확하지만 없는 것보다 나음)
                if (navigator.storage?.estimate) {
                    const est = await navigator.storage.estimate();
                    setHwCapacity(Math.floor((est.quota || 0) / (1024 ** 3)));
                }
            } catch {
                setHwCapacity(100); // 최소 fallback
            }
        };
        detectDiskSpace();
    }, []);

    // Fetch live balance
    useEffect(() => {
        if (!identity) return;
        fetch(`${SERVER_URL}/api/chain/balance/${encodeURIComponent(identity)}`)
            .then(r => r.json())
            .then(data => { if (typeof data.balance === 'number') setLiveBalance(data.balance); })
            .catch(() => { });
    }, [identity]);

    // Load existing stake status
    useEffect(() => {
        fetch(`${SERVER_URL}/api/stake/status?identity=${encodeURIComponent(identity)}`)
            .then(r => r.json())
            .then((data: StakeStatus) => {
                setExistingStake(data);
                if (data.staked) {
                    setView('active');
                    setStorageGB(data.storageGB || 10);
                    setStakeWMT(data.stakedWMT || 0);
                    setStakeInput(String(data.stakedWMT || 0));
                }
            })
            .catch(() => { });
    }, [identity]);

    // Close tooltip on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
                setShowTierTooltip(false);
            }
        };
        if (showTierTooltip) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showTierTooltip]);

    // Determine tier based on inputs
    // ── 등급 결정 로직 ──────────────────────────────────────────────
    // targetTier: 스테이킹 금액만으로 결정 → WMT 입력 시 즉시 뱃지 변경
    // achievedTier: stake + storage 모두 충족해야 실제 달성
    const detectTierByStake = (stake: number): TierKey => {
        if (stake >= tierReqs.VAULT.minStake) return 'VAULT';
        if (stake >= tierReqs.ARCHIVE.minStake) return 'ARCHIVE';
        return 'SEEDLING';
    };

    const detectTierByBoth = (stake: number, storage: number): TierKey => {
        const order: TierKey[] = ['VAULT', 'ARCHIVE', 'SEEDLING'];
        for (const t of order) {
            const reqs = tierReqs[t];
            if (stake >= reqs.minStake && storage >= reqs.minStorage) return t;
        }
        return 'SEEDLING';
    };

    const targetTier = detectTierByStake(stakeWMT);    // WMT 기준 목표 등급
    const achievedTier = detectTierByBoth(stakeWMT, storageGB); // 실제 달성 등급
    const tier = targetTier;                            // 뱃지에는 목표 등급 표시

    const currentTierReqs = tierReqs[targetTier];
    const meetsStake = stakeWMT >= currentTierReqs.minStake;
    const meetsStorage = storageGB >= currentTierReqs.minStorage;
    const meetsAll = meetsStake && meetsStorage;
    // 스테이킹은 충분하지만 스토리지가 부족한 경우
    const needsMoreStorage = meetsStake && !meetsStorage;
    const storageGap = meetsStorage ? 0 : currentTierReqs.minStorage - storageGB;

    const maturityDays = existingStake?.stakedAt ? (Date.now() - existingStake.stakedAt) / (1000 * 60 * 60 * 24) : 0;
    const maturityScore = Math.min(1.0, maturityDays / 30);
    const persistenceBonus = 1 + (maturityScore * 0.5);
    // 계산은 실제 달성 등급 기준
    const effReqs = tierReqs[achievedTier];
    const stakeMultiplier = (meetsStake && storageGB >= tierReqs.SEEDLING.minStorage)
        ? effReqs.rewardMultiplier * persistenceBonus
        : 1.0;
    const estimatedMonthly = (meetsStake && storageGB >= tierReqs.SEEDLING.minStorage)
        ? (storageGB * effReqs.rewardRate * 0.7 * (stakeWMT / effReqs.minStake) * persistenceBonus).toFixed(0)
        : '0';
    const estimatedDaily = Number(estimatedMonthly) > 0 ? (Number(estimatedMonthly) / 30).toFixed(1) : '0';
    const availableForStake = liveBalance + (existingStake?.stakedWMT || 0);

    const tierColor = currentTierReqs.color;

    async function handleLaunch() {
        if (!meetsAll) return;
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`${SERVER_URL}/api/stake`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identity, stakeWMT, storageGB })
            });
            let data: any = {};
            try { data = await res.json(); } catch { data = { error: `HTTP ${res.status}` }; }
            if (!res.ok || !data.success) throw new Error(data.error || `Server error ${res.status}`);
            onNodeLaunched(tier, storageGB, data.multiplier);
            onClose();
        } catch (e: any) {
            const msg = e.message || String(e);
            if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed to fetch')) {
                setError(`Network error — check server connection`);
            } else {
                setError(msg);
            }
        } finally {
            setLoading(false);
        }
    }

    async function handleUnstake() {
        if (!window.confirm('Unstake and return WMT to wallet?')) return;
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`${SERVER_URL}/api/unstake`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identity })
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Unstake failed');
            setExistingStake(null);
            setView('setup');
            setStakeWMT(0);
            setStakeInput('');
        } catch (e: any) {
            setError(e.message || 'Unstake failed');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20
        }} onClick={e => e.target === e.currentTarget && onClose()}>
            <div style={{
                width: '100%', maxWidth: 480,
                background: 'var(--bg-card)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-xl)',
                padding: 28,
                boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
                animation: 'slideUp 0.2s ease-out',
                maxHeight: '90vh', overflowY: 'auto'
            }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, textAlign: 'center', marginBottom: 4 }}>
                    Launch Storage Node
                </h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 24 }}>
                    Contribute resources to the WSN and earn WMT rewards.
                </p>

                {/* Active stake banner */}
                {view === 'active' && existingStake && (
                    <div style={{
                        padding: '10px 14px', marginBottom: 20,
                        background: 'var(--green-dim)', border: '1px solid var(--green-mid)',
                        borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', gap: 10
                    }}>
                        <Icon.Check size={18} color="var(--green-bright)" />
                        <div>
                            <div style={{ fontSize: 11, color: 'var(--green-text)', fontWeight: 600 }}>
                                Active stake — {existingStake.tier} node
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                                {existingStake.stakedWMT.toLocaleString()} WMT staked · {existingStake.storageGB} GB · ×{existingStake.multiplier} multiplier
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Storage Allocation ── */}
                <div style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <label className="input-label">Storage Allocation</label>
                        <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--green-bright)' }}>{storageGB} GB</span>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Available: {hwCapacity}GB</div>
                        </div>
                    </div>
                    <input
                        type="range"
                        min={10} max={Math.max(hwCapacity, 10)} step={1}
                        value={storageGB}
                        onChange={e => setStorageGB(Number(e.target.value))}
                        style={{ width: '100%', height: 6, cursor: 'pointer', accentColor: 'var(--green-bright)' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span>10GB (Min)</span>
                            <span style={{ padding: '1px 5px', background: 'rgba(16,185,129,0.1)', color: '#10b981', borderRadius: 4, fontSize: 9, fontWeight: 700 }}>
                                DEVICE_MAX: {hwCapacity}GB
                            </span>
                        </div>
                        <span>{hwCapacity}GB (Capped Max)</span>
                    </div>
                </div>

                {/* ── Staked Amount ── */}
                <div style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <label className="input-label">Staked Amount</label>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green-bright)' }}>
                                {stakeWMT.toLocaleString()} WMT
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                Available: {availableForStake.toLocaleString()} WMT
                            </div>
                        </div>
                    </div>
                    <input
                        className="input"
                        type="number"
                        min={0}
                        max={availableForStake}
                        value={stakeInput}
                        onChange={e => {
                            setStakeInput(e.target.value);
                            setStakeWMT(Number(e.target.value) || 0);
                        }}
                        placeholder="Enter WMT amount..."
                    />
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
                        Minimum stake for {tier} is <strong style={{ color: 'var(--text-secondary)' }}>{currentTierReqs.minStake.toLocaleString()} WMT</strong>
                    </div>
                    {/* Quick fill buttons */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        {[1000, 5000, 50000, 1000000].map(amt => (
                            <button key={amt} onClick={() => { setStakeInput(String(amt)); setStakeWMT(amt); }}
                                style={{
                                    flex: 1, padding: '4px 0', fontSize: 9, borderRadius: 6,
                                    border: `1px solid ${stakeWMT === amt ? 'var(--green-mid)' : 'var(--border-subtle)'}`,
                                    background: stakeWMT === amt ? 'var(--green-dim)' : 'var(--bg-surface)',
                                    color: stakeWMT === amt ? 'var(--green-text)' : 'var(--text-muted)',
                                    cursor: 'pointer'
                                }}>
                                {amt >= 1000000 ? '1M' : amt >= 1000 ? `${amt / 1000}k` : amt} WMT
                            </button>
                        ))}
                        <button onClick={() => { setStakeInput(String(availableForStake)); setStakeWMT(availableForStake); }}
                            style={{ flex: 1, padding: '4px 0', fontSize: 9, borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                            MAX
                        </button>
                    </div>
                </div>

                {/* ── Node Performance Card ── */}
                <div style={{
                    background: 'var(--bg-surface)',
                    border: `1px solid ${meetsAll ? tierColor + '44' : needsMoreStorage ? tierColor + '33' : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 20,
                    borderLeft: `3px solid ${meetsAll ? tierColor : needsMoreStorage ? tierColor : 'var(--border-default)'}`
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            NODE PERFORMANCE
                        </div>

                        {/* 티어 뱃지 + tooltip */}
                        <div style={{ position: 'relative' }} ref={tooltipRef}>
                            <div
                                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '3px 8px', borderRadius: 6, border: `1px solid ${tierColor}44`, background: tierColor + '11', transition: 'background 0.15s' }}
                                onClick={() => setShowTierTooltip(v => !v)}
                                onMouseEnter={() => setShowTierTooltip(true)}
                                title="Click for tier info"
                            >
                                {tier === 'VAULT' && <Icon.NodeVault size={14} color={tierColor} />}
                                {tier === 'ARCHIVE' && <Icon.NodeArchive size={14} color={tierColor} />}
                                {tier === 'SEEDLING' && <Icon.NodeSeedling size={14} color={tierColor} />}
                                <span style={{ fontSize: 12, fontWeight: 700, color: tierColor }}>{tier}</span>
                                <span style={{ fontSize: 9, color: tierColor, opacity: 0.7 }}>ⓘ</span>
                            </div>

                            {/* ── Tier Tooltip ── */}
                            {showTierTooltip && (
                                <div style={{
                                    position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 200,
                                    width: 300, background: 'var(--bg-card)',
                                    border: `1px solid var(--border-default)`,
                                    borderRadius: 'var(--radius)', boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
                                    overflow: 'hidden', animation: 'slideUp 0.15s ease-out'
                                }}>
                                    {/* Header */}
                                    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>노드 등급 안내</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                            스테이킹 금액과 제공 스토리지 크기에 따라 등급이 자동으로 결정됩니다.
                                        </div>
                                    </div>

                                    {/* Tier rows */}
                                    {(['SEEDLING', 'ARCHIVE', 'VAULT'] as TierKey[]).map(t => {
                                        const td = TIER_TOOLTIP_DATA[t];
                                        const tr = tierReqs[t];
                                        const isActive = t === tier;
                                        return (
                                            <div key={t} style={{
                                                padding: '10px 14px',
                                                borderBottom: '1px solid var(--border-subtle)',
                                                background: isActive ? td.color + '0f' : 'transparent',
                                                borderLeft: isActive ? `3px solid ${td.color}` : '3px solid transparent',
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                                    <span style={{ fontSize: 14 }}>{td.icon}</span>
                                                    <span style={{ fontSize: 12, fontWeight: 700, color: td.color }}>{td.label}</span>
                                                    {isActive && <span style={{ fontSize: 9, padding: '1px 5px', background: td.color + '22', color: td.color, borderRadius: 4, fontWeight: 700 }}>현재</span>}
                                                </div>
                                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 5 }}>{td.desc}</div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px' }}>
                                                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                                                        💰 스테이킹: <span style={{ color: td.color, fontWeight: 600 }}>{tr.minStake.toLocaleString()} WMT+</span>
                                                    </div>
                                                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                                                        💾 스토리지: <span style={{ color: td.color, fontWeight: 600 }}>{tr.minStorage >= 1000 ? `${tr.minStorage / 1000}TB+` : `${tr.minStorage}GB+`}</span>
                                                    </div>
                                                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                                                        ✨ 배율: <span style={{ color: td.color, fontWeight: 600 }}>×{tr.rewardMultiplier.toFixed(1)}</span>
                                                    </div>
                                                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                                                        📈 지속성: <span style={{ color: td.color, fontWeight: 600 }}>+최대 50%</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    <div style={{ padding: '8px 14px', background: 'var(--bg-elevated)', fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                        💡 등급은 스테이킹 금액을 늘리거나 스토리지를 확장하면 자동으로 상승합니다. 30일 이상 유지 시 Persistence Bonus 최대치(+50%) 달성.
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Performance metrics */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Status</span>
                            <span style={{
                                fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                                color: meetsAll ? 'var(--green-bright)' : needsMoreStorage ? '#f59e0b' : '#ef4444'
                            }}>
                                {meetsAll
                                    ? <><Icon.Check size={12} color="var(--green-bright)" /> Ready</> : needsMoreStorage
                                        ? `💾 Storage +${storageGap >= 1000 ? `${(storageGap / 1000).toFixed(1)}TB` : `${storageGap}GB`} needed`
                                        : 'Stake Required'}
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Reward Multiplier</span>
                            <span style={{ color: tierColor, fontWeight: 600 }}>×{stakeMultiplier.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Persistence Bonus</span>
                            <span style={{ color: 'var(--text-blue)', fontWeight: 600 }}>+{Math.round(maturityScore * 50)}% (max +50%)</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Daily Reward (Est)</span>
                            <span style={{ color: tierColor, fontWeight: 600 }}>~{estimatedDaily} WMT</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Monthly Reward (Est)</span>
                            <span style={{ color: tierColor, fontWeight: 600 }}>~{estimatedMonthly} WMT</span>
                        </div>
                        {maturityScore > 0 && (
                            <div style={{ marginTop: 4 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
                                    <span>Data Maturity</span>
                                    <span>{Math.round(maturityScore * 100)}% ({Math.round(maturityDays)}d / 30d)</span>
                                </div>
                                <div style={{ height: 4, background: 'var(--bg-elevated)', borderRadius: 2, overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${maturityScore * 100}%`, background: 'var(--green-bright)', borderRadius: 2, transition: 'width 0.5s' }} />
                                </div>
                            </div>
                        )}
                    </div>
                    <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--bg-elevated)', borderRadius: 6, fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
                        * Maintaining data over time increases your <strong>Data Maturity score</strong>, boosting yield up to 1.5× total.
                    </div>
                </div>

                {/* Notice */}
                <div style={{
                    borderLeft: '3px solid #f59e0b', padding: '8px 12px', marginBottom: 24,
                    background: 'rgba(245,158,11,0.06)', borderRadius: '0 6px 6px 0',
                    fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6
                }}>
                    Operational rewards are distributed daily. Funds can be unstaked anytime after stopping the node.
                </div>

                {error && (
                    <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 14, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Icon.AlertTriangle size={13} color="#ef4444" /> {error}
                    </div>
                )}

                {/* Buttons */}
                <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-secondary" onClick={onClose} disabled={loading} style={{ flex: 1 }}>
                        Cancel
                    </button>
                    {view === 'active' && existingStake?.staked && (
                        <button className="btn" onClick={handleUnstake} disabled={loading}
                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                            {loading ? 'Processing…' : <><Icon.UnstakeLock size={13} color="#ef4444" /> Unstake</>}
                        </button>
                    )}
                    <button
                        id="launch-node-btn"
                        className="btn btn-primary"
                        onClick={handleLaunch}
                        disabled={loading || !meetsAll}
                        style={{ flex: 2, background: meetsAll ? undefined : 'var(--bg-elevated)', color: meetsAll ? undefined : 'var(--text-muted)' }}
                    >
                        {loading ? <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="spinner" />Processing…</span>
                            : view === 'active'
                                ? <><Icon.UpdateStake size={13} color="#fff" /> Update Stake</>
                                : <><Icon.Launch size={13} color="#fff" /> Launch Node</>}
                    </button>
                </div>
            </div>
        </div>
    );
}
