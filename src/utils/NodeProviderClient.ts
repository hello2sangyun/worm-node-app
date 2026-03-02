/**
 * NodeProviderClient — WORM Node P2P Storage Provider
 *
 * 역할:
 *  1. Socket.IO 로 서버에 연결
 *  2. 내 로컬 디스크 CID 목록을 서버에 등록 (나는 이 chunks를 서빙할 수 있다)
 *  3. 서버가 'wsn-serve-chunk' 이벤트로 chunk 요청 → 로컬 디스크에서 읽어 응답
 *  4. 30분마다 CID 목록 갱신 + heartbeat
 *
 * 이걸 통해:
 *  누군가 이메일에 파일 첨부 → 서버가 내 노드에 chunk 요청 → 내 하드디스크에서 서빙
 */

import { io as socketIO, Socket } from 'socket.io-client';
import * as NativeChunkStore from './NativeChunkStore';

export const SERVER_URL = 'https://worm-protocol-production.up.railway.app';

export class NodeProviderClient {
    private socket: Socket | null = null;
    private identity: string;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private refreshTimer: ReturnType<typeof setInterval> | null = null;
    private servedCount = 0;         // 이 세션에서 서빙한 횟수
    private onLog: (icon: string, msg: string, type?: 'success' | 'error' | 'warn' | 'info' | 'reward' | 'default') => void;

    constructor(identity: string, onLog: (icon: string, msg: string, type?: 'success' | 'error' | 'warn' | 'info' | 'reward' | 'default') => void) {
        this.identity = identity;
        this.onLog = onLog;
    }

    async start(): Promise<void> {
        if (this.socket?.connected) return;

        this.socket = socketIO(SERVER_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 5000,
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

        // 서버가 chunk 요청할 때 — 핵심!
        this.socket.on('wsn-serve-chunk', async ({ cid }: { cid: string }, callback: Function) => {
            try {
                const data = await NativeChunkStore.loadChunk(cid);
                if (!data) {
                    callback({ error: 'Chunk not found on this node' });
                    return;
                }
                // Uint8Array → base64
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
                const cidCount = 0; // 가벼운 heartbeat
                this.socket.emit('wsn-provider-heartbeat', { identity: this.identity, cidCount });
            }
        }, 60 * 1000);
    }

    async registerCIDs(): Promise<void> {
        if (!this.socket?.connected) return;
        try {
            const cids = await NativeChunkStore.listChunkCIDs();
            if (cids.length === 0) {
                this.onLog('📦', 'No chunks to announce yet', 'info');
                return;
            }
            this.socket.emit('wsn-register-provider', {
                identity: this.identity,
                cids
            });
            this.onLog('📡', `Announcing ${cids.length} chunks to network…`, 'info');
        } catch (e) {
            console.warn('[NodeProvider] registerCIDs error:', e);
        }
    }

    getServedCount(): number { return this.servedCount; }

    stop(): void {
        if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
        if (this.refreshTimer) { clearInterval(this.refreshTimer); this.refreshTimer = null; }
        if (this.socket) { this.socket.disconnect(); this.socket = null; }
        this.onLog('⏹️', 'Node Provider stopped', 'warn');
    }

    private uint8ToBase64(data: Uint8Array): string {
        let binary = '';
        const len = data.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(data[i]);
        }
        return btoa(binary);
    }
}
