import { useState, useEffect, useRef, useCallback } from 'react';
import type { KeyPairBundle } from '../components/SetupScreen';
import * as NativeChunkStore from '../utils/NativeChunkStore';

export const SERVER_URL = 'https://worm-protocol-production.up.railway.app';

export type NodeTier = 'VAULT' | 'ARCHIVE' | 'SEEDLING';
export type ConnStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface LogEntry {
    id: string;
    time: string;
    icon: string;
    msg: string;
    type: 'success' | 'error' | 'warn' | 'info' | 'reward' | 'default';
}

export interface RewardEvent {
    id: string;
    type: 'RELAY_REWARD' | 'STORAGE_REWARD' | 'REWARD_BATCH' | 'GENESIS_AIRDROP';
    amount: number;
    timestamp: number;
    txId?: string;
}

export interface PosChallenge {
    id: string;
    cid: string;
    status: 'pending' | 'proving' | 'success' | 'failed';
    timestamp: number;
    rewardEarned?: number;
}

export interface ChainBlock {
    index: number;
    hash: string;
    validator: string;
    txCount: number;
    timestamp: number;
}

export interface NodeStats {
    chunksStored: number;
    storageUsedMB: number;
    relayRewardCount: number;
    posSuccessCount: number;
    posFailCount: number;
    totalEarned: number;
    sessionStarted: number;
    relaysRelayed: number;
}

export interface ChainState {
    height: number;
    lastHash: string;
    totalTxs: number;
    validators: string[];
    validatorThreshold: number;
    recentBlocks: ChainBlock[];
    isValidator: boolean;
}

export interface NodeConfig {
    identity: string;
    tier: NodeTier;
    storageGB: number;
    autoReconnect: boolean;
    posEnabled: boolean;
    relayEnabled: boolean;
}

function nowStr() {
    return new Date().toLocaleTimeString('en-US', { hour12: false });
}

function genId() {
    return Math.random().toString(36).slice(2, 10);
}

