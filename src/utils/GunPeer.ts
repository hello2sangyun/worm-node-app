/**
 * GunPeer.ts — WORM Node 앱의 GunDB 피어 모듈
 *
 * Storage Node가 활성화될 때 이 모듈이 GunDB 피어로 참여해
 * Railway 서버와 데이터를 동기화하고 노드의 로컬 하드웨어에
 * worm-profiles-v9, worm-messages-v9 등의 데이터를 영구 저장합니다.
 */

import Gun from 'gun/gun';
import 'gun/lib/radix';
import 'gun/lib/radisk';
import 'gun/lib/store';
import 'gun/lib/rindexed';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'https://worm-protocol-production.up.railway.app';
const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'https://worm-protocol-bridge-production.up.railway.app';

let gunInstance: any = null;
let isActive = false;

/** 현재 Gun 인스턴스 반환 (NodeProviderClient에서 사용) */
export function getGunInstance(): any {
    return gunInstance;
}

export interface GunPeerStats {
    isActive: boolean;
    connectedPeers: number;
    storedKeys: number;
}

// ── Peer profile data (for network monitor panel) ───────────────
export interface PeerProfile {
    id: string;            // colon-safe WNS name (e.g. "stan:wormit")
    displayName: string;
    wnsName: string;       // dot format: "stan.wormit"
    avatarUrl: string;
    plan: string;
    friendCount: number;
    msgCount: number;
    lastSeen: number;      // epoch ms when we first/last observed this peer
    socketId?: string;     // from WNS record
    dataBytes: number;     // rough size of profile data downloaded
}

// Map from wns name -> profile (updated in real-time by subscribeToProfiles)
const peerProfiles = new Map<string, PeerProfile>();
let profileListeners: ((profiles: PeerProfile[]) => void)[] = [];

function notifyListeners() {
    const list = Array.from(peerProfiles.values())
        .sort((a, b) => b.lastSeen - a.lastSeen)
        .slice(0, 50);
    profileListeners.forEach(fn => fn(list));
}

/** Subscribe to real-time peer profile updates */
export function subscribeToProfiles(listener: (profiles: PeerProfile[]) => void): () => void {
    profileListeners.push(listener);
    // Immediately emit current known profiles
    listener(Array.from(peerProfiles.values()).sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 50));
    return () => {
        profileListeners = profileListeners.filter(l => l !== listener);
    };
}

/** Get current snapshot of peer profiles */
export function getPeerProfiles(): PeerProfile[] {
    return Array.from(peerProfiles.values()).sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 50);
}

function parseProfile(id: string, data: any): PeerProfile {
    const wnsName = id.replace(/:/g, '.');
    const existing = peerProfiles.get(id) || {
        id, wnsName,
        displayName: wnsName,
        avatarUrl: '',
        plan: 'FREE',
        friendCount: 0,
        msgCount: 0,
        lastSeen: Date.now(),
        socketId: undefined,
        dataBytes: 0,
    };

    // Try to estimate data size
    let dataBytes = 0;
    try { dataBytes = JSON.stringify(data).length; } catch { }

    return {
        ...existing,
        displayName: data.displayName || data.name || data.publicName || wnsName,
        avatarUrl: data.avatarUrl || data.avatar || data.profileImage || '',
        plan: data.plan || data.tier || 'FREE',
        friendCount: typeof data.friendCount === 'number' ? data.friendCount : (existing.friendCount),
        lastSeen: Date.now(),
        dataBytes: Math.max(existing.dataBytes, dataBytes),
    };
}

/**
 * GunDB 피어 시작 — Storage Node 활성화 시 호출
 */
