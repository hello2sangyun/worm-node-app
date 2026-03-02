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
const MAX_CHUNKS_PER_CYCLE = 10;              // 한 사이클에 최대 10개

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
     * [V59] Idle Sync Daemon
     * 3분마다 서버의 전체 청크 목록을 조회하고, 내가 없는 청크를 최대 10개씩 자동으로 당겨옴.
     * 노드가 대기 중일 때 자연스럽게 청크 수와 보상 기회를 늘립니다.
     */
    private startIdleSync(): void {
        const runSync = async () => {
            try {
                // 1. 서버 전체 청크 목록 조회
                const res = await fetch(`${SERVER_URL}/api/wsn/chunks`);
                if (!res.ok) return;
                const data = await res.json();
                const serverCids: string[] = data.cids || [];
                if (serverCids.length === 0) return;

                // 2. 내 로컬 CID와 비교 → 누락 목록
                const localCids = new Set(await NativeChunkStore.listChunkCIDs());
                const missing = serverCids.filter(cid => !localCids.has(cid));

                if (missing.length === 0) {
                    console.log('[IDLE-SYNC] Up to date — no missing chunks.');
                    return;
                }

                // 3. 무작위로 최대 10개 선택해서 Pull
                const toPull = missing.sort(() => Math.random() - 0.5).slice(0, MAX_CHUNKS_PER_CYCLE);
                this.onLog('🔄', `Idle Sync: ${missing.length} missing — pulling ${toPull.length}…`, 'info');

                let pulled = 0;
                for (const cid of toPull) {
                    try {
                        const chunkRes = await fetch(`${SERVER_URL}/api/wsn/chunk/${encodeURIComponent(cid)}`);
                        if (!chunkRes.ok) continue;
                        const buf = await chunkRes.arrayBuffer();
                        if (buf.byteLength === 0) continue;

                        const { saved } = await NativeChunkStore.saveChunk(cid, new Uint8Array(buf));
                        if (saved) {
                            pulled++;
                            this.syncedCount++;
                        }
                        // 요청 버스트 방지
                        await new Promise(r => setTimeout(r, 200));
                    } catch (_) { /* 실패 시 다음 사이클에 재시도 */ }
                }

                if (pulled > 0) {
                    this.onLog('✅', `Idle Sync: +${pulled} chunks saved (session: ${this.syncedCount} total)`, 'success');
                    // 새 CID 서버에 다시 등록
                    await this.registerCIDs();
                    // [V59] UI 즉시 갱신 콜백
                    if (this.onChunksSynced) {
                        const newStats = await NativeChunkStore.getStorageStats().catch(() => null);
                        if (newStats) {
                            this.onChunksSynced(newStats.count, newStats.totalBytes / (1024 * 1024));
                        }
                    }
                }
            } catch (e) {
                console.warn('[IDLE-SYNC] Sync cycle error:', e);
            }
        };

        // 1분 후 첫 실행 (노드 안정화 대기), 이후 3분마다
        this.idleSyncFirstRun = setTimeout(runSync, 60 * 1000);
        this.idleSyncTimer = setInterval(runSync, IDLE_SYNC_INTERVAL_MS);
        this.onLog('🟢', 'Idle Sync started (3min interval, max 10 chunks/cycle)', 'info');
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
