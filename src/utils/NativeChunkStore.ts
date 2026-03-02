/**
 * NativeChunkStore — Tauri 네이티브 파일시스템 기반 청크 저장소
 *
 * 저장 경로: ~/Library/Application Support/worm-node/chunks/
 * (macOS 기준, Tauri의 $APPDATA/worm-node/chunks/)
 *
 * IndexedDB 대신 실제 파일로 저장하므로:
 * - Finder에서 직접 확인 가능
 * - 앱 재설치 후에도 유지
 * - 경로를 UI에 표시 가능
 */

import {
    createDir,
    writeBinaryFile,
    readBinaryFile,
    readDir,
    removeFile,
    exists,
} from '@tauri-apps/api/fs';
import { appDataDir, join } from '@tauri-apps/api/path';

let _chunkDir: string | null = null;

/** 청크 저장 디렉토리 경로를 가져옴 (캐시됨) */
async function getChunkDir(): Promise<string> {
    if (_chunkDir) return _chunkDir;
    const base = await appDataDir();  // e.g. ~/Library/Application Support/WORM Node/
    _chunkDir = await join(base, 'chunks');
    // 디렉토리가 없으면 생성
    await createDir(_chunkDir, { recursive: true }).catch(() => {/* 이미 존재 */ });
    return _chunkDir;
}

/** 청크 저장 기본 경로 반환 (UI 표시용) */
export async function getChunkStorePath(): Promise<string> {
    return getChunkDir();
}

/** 청크를 파일로 저장 (이미 존재하면 스킵 — dedup) */
export async function saveChunk(cid: string, data: Uint8Array): Promise<{ saved: boolean; path: string }> {
    const dir = await getChunkDir();
    const filePath = await join(dir, sanitizeCid(cid));

    // 이미 있으면 저장 스킵 (같은 CID = 같은 내용)
    const alreadyExists = await exists(filePath).catch(() => false);
    if (alreadyExists) {
        return { saved: false, path: filePath };
    }

    await writeBinaryFile({ path: filePath, contents: data });
    return { saved: true, path: filePath };
}

/** 청크 데이터 읽기 */
export async function loadChunk(cid: string): Promise<Uint8Array | null> {
    try {
        const dir = await getChunkDir();
        const filePath = await join(dir, sanitizeCid(cid));
        const data = await readBinaryFile(filePath);
        return new Uint8Array(data);
    } catch {
        return null;
    }
}

/** 특정 청크 존재 여부 확인 */
export async function hasChunk(cid: string): Promise<boolean> {
    try {
        const dir = await getChunkDir();
        const filePath = await join(dir, sanitizeCid(cid));
        return exists(filePath);
    } catch {
        return false;
    }
}

/** 저장된 청크 CID 목록 */
export async function listChunkCIDs(): Promise<string[]> {
    try {
        const dir = await getChunkDir();
        const entries = await readDir(dir);
        return entries
            .filter(e => !e.children) // 파일만
            .map(e => e.name || '')
            .filter(Boolean);
    } catch {
        return [];
    }
}

/** 저장된 청크 수 */
export async function countChunks(): Promise<number> {
    const cids = await listChunkCIDs();
    return cids.length;
}

/** 저장된 총 크기 (bytes) */
export async function getStorageStats(): Promise<{ count: number; totalBytes: number }> {
    try {
        const dir = await getChunkDir();
        const entries = await readDir(dir);
        let totalBytes = 0;
        for (const entry of entries) {
            if (!entry.children && entry.name) {
                try {
                    const filePath = await join(dir, entry.name);
                    const data = await readBinaryFile(filePath);
                    totalBytes += data.byteLength;
                } catch { /* 무시 */ }
            }
        }
        return { count: entries.filter(e => !e.children).length, totalBytes };
    } catch {
        return { count: 0, totalBytes: 0 };
    }
}

/** 특정 청크 삭제 */
export async function deleteChunk(cid: string): Promise<void> {
    const dir = await getChunkDir();
    const filePath = await join(dir, sanitizeCid(cid));
    await removeFile(filePath).catch(() => {/* 없으면 무시 */ });
}

/** 모든 청크 삭제 */
export async function clearAllChunks(): Promise<void> {
    const dir = await getChunkDir();
    const cids = await listChunkCIDs();
    await Promise.all(cids.map(cid => deleteChunk(cid)));
    // 빈 디렉토리는 유지 (재생성 불필요하도록)
}

/** CID를 안전한 파일명으로 변환 */
function sanitizeCid(cid: string): string {
    // CID에는 슬래시 같은 특수문자가 없지만 방어적으로 처리
    return cid.replace(/[^a-zA-Z0-9_\-\.]/g, '_').slice(0, 128);
}

/** Tauri 환경인지 확인 */
export function isTauriEnv(): boolean {
    return typeof window !== 'undefined' && '__TAURI__' in window;
}
