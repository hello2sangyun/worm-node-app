/**
 * useNotifications — GunDB 메일 수신 감지 + Tauri OS 네이티브 알림
 * 
 * 감지 방식:
 *   1. GunDB `bridge_drops` 노드 구독 → 새 메일 패킷 감지
 *   2. 수신자(identity)에게 해당된 패킷인지 확인
 *   3. Tauri notification API로 OS 푸시 알림 발송
 */
import { useEffect, useRef, useCallback } from 'react';

// Tauri 알림 API (Tauri 환경에서만 동작, 브라우저에선 자동 폴백)
async function sendTauriNotification(title: string, body: string) {
    try {
        // @ts-ignore
        const { isPermissionGranted, requestPermission, sendNotification } = await import('@tauri-apps/api/notification');
        let permitted = await isPermissionGranted();
        if (!permitted) {
            const permission = await requestPermission();
            permitted = permission === 'granted';
        }
        if (permitted) {
            sendNotification({ title, body });
        }
    } catch {
        // 브라우저 환경 폴백: Web Notification API
        if ('Notification' in window) {
            if (Notification.permission === 'granted') {
                new Notification(title, { body, icon: '/icons/128x128.png' });
            } else if (Notification.permission !== 'denied') {
                const perm = await Notification.requestPermission();
                if (perm === 'granted') {
                    new Notification(title, { body, icon: '/icons/128x128.png' });
                }
            }
        }
    }
}

const SERVER_URL = 'https://worm-protocol-production.up.railway.app';

interface UseNotificationsOptions {
    identity: string;         // 내 identity (수신자 필터링용)
    enabled: boolean;         // 노드 활성 여부
}

export function useNotifications({ identity, enabled }: UseNotificationsOptions) {
    const seenIds = useRef<Set<string>>(new Set());
    const gunRef = useRef<any>(null);
    const listenerRef = useRef<boolean>(false);

    const startListening = useCallback(() => {
        if (!identity || !enabled || listenerRef.current) return;

        // GunDB 초기화 (이미 윈도우에 Gun이 로드됐을 수 있음)
        const initGun = async () => {
            try {
                // GunDB 동적 import
                const Gun = (await import('gun')).default || (window as any).Gun;
                if (!Gun) return;

                const gun = Gun({
                    peers: [`${SERVER_URL}/gun`],
                    localStorage: false,
                    radisk: false
                });
                gunRef.current = gun;
                listenerRef.current = true;

                const myId = identity.toLowerCase();

                // 1. bridge_drops 구독: 외부 → 내부 메일
                gun.get('bridge_drops').map().on((data: any, key: string) => {
                    if (!data || !key || seenIds.current.has(key)) return;
                    if (data && typeof data === 'object' && data['_']) return; // GunDB metadata

                    seenIds.current.add(key);

                    // recipient 확인 (payload가 암호화되어 있으므로 간접 확인)
                    // bridge_drops 키는 `recipient@wormit.io_timestamp` 형태인 경우가 많음
                    const isForMe = key.toLowerCase().includes(myId.replace(/[^a-z0-9]/g, ''));
                    if (!isForMe && !String(key).startsWith('gw_')) return;

                    sendTauriNotification(
                        '📬 New Message — WORM Node',
                        `New WORMIT mail received. Open wormit.online to read.`
                    );
                });

                // 2. 내 개인 drops 구독 (내부 메일)
                gun.get('user-drops').get(myId).map().on((data: any, key: string) => {
                    if (!data || !key || seenIds.current.has('ud_' + key)) return;
                    seenIds.current.add('ud_' + key);

                    sendTauriNotification(
                        '📬 New Message — WORM Node',
                        'New WORMIT internal mail received. Open wormit.online to read.'
                    );
                });

                // 3. REST 폴링 폴백: 30초마다 새 메일 수 확인
                const pollNewMail = async () => {
                    try {
                        // [COMPAT] AbortSignal.timeout() not supported on macOS Catalina (Safari 15)
                        const ctrl = new AbortController();
                        const t = setTimeout(() => ctrl.abort(), 8000);
                        let res: Response;
                        try { res = await fetch(`${SERVER_URL}/api/drop/check/${encodeURIComponent(identity)}`, { signal: ctrl.signal }); }
                        finally { clearTimeout(t); }
                        if (!res.ok) return;
                        const data = await res.json();
                        if (data.newCount && data.newCount > 0) {
                            const unseenKey = `poll_${data.latestId || Date.now()}`;
                            if (!seenIds.current.has(unseenKey)) {
                                seenIds.current.add(unseenKey);
                                sendTauriNotification(
                                    `📬 ${data.newCount} New Message(s) — WORM Node`,
                                    'New WORMIT mail received. Open wormit.online to read.'
                                );
                            }
                        }
                    } catch { /* silent */ }
                };

                // 최초 실행 후 30초 간격으로 폴링
                setTimeout(pollNewMail, 5000);
                const pollInterval = setInterval(pollNewMail, 30000);
                // cleanup에서 사용하도록 저장
                (gunRef.current as any)._pollInterval = pollInterval;

                console.log('[NOTIFY] 🔔 GunDB mail listener started for:', identity);
            } catch (e) {
                console.warn('[NOTIFY] Failed to start GunDB listener:', e);
            }
        };

        initGun();
    }, [identity, enabled]);

    const stopListening = useCallback(() => {
        if (gunRef.current) {
            if (gunRef.current._pollInterval) {
                clearInterval(gunRef.current._pollInterval);
            }
            gunRef.current = null;
        }
        listenerRef.current = false;
    }, []);

    useEffect(() => {
        if (enabled && identity) {
            startListening();
        } else {
            stopListening();
        }
        return () => stopListening();
    }, [enabled, identity, startListening, stopListening]);

    return { sendTauriNotification };
}
