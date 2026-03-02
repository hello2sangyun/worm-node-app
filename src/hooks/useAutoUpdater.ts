/**
 * useAutoUpdater — Tauri v1 자동 업데이트 훅
 *
 * - 앱 시작 시 + 30분마다 업데이트 확인
 * - 업데이트 있으면 { available: true, version, notes } 반환
 * - installUpdate() 호출 시 다운로드 후 재시작
 */

import { useState, useEffect, useCallback } from 'react';

export interface UpdateInfo {
    available: boolean;
    version: string;
    notes: string;
    date?: string;
}

export function useAutoUpdater() {
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    const [isInstalling, setIsInstalling] = useState(false);
    const [installProgress, setInstallProgress] = useState(0);

    const checkForUpdate = useCallback(async () => {
        // Tauri 환경이 아니면 스킵
        if (typeof window === 'undefined' || !('__TAURI__' in window)) return;
        try {
            const { checkUpdate } = await import('@tauri-apps/api/updater');
            const { shouldUpdate, manifest } = await checkUpdate();
            if (shouldUpdate && manifest) {
                setUpdateInfo({
                    available: true,
                    version: manifest.version,
                    notes: manifest.body || '',
                    date: manifest.date,
                });
                console.log(`[Updater] 🆕 New version available: ${manifest.version}`);
            } else {
                setUpdateInfo(null);
            }
        } catch (e) {
            // 네트워크 오류나 pubkey 미설정 시 조용히 무시
            console.debug('[Updater] Check skipped:', e);
        }
    }, []);

    // 앱 시작 10초 후 첫 체크 + 30분마다 재확인
    useEffect(() => {
        const initial = setTimeout(checkForUpdate, 10_000);
        const interval = setInterval(checkForUpdate, 30 * 60 * 1000);
        return () => {
            clearTimeout(initial);
            clearInterval(interval);
        };
    }, [checkForUpdate]);

    const installUpdate = useCallback(async () => {
        if (!updateInfo?.available || isInstalling) return;
        if (typeof window === 'undefined' || !('__TAURI__' in window)) return;

        setIsInstalling(true);
        setInstallProgress(0);

        try {
            const { installUpdate: tauriInstall, onUpdaterEvent } = await import('@tauri-apps/api/updater');
            const { relaunch } = await import('@tauri-apps/api/process');

            // 진행상황 이벤트 수신
            const unlisten = await onUpdaterEvent((event: any) => {
                const s: string = event.status ?? '';
                if (s === 'PENDING') setInstallProgress(10);
                if (s === 'DOWNLOADING') setInstallProgress(50);
                if (s === 'DOWNLOADED') setInstallProgress(80);
                if (s === 'DONE') setInstallProgress(100);
                if (s === 'ERROR') {
                    console.error('[Updater] Error:', event.error);
                    setIsInstalling(false);
                }
            });

            setInstallProgress(20);
            await tauriInstall();
            setInstallProgress(100);

            unlisten();

            // 잠깐 후 재시작
            setTimeout(async () => {
                await relaunch();
            }, 800);
        } catch (err) {
            console.error('[Updater] Install failed:', err);
            setIsInstalling(false);
            setInstallProgress(0);
        }
    }, [updateInfo, isInstalling]);

    return { updateInfo, isInstalling, installProgress, checkForUpdate, installUpdate };
}
