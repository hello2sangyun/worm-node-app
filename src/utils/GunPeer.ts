/**
 * GunPeer.ts — WORM Node 앱의 GunDB 피어 모듈
 *
 * Storage Node가 활성화될 때 이 모듈이 GunDB 피어로 참여해
 * Railway 서버와 데이터를 동기화하고 노드의 로컬 하드웨어에
 * worm-profiles-v9, worm-messages-v9 등의 데이터를 영구 저장합니다.
 *
 * 저장 위치: localStorage (Tauri 앱의 앱 데이터 디렉토리 내)
 * → Tauri에서는 OS의 앱 데이터 폴더에 저장되므로 안전하고 영구적.
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

export interface GunPeerStats {
    isActive: boolean;
    connectedPeers: number;
    storedKeys: number;
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
            `${SERVER_URL}/gun`,   // Railway 메인 서버
            `${BRIDGE_URL}/gun`,   // Bridge 서버
        ],
        localStorage: false,       // 브라우저 localStorage 사용 안 함
        radisk: true,              // ✅ 노드 로컬 하드웨어에 RADisk 저장
        // Tauri 환경에서는 IndexedDB가 앱 데이터 폴더에 저장됨
        axe: false,                // AXE 비활성화 (노드간 최적화 프로토콜)
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

    // 주요 데이터 노드들을 구독해 자동 동기화 트리거
    const sync = () => {
        if (!isActive || !gunInstance) return;
        gunInstance.get('worm-profiles-v9').map().once(() => { });
        gunInstance.get('worm-messages-v9').map().once(() => { });
        gunInstance.get('worm-wns-v9').map().once(() => { });
        gunInstance.get('worm-chain-v1').map().once(() => { });
    };

    // 초기 동기화 실행
    setTimeout(sync, 3000);

    // 5분마다 동기화 갱신
    const syncInterval = setInterval(() => {
        if (!isActive) {
            clearInterval(syncInterval);
            return;
        }
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

    try {
        gunInstance.off();
    } catch (e) {
        // Gun cleanup might throw, ignorable
    }

    gunInstance = null;
    console.log('[GUN-PEER] Stopped.');
}

/**
 * 현재 상태 반환
 */
export function getGunPeerStatus(): GunPeerStats {
    return {
        isActive,
        connectedPeers: 0,
        storedKeys: 0,
    };
}
