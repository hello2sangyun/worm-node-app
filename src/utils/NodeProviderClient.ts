/**
 * NodeProviderClient — WORM Node P2P Storage Provider
 *
 * 역할:
 *  1. Socket.IO 로 서버에 연결
 *  2. 내 로컬 디스크 CID 목록을 서버에 등록 (나는 이 chunks를 서빙할 수 있다)
 *  3. 서버가 'wsn-serve-chunk' 이벤트로 chunk 요청 → 로컬 디스크에서 읽어 응답
 *  4. 30분마다 CID 목록 갱신 + heartbeat
 *  5. [V59] 3분마다 서버 청크 목록과 비교해 누락 청크 자동 수신 (Idle Sync)
 */

import { io as socketIO, Socket } from 'socket.io-client';
import * as NativeChunkStore from './NativeChunkStore';

export const SERVER_URL = 'https://worm-protocol-production.up.railway.app';

const IDLE_SYNC_INTERVAL_MS = 3 * 60 * 1000; // 3분
const NUM_SLOTS = 10;   // 총 슬롯 수 (노드들이 나눠 담당)
const REPLICA_SLOTS = 2; // 각 노드가 담당할 슬롯 수 (10분의 2 = 약 20% 저장)

/**
 * 문자열을 0~(range-1) 사이 슬롯으로 해시 (간단한 djb2 변형)
 */
function hashToSlot(str: string, range: number): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
        hash = hash >>> 0; // unsigned 32bit
    }
    return hash % range;
}

export class NodeProviderClient {
    private socket: Socket | null = null;
    private identity: string;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private refreshTimer: ReturnType<typeof setInterval> | null = null;
    private idleSyncTimer: ReturnType<typeof setInterval> | null = null;
    private idleSyncFirstRun: ReturnType<typeof setTimeout> | null = null;
    private servedCount = 0;
    private syncedCount = 0;
    private onLog: (icon: string, msg: string, type?: 'success' | 'error' | 'warn' | 'info' | 'reward' | 'default') => void;
    private onChunksSynced?: (count: number, totalMB: number) => void; // [V59] Live UI update callback

    constructor(
        identity: string,
        onLog: (icon: string, msg: string, type?: 'success' | 'error' | 'warn' | 'info' | 'reward' | 'default') => void,
        onChunksSynced?: (count: number, totalMB: number) => void
    ) {
        this.identity = identity;
        this.onLog = onLog;
        this.onChunksSynced = onChunksSynced;
    }