export async function startGunPeer(onStats?: (stats: GunPeerStats) => void): Promise<void> {
    if (isActive && gunInstance) {
        console.log('[GUN-PEER] Already running.');
        return;
    }

    console.log('[GUN-PEER] 🚀 Starting GunDB peer (Storage Node mode)...');

    gunInstance = Gun({
        peers: [
            `${SERVER_URL}/gun`,
            `${BRIDGE_URL}/gun`,
        ],
        localStorage: false,
        radisk: true,
        axe: false,
    });

    isActive = true;
    let connectedPeers = 0;

    gunInstance.on('hi', (peer: any) => {
        connectedPeers++;
        console.log(`[GUN-PEER] ✅ Connected to peer: ${peer.url}`);
        onStats?.({ isActive, connectedPeers, storedKeys: 0 });
    });

    gunInstance.on('bye', (peer: any) => {
        connectedPeers = Math.max(0, connectedPeers - 1);
        console.log(`[GUN-PEER] ❌ Disconnected from peer: ${peer.url}`);
        onStats?.({ isActive, connectedPeers, storedKeys: 0 });
    });

    // ── Subscribe to profile data for network monitor ─────────────
    gunInstance.get('worm-profiles-v9').map().on((data: any, id: string) => {
        if (!data || !id || id === '_' || id.startsWith('~')) return;
        if (typeof data !== 'object') return;
        const profile = parseProfile(id, data);
        peerProfiles.set(id, profile);
        notifyListeners();
    });

    // ── Subscribe to WNS for socketId and key info ─────────────────
    gunInstance.get('worm-wns-v9').map().on((data: any, id: string) => {
        if (!data || !id || id === '_' || id.startsWith('~')) return;
        if (typeof data !== 'object') return;
        const existing = peerProfiles.get(id);
        const wnsName = id.replace(/:/g, '.');
        peerProfiles.set(id, {
            id,
            wnsName,
            displayName: existing?.displayName || wnsName,
            avatarUrl: existing?.avatarUrl || '',
            plan: existing?.plan || 'FREE',
            friendCount: existing?.friendCount || 0,
            msgCount: existing?.msgCount || 0,
            lastSeen: Date.now(),
            socketId: data.socketId || existing?.socketId,
            dataBytes: (existing?.dataBytes || 0) + (typeof data === 'object' ? JSON.stringify(data).length : 0),
        });
        notifyListeners();
    });

    // ── Subscribe to messages to count per-identity msg volume ─────
    gunInstance.get('worm-messages-v9').map().on((data: any, id: string) => {
        if (!data || !id || id === '_' || id.startsWith('~')) return;
        // id is the inbox owner, count sub-keys
        if (typeof data === 'object' && data !== null) {
            const msgCount = Object.keys(data).filter(k => k !== '_').length;
            const existing = peerProfiles.get(id);
            if (existing && msgCount > existing.msgCount) {
                peerProfiles.set(id, { ...existing, msgCount, lastSeen: Date.now() });
                notifyListeners();
            }
        }
    });

    // ── Periodic sync ───────────────────────────────────────────────
    const sync = () => {
        if (!isActive || !gunInstance) return;
        gunInstance.get('worm-profiles-v9').map().once(() => { });
        gunInstance.get('worm-messages-v9').map().once(() => { });
        gunInstance.get('worm-wns-v9').map().once(() => { });
        gunInstance.get('worm-chain-v1').map().once(() => { });
    };

    setTimeout(sync, 3000);
    const syncInterval = setInterval(() => {
        if (!isActive) { clearInterval(syncInterval); return; }
        sync();
        console.log('[GUN-PEER] 🔄 Periodic sync triggered');
    }, 5 * 60 * 1000);

    console.log('[GUN-PEER] ✅ GunDB peer running. Syncing with Railway server...');
}

/**
 * GunDB 피어 중지 — Storage Node 비활성화 시 호출
 */
export function stopGunPeer(): void {
    if (!isActive || !gunInstance) return;

    console.log('[GUN-PEER] 🛑 Stopping GunDB peer...');
    isActive = false;

    try { gunInstance.off(); } catch (e) { }

    gunInstance = null;
    console.log('[GUN-PEER] Stopped.');
}

/**
 * 현재 상태 반환
 */
export function getGunPeerStatus(): GunPeerStats {
    return { isActive, connectedPeers: 0, storedKeys: 0 };
}