export function useNodeState() {
    const [config, setConfig] = useState<NodeConfig>(() => {
        try {
            const s = localStorage.getItem('worm_node_config');
            return s ? JSON.parse(s) : { identity: '', tier: 'SEEDLING', storageGB: 1, autoReconnect: true, posEnabled: true, relayEnabled: true };
        } catch { return { identity: '', tier: 'SEEDLING', storageGB: 1, autoReconnect: true, posEnabled: true, relayEnabled: true }; }
    });

    const [connStatus, _setConnStatus] = useState<ConnStatus>('disconnected');
    const setConnStatus = useCallback((s: ConnStatus) => {
        connStatusRef.current = s;
        _setConnStatus(s);
    }, []);
    const [nodeActive, _setNodeActive] = useState(false);
    const setNodeActive = useCallback((v: boolean) => {
        nodeActiveRef.current = v;
        _setNodeActive(v);
    }, []);
    const [wmtBalance, setWmtBalance] = useState(0);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [rewards, setRewards] = useState<RewardEvent[]>(() => {
        try { return JSON.parse(localStorage.getItem('worm_rewards') || '[]'); } catch { return []; }
    });
    const [posChallenges, _setPosChallenges] = useState<PosChallenge[]>(() => {
        try { return JSON.parse(localStorage.getItem('worm_pos_history') || '[]'); } catch { return []; }
    });
    // Wrap setter to also persist to localStorage
    const setPosChallenges = useCallback((updater: PosChallenge[] | ((prev: PosChallenge[]) => PosChallenge[])) => {
        _setPosChallenges(prev => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            try { localStorage.setItem('worm_pos_history', JSON.stringify(next.slice(0, 50))); } catch { }
            return next;
        });
    }, []);
    const [chainState, setChainState] = useState<ChainState>({
        height: 0, lastHash: '', totalTxs: 0,
        validators: [], validatorThreshold: 1,
        recentBlocks: [], isValidator: false
    });
    const [stats, setStats] = useState<NodeStats>(() => {
        try {
            const saved = JSON.parse(localStorage.getItem('worm_pos_stats') || 'null');
            if (saved) return { ...saved, sessionStarted: 0 }; // sessionStarted은 매번 새로 시작
        } catch { }
        return {
            chunksStored: 0, storageUsedMB: 0, relayRewardCount: 0,
            posSuccessCount: 0, posFailCount: 0, totalEarned: 0,
            sessionStarted: 0, relaysRelayed: 0
        };
    });


    const [keypair, _setKeypair] = useState<KeyPairBundle | null>(null);
    const keypairRef = useRef<KeyPairBundle | null>(null);

    const setKeypair = useCallback((kp: KeyPairBundle) => {
        keypairRef.current = kp;
        _setKeypair(kp);
    }, []);

    // ── stats가 바뀔 때마다 localStorage에 자동 저장 ──
    useEffect(() => {
        try {
            const { sessionStarted: _, ...toSave } = stats; // sessionStarted 제외
            localStorage.setItem('worm_pos_stats', JSON.stringify(toSave));
        } catch { }
    }, [stats]);

    // ── rewards가 바뀔 때마다 localStorage에 자동 저장 ──
    useEffect(() => {
        try {
            localStorage.setItem('worm_rewards', JSON.stringify(rewards.slice(0, 100)));
        } catch { }
    }, [rewards]);

    const relayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const posTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const chainTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const balanceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // ref to always read current connStatus inside setInterval callbacks (avoids stale closure)
    const connStatusRef = useRef<ConnStatus>('disconnected');
    const nodeActiveRef = useRef<boolean>(false);


    const addLog = useCallback((icon: string, msg: string, type: LogEntry['type'] = 'default') => {
        setLogs(prev => [{
            id: genId(), time: nowStr(), icon, msg, type
        }, ...prev].slice(0, 200));
    }, []);

    const saveConfig = useCallback((cfg: NodeConfig) => {
        setConfig(cfg);
        localStorage.setItem('worm_node_config', JSON.stringify(cfg));
    }, []);

    // ── Fetch balance from server chain ─────────────────────────────
    const fetchBalance = useCallback(async () => {
        if (!config.identity) return;
        try {
            const res = await fetch(`${SERVER_URL}/api/chain/balance/${encodeURIComponent(config.identity)}`);
            if (res.ok) {
                const { balance } = await res.json();
                setWmtBalance(balance || 0);
                // Parse chain txs for rewards
                const txRes = await fetch(`${SERVER_URL}/api/chain/blocks?from=0&limit=500`);
                if (txRes.ok) {
                    const { blocks } = await txRes.json();
                    const myId = config.identity.toLowerCase();
                    const rewardTxs: RewardEvent[] = [];
                    for (const block of (blocks || [])) {
                        for (const tx of (block.transactions || [])) {
                            if ((tx.to === myId) && (tx.type === 'REWARD_BATCH' || tx.type === 'GENESIS_AIRDROP' || tx.type === 'RELAY_REWARD' || tx.type === 'STORAGE_REWARD') && tx.amount > 0) {
                                rewardTxs.push({ id: tx.txId, type: tx.type, amount: tx.amount, timestamp: tx.timestamp, txId: tx.txId });
                            }
                        }
                    }
                    rewardTxs.sort((a, b) => b.timestamp - a.timestamp);
                    setRewards(rewardTxs.slice(0, 50));
                    const total = rewardTxs.reduce((s, r) => s + r.amount, 0);
                    setStats(prev => ({ ...prev, totalEarned: total }));
                }
            }
        } catch { /* silent */ }
    }, [config.identity]);

    // ── Fetch chain / validator state ────────────────────────────────
    const fetchChainState = useCallback(async () => {
        try {
            const [explorerRes, validatorRes] = await Promise.all([
                fetch(`${SERVER_URL}/api/chain/explorer`),
                fetch(`${SERVER_URL}/api/validator/list`)
            ]);
            if (explorerRes.ok) {
                const data = await explorerRes.json();
                const recentBlocks: ChainBlock[] = (data.recentBlocks || []).map((b: any) => ({
                    index: b.index,
                    hash: typeof b.hash === 'string' ? b.hash.replace('...', '') : b.hash,
                    validator: b.validator,
                    txCount: b.txCount,
                    timestamp: b.timestamp
                }));
                setChainState(prev => ({
                    ...prev,
                    height: data.height || 0,
                    lastHash: data.lastBlockHash || '',
                    totalTxs: data.totalTransactions || 0,
                    recentBlocks
                }));
            }
            if (validatorRes.ok) {
                const vdata = await validatorRes.json();
                const validators: string[] = vdata.validators || [];
                const myId = config.identity.toLowerCase();
                setChainState(prev => ({
                    ...prev,
                    validators,
                    validatorThreshold: vdata.threshold || 1,
                    isValidator: validators.includes(myId) && myId !== '__server__'
                }));
            }
        } catch { /* silent */ }
    }, [config.identity]);

    // ── Balance polling ──────────────────────────────────────────────
    // Refresh every 15s when node active, every 30s when idle
    useEffect(() => {
        if (!config.identity) return;
        fetchBalance(); // immediate on identity change

        const interval = setInterval(fetchBalance, nodeActive ? 15_000 : 30_000);
        return () => clearInterval(interval);
    }, [config.identity, nodeActive, fetchBalance]);

    // ── Test server connection ───────────────────────────────────────
    const testConnection = useCallback(async (): Promise<boolean> => {
        setConnStatus('connecting');
        addLog('🔌', 'Connecting to WORM Protocol server...', 'info');
        try {
            const res = await fetch(`${SERVER_URL}/health`, { signal: AbortSignal.timeout(8000) });
            if (res.ok) {
                setConnStatus('connected');
                addLog('✅', `Connected to ${SERVER_URL}`, 'success');
                return true;
            }
        } catch {/* */ }
        setConnStatus('error');
        addLog('❌', 'Server connection failed', 'error');
        if (config.autoReconnect && nodeActive) scheduleReconnect();
        return false;
    }, [config.autoReconnect, nodeActive, addLog]);

    const scheduleReconnect = useCallback(() => {
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        addLog('🔄', 'Auto-reconnect in 15s...', 'warn');
        reconnectTimerRef.current = setTimeout(() => testConnection(), 15000);
    }, [addLog, testConnection]);

    // ── Relay reward loop (every 5 min + jitter) ─────────────────────
    const doRelayReward = useCallback(async () => {
        if (!config.identity || !config.relayEnabled || connStatusRef.current !== 'connected') return;
        addLog('📡', 'Requesting relay reward...', 'info');
        try {
            const res = await fetch(`${SERVER_URL}/api/relay-reward`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identity: config.identity })
            });
            const data = await res.json();
            if (data.success && data.rewarded) {
                addLog('💰', `Relay reward: +${data.amount} WMT (auto-approved)`, 'reward');
                setStats(prev => ({ ...prev, relayRewardCount: prev.relayRewardCount + 1 }));
                fetchBalance();
            } else if (data.success && data.proposalId) {
                addLog('🗳️', `Relay proposal ${data.proposalId.slice(0, 12)}… — awaiting multi-sig`, 'info');
                setStats(prev => ({ ...prev, relayRewardCount: prev.relayRewardCount + 1 }));
            } else if (data.error?.includes('Cooldown')) {
                addLog('⏳', `Relay cooldown: ${data.error}`, 'warn');
            } else {
                addLog('⚠️', `Relay reward: ${data.error || 'unknown'}`, 'warn');
            }
        } catch (e) {
            addLog('❌', 'Relay reward request failed', 'error');
            if (config.autoReconnect) scheduleReconnect();
        }
    }, [config.identity, config.relayEnabled, config.autoReconnect, connStatus, addLog, fetchBalance, scheduleReconnect]);

    // ── Local chunk cache (Native Filesystem via Tauri) ───────────────
    // 청크는 실제 파일로 저장: ~/Library/Application Support/WORM Node/chunks/
    // 메모리 맵은 빠른 접근을 위한 캐시
    const localChunkCache = useRef<Map<string, Uint8Array>>(new Map());

    const downloadAndCacheChunk = useCallback(async (cid: string): Promise<Uint8Array | null> => {
        // 1. 메모리 캐시 체크
        if (localChunkCache.current.has(cid)) return localChunkCache.current.get(cid)!;

        // 2. 네이티브 파일에서 읽기 (Tauri)
        if (NativeChunkStore.isTauriEnv()) {
            const saved = await NativeChunkStore.loadChunk(cid);
            if (saved) {
                localChunkCache.current.set(cid, saved);
                return saved;
            }
        }

        // 3. 서버에서 다운로드
        const res = await fetch(`${SERVER_URL}/api/wsn/chunk/${cid}`);
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        const arr = new Uint8Array(buf);

        // 4. 네이티브 파일로 저장 (Tauri)
        if (NativeChunkStore.isTauriEnv()) {
            const result = await NativeChunkStore.saveChunk(cid, arr).catch(() => null);
            if (result?.saved) {
                addLog('📁', `Chunk saved to disk: ${cid.slice(0, 12)}…`, 'info');
            }
        }

        localChunkCache.current.set(cid, arr);
        return arr;
    }, [addLog]);

    // ── PoS challenge/proof loop ─────────────────────────
    // Flow: get chunk list → download & pin locally → request challenge
    //       → server asks for random bytes → read from local cache → submit hex → reward
    const doPosChallenge = useCallback(async () => {
        if (!config.identity || !config.posEnabled || connStatusRef.current !== 'connected') return;
        try {
            const chunksRes = await fetch(`${SERVER_URL}/api/wsn/chunks`);
            if (!chunksRes.ok) return;
            const { cids } = await chunksRes.json() as { cids: string[] };
            if (!cids || cids.length === 0) {
                addLog('📦', 'No chunks available for PoS challenge', 'warn');
                return;
            }
            addLog('📁', `PoS: requesting challenge (${cids.length} chunks available)`, 'info');
            const selectedCids = cids.slice(0, Math.min(5, cids.length));
            // 2. Pin any new chunks we don't have
            let newlyPinned = 0;
            for (const cid of cids.slice(0, 3)) {
                if (!localChunkCache.current.has(cid)) {
                    const arr = await downloadAndCacheChunk(cid);
                    if (arr) newlyPinned++;
                }
            }
            if (newlyPinned > 0) addLog('📥', `Pinned ${newlyPinned} new chunk(s) to disk`, 'info');

            // 3. Pick one of our locally stored chunks to prove
            const ourCids = cids.filter((c: string) => localChunkCache.current.has(c));
            if (ourCids.length === 0) {
                addLog('⏳', 'Downloading chunks… PoS will run next cycle', 'info');
                return;
            }
            const targetCid = ourCids[Math.floor(Math.random() * ourCids.length)];

            // 4. Sync disk count → stats
            const diskCount = NativeChunkStore.isTauriEnv()
                ? await NativeChunkStore.countChunks().catch(() => localChunkCache.current.size)
                : localChunkCache.current.size;
            const diskStats = NativeChunkStore.isTauriEnv()
                ? await NativeChunkStore.getStorageStats().catch(() => null)
                : null;

            setStats(prev => ({
                ...prev,
                chunksStored: diskCount,
                storageUsedMB: diskStats
                    ? diskStats.totalBytes / (1024 * 1024)
                    : [...localChunkCache.current.values()].reduce((s, a) => s + a.byteLength, 0) / (1024 * 1024)
            }));
            addLog('📁', `PoS: proving chunk ${targetCid.slice(0, 12)}… (${diskCount} stored on disk)`, 'info');

            // 4. Request challenge from server for this specific chunk
            const challengeRes = await fetch(`${SERVER_URL}/api/storage/challenge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identity: config.identity, cid: targetCid })
            });
            if (!challengeRes.ok) {
                const err = await challengeRes.json().catch(() => ({})) as any;
                addLog('⚠️', `PoS challenge: ${err.error || challengeRes.status}`, 'warn');
                return;
            }
            const { challengeId, cid: challengedCid, offset, length } =
                await challengeRes.json() as { challengeId: string; cid: string; offset: number; length: number };

            const challengeEntry: PosChallenge = {
                id: challengeId, cid: challengedCid, status: 'proving', timestamp: Date.now()
            };
            setPosChallenges(prev => [challengeEntry, ...prev].slice(0, 50));
            addLog('⚡', `Challenge: bytes[${offset}..${offset + length}] of ${challengedCid.slice(0, 12)}…`, 'info');

            // 5. Read exact bytes from LOCAL cache — no downloading allowed!
            const localData = localChunkCache.current.get(challengedCid);
            if (!localData || localData.length < offset + length) {
                setPosChallenges(prev => prev.map(c => c.id === challengeId ? { ...c, status: 'failed' } : c));
                setStats(prev => ({ ...prev, posFailCount: prev.posFailCount + 1 }));
                addLog('❌', '❌ PoS FAIL: chunk missing from local storage — no reward!', 'error');
                return;
            }

            // 6. Encode as hex and submit
            const proofBytes = localData.slice(offset, offset + length);
            const proofHex = Array.from(proofBytes).map(b => b.toString(16).padStart(2, '0')).join('');

            const proofRes = await fetch(`${SERVER_URL}/api/storage/proof`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identity: config.identity, challengeId, proofHex })
            });
            const proofData = await proofRes.json() as any;

            // Server sends: { success, verified, amount, message } on success (200)
            //               { success:false, verified:true, error:"...Wait Ns..." } on cooldown (429)
            //               { success:false, verified:false, error: "..." } on fail (200)
            if (proofData.verified && proofData.amount) {
                // Full reward granted
                setPosChallenges(prev => prev.map(c => c.id === challengeId ? { ...c, status: 'success', rewardEarned: proofData.amount } : c));
                setStats(prev => ({ ...prev, posSuccessCount: prev.posSuccessCount + 1 }));
                addLog('🏆', `PoS verified! +${proofData.amount} WMT (×${proofData.multiplier ?? 1} stake)`, 'reward');
                fetchBalance();
            } else if (proofData.verified) {
                // Proof correct but on cooldown (HTTP 429 or verified=true without amount)
                const waitMatch = proofData.error?.match(/Wait (\d+)s/);
                const waitSec = waitMatch ? waitMatch[1] : '?';
                setPosChallenges(prev => prev.map(c => c.id === challengeId ? { ...c, status: 'success' } : c));
                setStats(prev => ({ ...prev, posSuccessCount: prev.posSuccessCount + 1 }));
                addLog('✅', `PoS verified — cooldown ${waitSec}s remaining`, 'success');
            } else {
                setPosChallenges(prev => prev.map(c => c.id === challengeId ? { ...c, status: 'failed' } : c));
                setStats(prev => ({ ...prev, posFailCount: prev.posFailCount + 1 }));
                addLog('❌', `PoS rejected: ${proofData.error || 'incorrect bytes'}`, 'error');
            }
        } catch (e) {
            addLog('❌', 'PoS cycle error: ' + String(e).slice(0, 80), 'error');
        }
    }, [config.identity, config.posEnabled, connStatus, addLog, fetchBalance, downloadAndCacheChunk]);

    // ── Start node ───────────────────────────────────────────────────
    const startNode = useCallback(async () => {
        if (!config.identity) return;
        const ok = await testConnection();
        if (!ok) return;
        setNodeActive(true);
        setStats(prev => ({ ...prev, sessionStarted: Date.now() }));
        addLog('🚀', `Node started | identity: ${config.identity} | tier: ${config.tier}`, 'success');
        fetchBalance();
        fetchChainState();

        // ── 앱 시작 시 즉시 디스크에서 청크 수 읽어 UI 반영 ──
        if (NativeChunkStore.isTauriEnv()) {
            NativeChunkStore.getStorageStats().then(diskStats => {
                if (diskStats.count > 0) {
                    setStats(prev => ({
                        ...prev,
                        chunksStored: diskStats.count,
                        storageUsedMB: diskStats.totalBytes / (1024 * 1024)
                    }));
                    addLog('💾', `Loaded ${diskStats.count} chunk(s) from disk (${(diskStats.totalBytes / (1024 * 1024)).toFixed(1)} MB)`, 'info');
                    // 메모리 캐시에도 프리로드 (첫 PoS 즉시 응답 가능하도록)
                    NativeChunkStore.listChunkCIDs().then(async cids => {
                        for (const cid of cids.slice(0, 10)) { // 최대 10개만 프리로드
                            if (!localChunkCache.current.has(cid)) {
                                const data = await NativeChunkStore.loadChunk(cid);
                                if (data) localChunkCache.current.set(cid, data);
                            }
                        }
                    }).catch(() => { });
                }
            }).catch(() => { });
        }

        // Relay reward: every 5 min + 30s jitter
        doRelayReward();
        relayTimerRef.current = setInterval(() => doRelayReward(), 5 * 60 * 1000 + Math.random() * 30000);

        // PoS: every 6 min + jitter (offset from relay)
        setTimeout(() => {
            doPosChallenge();
            posTimerRef.current = setInterval(() => doPosChallenge(), 6 * 60 * 1000 + Math.random() * 30000);
        }, 45000);

        // Chain state: every 30s
        chainTimerRef.current = setInterval(() => fetchChainState(), 30000);

        // Balance: every 60s
        balanceTimerRef.current = setInterval(() => fetchBalance(), 60000);
    }, [config, testConnection, addLog, fetchBalance, fetchChainState, doRelayReward, doPosChallenge]);

    // ── Stop node ────────────────────────────────────────────────────
    const stopNode = useCallback(() => {
        [relayTimerRef, posTimerRef, chainTimerRef, balanceTimerRef].forEach(ref => {
            if (ref.current) { clearInterval(ref.current as any); ref.current = null; }
        });
        if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
        setNodeActive(false);
        setConnStatus('disconnected');
        addLog('⏹️', 'Node stopped by user', 'warn');
    }, [addLog]);

    // ── Cleanup ───────────────────────────────────────────────────────
    useEffect(() => () => {
        [relayTimerRef, posTimerRef, chainTimerRef, balanceTimerRef].forEach(ref => {
            if (ref.current) clearInterval(ref.current as any);
        });
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    }, []);

    return {
        config, saveConfig,
        connStatus, nodeActive,
        wmtBalance,
        logs, rewards, posChallenges,
        chainState, stats,
        startNode, stopNode,
        testConnection,
        fetchBalance, fetchChainState,
        setKeypair
    };
}