    async start(): Promise<void> {
        if (this.socket?.connected) return;

        this.socket = socketIO(SERVER_URL, {
            transports: ['polling', 'websocket'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 5000,
            reconnectionDelayMax: 60000,
            timeout: 20000,
        });

        this.socket.on('connect', async () => {
            this.onLog('🔗', `Node Provider connected (${this.socket!.id?.slice(0, 8)}…)`, 'success');
            // GunDB 참여 먼저 알림 (CID 없어도 Gun 데이터 서빙 가능)
            this.socket!.emit('gun-announce-node', { identity: this.identity });
            await this.registerCIDs();
        });

        this.socket.on('disconnect', () => {
            this.onLog('🔌', 'Node Provider disconnected from server', 'warn');
        });

        this.socket.on('connect_error', (e) => {
            console.warn('[NodeProvider] connect_error:', e.message);
        });

        this.socket.io.on('reconnect_failed', () => {
            this.onLog('⚠️', 'Node Provider: could not connect to server (will retry later)', 'warn');
        });

        // 서버가 chunk 요청할 때
        this.socket.on('wsn-serve-chunk', async ({ cid }: { cid: string }, callback: Function) => {
            try {
                const data = await NativeChunkStore.loadChunk(cid);
                if (!data) {
                    callback({ error: 'Chunk not found on this node' });
                    return;
                }
                const base64 = this.uint8ToBase64(data);
                this.servedCount++;
                this.onLog('📤', `Served chunk ${cid.slice(0, 12)}… to network (total: ${this.servedCount})`, 'success');
                callback({ data: base64, cid });
            } catch (e) {
                callback({ error: String(e) });
            }
        });

        // ── 서버가 GunDB 데이터를 요청할 때 (노드-퍼스트 구조) ────────────
        this.socket.on('gun-request-data', ({ gunPath, isCollection }: { gunPath: string, isCollection?: boolean }, callback: Function) => {
            try {
                // GunPeer.ts 의 gunInstance 를 lazy import 로 가져옴
                import('./GunPeer').then(({ getGunInstance }) => {
                    const gun = getGunInstance();
                    if (!gun) {
                        callback({ error: 'Gun not active on this node' });
                        return;
                    }

                    // gunPath: 'worm-profiles-v9/stan:wormit' (슬래시로 경로 분리)
                    const parts = gunPath.split('/');
                    let node = gun;
                    for (const part of parts) {
                        node = node.get(part);
                    }

                    let responded = false;
                    const timer = setTimeout(() => {
                        if (!responded) {
                            responded = true;
                            callback({ error: 'Gun data not found within timeout' });
                        }
                    }, 5000);

                    if (isCollection) {
                        // 콜렉션 (예: 메시지 목록) — .map().once()로 모든 하위 항목 수집
                        const items: Record<string, any> = {};
                        let collected = false;
                        node.map().once((data: any, key: string) => {
                            if (data && key !== '_') { items[key] = data; collected = true; }
                        });
                        setTimeout(() => {
                            if (responded) return;
                            responded = true;
                            clearTimeout(timer);
                            if (collected) {
                                this.onLog('🗄️', `Gun collection served: ${gunPath.slice(0, 30)}… (${Object.keys(items).length} items)`, 'success');
                                callback({ data: items });
                            } else {
                                callback({ error: 'No collection data' });
                            }
                        }, 3000);
                    } else {
                        node.once((data: any) => {
                            if (responded) return;
                            responded = true;
                            clearTimeout(timer);
                            if (data !== null && data !== undefined) {
                                this.onLog('🗄️', `Gun data served: ${gunPath.slice(0, 30)}… (node-first)`, 'success');
                                callback({ data });
                            } else {
                                callback({ error: 'No data at this Gun path' });
                            }
                        });
                    }
                }).catch(e => callback({ error: String(e) }));
            } catch (e) {
                callback({ error: String(e) });
            }
        });

        // ── 서버가 GunDB 쓰기를 요청할 때 (node-first write) ────────────────────
        this.socket.on('gun-write-data', ({ gunPath, value }: { gunPath: string, value: any }, callback: Function) => {
            try {
                import('./GunPeer').then(({ getGunInstance }) => {
                    const gun = getGunInstance();
                    if (!gun) { callback({ ok: false, error: 'Gun not active' }); return; }

                    const parts = gunPath.split('/');
                    let node: any = gun;
                    for (const part of parts) node = node.get(part);

                    let handled = false;
                    const timer = setTimeout(() => {
                        if (!handled) {
                            handled = true;
                            this.onLog('⚠️', `Gun write timeout (local saved): ${gunPath.slice(0, 30)}…`, 'warn');
                            callback({ ok: true, warn: 'timeout but locally stored' });
                        }
                    }, 4000);

                    node.put(value, (ack: any) => {
                        if (handled) return;
                        handled = true;
                        clearTimeout(timer);
                        if (ack && ack.err) {
                            callback({ ok: false, error: ack.err });
                        } else {
                            this.onLog('✏️', `Gun written: ${gunPath.slice(0, 40)}…`, 'success');
                            callback({ ok: true });
                        }
                    });
                }).catch(e => callback({ ok: false, error: String(e) }));
            } catch (e) {
                callback({ ok: false, error: String(e) });
            }
        });


        this.socket.on('wsn-provider-ack', ({ registered }: { registered: number }) => {
            this.onLog('✅', `Provider registered: ${registered} chunks announced to network`, 'info');
        });


        // 30분마다 CID 목록 갱신
        this.refreshTimer = setInterval(async () => {
            await this.registerCIDs();
        }, 30 * 60 * 1000);

        // 1분마다 heartbeat
        this.heartbeatTimer = setInterval(() => {
            if (this.socket?.connected) {
                this.socket.emit('wsn-provider-heartbeat', { identity: this.identity, cidCount: 0 });
            }
        }, 60 * 1000);

        // [V59] Idle Sync 데몬 시작
        this.startIdleSync();
    }

    async registerCIDs(): Promise<void> {
        if (!this.socket?.connected) return;
        try {
            const cids = await NativeChunkStore.listChunkCIDs();
            if (cids.length === 0) {
                this.onLog('📦', 'No chunks to announce yet', 'info');
                return;
            }
            this.socket.emit('wsn-register-provider', { identity: this.identity, cids });
            this.onLog('📡', `Announcing ${cids.length} chunks to network…`, 'info');
        } catch (e) {
            console.warn('[NodeProvider] registerCIDs error:', e);
        }
    }

    /**
     * [V59] Partial Replication Idle Sync Daemon
     *
     * 각 노드는 자신의 nodeId 해시 기반으로 "담당 슬롯"을 배정받습니다.
     * 서버의 청크 목록 중 자신의 슬롯에 해당하는 청크만 Pull해서 저장합니다.
     * (전체의 약 20%, REPLICA_SLOTS=2 / NUM_SLOTS=10)
     *
     * 서버는 항상 100% 백업을 유지하므로 다운로드 신뢰성은 보장됩니다.
     * 노드 수가 늘수록 네트워크 총 분산 용량이 자연스럽게 증가합니다.
     */
    private startIdleSync(): void {
        // 내 nodeId → 담당 슬롯 번호 계산 (고정, 재시작해도 동일)
        const mySlot = hashToSlot(this.identity, NUM_SLOTS);
        const mySlots = new Set<number>();
        for (let i = 0; i < REPLICA_SLOTS; i++) {
            mySlots.add((mySlot + i) % NUM_SLOTS);
        }
        this.onLog('📌', `Partial Sync slots: ${[...mySlots].join(', ')} / ${NUM_SLOTS} (담당 ~${Math.round(REPLICA_SLOTS / NUM_SLOTS * 100)}%)`, 'info');

        const runSync = async () => {
            try {
                // 1. 서버 전체 청크 목록 조회
                const res = await fetch(`${SERVER_URL}/api/wsn/chunks`);
                if (!res.ok) return;
                const data = await res.json();
                const serverCids: string[] = data.cids || [];
                if (serverCids.length === 0) return;

                // 2. 내 슬롯에 해당하는 CID만 필터링
                const myCids = serverCids.filter(cid => mySlots.has(hashToSlot(cid, NUM_SLOTS)));

                // 3. 이미 가진 것 제외
                const localCids = new Set(await NativeChunkStore.listChunkCIDs());
                const toPull = myCids.filter(cid => !localCids.has(cid));

                if (toPull.length === 0) {
                    console.log(`[IDLE-SYNC] Slot ${[...mySlots].join('/')} up to date (${myCids.length} assigned, ${localCids.size} stored).`);
                    return;
                }

                // 4. 최대 10개씩 Pull (부담 분산)
                const batch = toPull.slice(0, 10);
                this.onLog('🔄', `Partial Sync: pulling ${batch.length}/${toPull.length} assigned chunks (slot ${[...mySlots].join('/')})…`, 'info');

                let pulled = 0;
                for (const cid of batch) {
                    try {
                        const chunkRes = await fetch(`${SERVER_URL}/api/wsn/chunk/${encodeURIComponent(cid)}`);
                        if (!chunkRes.ok) continue;
                        const buf = await chunkRes.arrayBuffer();
                        if (buf.byteLength === 0) continue;

                        const { saved } = await NativeChunkStore.saveChunk(cid, new Uint8Array(buf));
                        if (saved) { pulled++; this.syncedCount++; }
                        await new Promise(r => setTimeout(r, 200));
                    } catch (_) { /* 실패 시 다음 사이클에 재시도 */ }
                }

                if (pulled > 0) {
                    this.onLog('✅', `Partial Sync: +${pulled} chunks (session: ${this.syncedCount})`, 'success');
                    await this.registerCIDs();
                    if (this.onChunksSynced) {
                        const newStats = await NativeChunkStore.getStorageStats().catch(() => null);
                        if (newStats) this.onChunksSynced(newStats.count, newStats.totalBytes / (1024 * 1024));
                    }
                }
            } catch (e) {
                console.warn('[IDLE-SYNC] Sync cycle error:', e);
            }
        };

        // 1분 후 첫 실행, 이후 3분마다
        this.idleSyncFirstRun = setTimeout(runSync, 60 * 1000);
        this.idleSyncTimer = setInterval(runSync, IDLE_SYNC_INTERVAL_MS);
        this.onLog('🟢', `Partial Sync daemon started (slots ${[...mySlots].join('/')}/${NUM_SLOTS}, ~${Math.round(REPLICA_SLOTS / NUM_SLOTS * 100)}% of chunks)`, 'info');
    }

    getServedCount(): number { return this.servedCount; }
    getSyncedCount(): number { return this.syncedCount; }

    stop(): void {
        if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
        if (this.refreshTimer) { clearInterval(this.refreshTimer); this.refreshTimer = null; }
        if (this.idleSyncTimer) { clearInterval(this.idleSyncTimer); this.idleSyncTimer = null; }
        if (this.idleSyncFirstRun) { clearTimeout(this.idleSyncFirstRun); this.idleSyncFirstRun = null; }
        if (this.socket) { this.socket.disconnect(); this.socket = null; }
        this.onLog('⏹️', 'Node Provider stopped', 'warn');
    }

    private uint8ToBase64(data: Uint8Array): string {
        let binary = '';
        for (let i = 0; i < data.byteLength; i++) {
            binary += String.fromCharCode(data[i]);
        }
        return btoa(binary);
    }
}
