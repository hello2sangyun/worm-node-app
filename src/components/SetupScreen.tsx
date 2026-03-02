import { useState, useRef } from 'react';
import type { NodeConfig } from '../hooks/useNodeState';
import { SERVER_URL } from '../hooks/useNodeState';

// ── Key storage (localStorage, NOT secure native keychain in web context)
// Stores the decrypted JWK private key after successful import.
// In Tauri this lives in the app's sandboxed localStorage — acceptable for a desktop app.
const STORAGE_KEY_PRIV = 'worm_node_priv_jwk';
const STORAGE_KEY_PUB = 'worm_node_pub_jwk';
const STORAGE_KEY_NAME = 'worm_node_identity_name';
const STORAGE_KEY_ENCPRIV = 'worm_node_enc_priv_jwk';

export interface KeyPairBundle {
    signingPriv: CryptoKey;
    signingPub: CryptoKey;
    encPriv?: CryptoKey;
    identity: string;
}

/** Try to load a previously imported keypair from localStorage */
export async function loadSavedKeypair(): Promise<KeyPairBundle | null> {
    try {
        const name = localStorage.getItem(STORAGE_KEY_NAME);
        const privStr = localStorage.getItem(STORAGE_KEY_PRIV);
        const pubStr = localStorage.getItem(STORAGE_KEY_PUB);
        if (!name || !privStr || !pubStr) return null;

        const signingPriv = await crypto.subtle.importKey('jwk', JSON.parse(privStr), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
        const signingPub = await crypto.subtle.importKey('jwk', JSON.parse(pubStr), { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);

        const encPrivStr = localStorage.getItem(STORAGE_KEY_ENCPRIV);
        let encPriv: CryptoKey | undefined;
        if (encPrivStr) {
            encPriv = await crypto.subtle.importKey('jwk', JSON.parse(encPrivStr), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey', 'deriveBits']);
        }

        return { signingPriv, signingPub, encPriv, identity: name };
    } catch { return null; }
}

/** Parse and decrypt a WORMIT_KEY_V1 file */
async function decryptWormKey(fileContent: string, password: string): Promise<{
    name: string;
    signing: { privateKey: JsonWebKey; publicKey: JsonWebKey };
    encryption?: { privateKey: JsonWebKey; publicKey: JsonWebKey };
} | null> {
    try {
        let jsonContent = fileContent.trim();
        if (jsonContent.startsWith('WORMIT_KEY_V1::')) {
            jsonContent = atob(jsonContent.split('::')[1]);
        }
        const exportData = JSON.parse(jsonContent);
        const encryptedData = Uint8Array.from(atob(exportData.data), c => c.charCodeAt(0));
        const salt = Uint8Array.from(atob(exportData.salt), c => c.charCodeAt(0));
        const iv = Uint8Array.from(atob(exportData.iv), c => c.charCodeAt(0));

        const enc = new TextEncoder();
        const passKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
        const aesKey = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
            passKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
        );
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, encryptedData);
        return JSON.parse(new TextDecoder().decode(decrypted));
    } catch { return null; }
}

/** Save decrypted JWKs to localStorage for next session */
async function saveKeypairLocally(bundle: KeyPairBundle, rawIdentityData: {
    signing: { privateKey: JsonWebKey; publicKey: JsonWebKey };
    encryption?: { privateKey: JsonWebKey; publicKey: JsonWebKey };
}): Promise<void> {
    localStorage.setItem(STORAGE_KEY_NAME, bundle.identity);
    localStorage.setItem(STORAGE_KEY_PRIV, JSON.stringify(rawIdentityData.signing.privateKey));
    localStorage.setItem(STORAGE_KEY_PUB, JSON.stringify(rawIdentityData.signing.publicKey));
    if (rawIdentityData.encryption) {
        localStorage.setItem(STORAGE_KEY_ENCPRIV, JSON.stringify(rawIdentityData.encryption.privateKey));
    }
}

// ────────────────────────────────────────────────────────────────

interface Props {
    onSetup: (cfg: NodeConfig, keypair: KeyPairBundle) => void;
}

type Step = 'key' | 'node';

export function SetupScreen({ onSetup }: Props) {
    const [step, setStep] = useState<Step>('key');

    // Key import state
    const [fileContent, setFileContent] = useState('');
    const [fileName, setFileName] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [importedName, setImportedName] = useState('');
    const [keypairBundle, setKeypairBundle] = useState<KeyPairBundle | null>(null);

    // Wallet balance
    const [wmtBalance, setWmtBalance] = useState<number | null>(null);
    const [balanceLoading, setBalanceLoading] = useState(false);

    const fileRef = useRef<HTMLInputElement>(null);

    // ── File picker ─────────────────────────────────────
    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const f = e.target.files?.[0];
        if (!f) return;
        setFileName(f.name);
        setError('');
        const reader = new FileReader();
        reader.onload = ev => setFileContent((ev.target?.result as string) || '');
        reader.readAsText(f);
    }

    // ── Import & decrypt ─────────────────────────────────
    async function handleImport() {
        if (!fileContent) { setError('Please select a .worm key file'); return; }
        if (!password) { setError('Enter your key file password'); return; }
        setLoading(true);
        setError('');

        const identityData = await decryptWormKey(fileContent, password);
        if (!identityData) {
            setLoading(false);
            setError('Incorrect password or invalid key file');
            return;
        }

        try {
            const signingPriv = await crypto.subtle.importKey('jwk', identityData.signing.privateKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
            const signingPub = await crypto.subtle.importKey('jwk', identityData.signing.publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
            let encPriv: CryptoKey | undefined;
            if (identityData.encryption) {
                encPriv = await crypto.subtle.importKey('jwk', identityData.encryption.privateKey, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey', 'deriveBits']);
            }

            const bundle: KeyPairBundle = { signingPriv, signingPub, encPriv, identity: identityData.name };
            await saveKeypairLocally(bundle, identityData);

            setKeypairBundle(bundle);
            setImportedName(identityData.name);
            setLoading(false);
            setStep('node');

            // Fetch wallet balance for this identity
            setBalanceLoading(true);
            fetch(`${SERVER_URL}/api/chain/balance/${encodeURIComponent(identityData.name)}`)
                .then(r => r.json())
                .then(data => { if (typeof data.balance === 'number') setWmtBalance(data.balance); })
                .catch(() => { })
                .finally(() => setBalanceLoading(false));
        } catch (e) {
            setLoading(false);
            setError('Failed to import key: ' + String(e).slice(0, 80));
        }
    }

    // ── Final: start node ─────────────────────────────────
    function handleStart() {
        if (!keypairBundle) return;
        // Tier is auto-determined by staking in LaunchNodeModal — default to SEEDLING here
        onSetup(
            { identity: keypairBundle.identity, tier: 'SEEDLING', storageGB: 10, autoReconnect: true, posEnabled: true, relayEnabled: true },
            keypairBundle
        );
    }

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100vh', gap: 28, padding: 40,
            background: 'radial-gradient(ellipse at 50% 0%, rgba(16,185,129,0.06) 0%, transparent 70%), var(--bg-base)'
        }}>
            {/* Logo */}
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 50, marginBottom: 10 }}>🪐</div>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>WORM Node</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>Decentralized Mining Client v1.0</div>
            </div>

            {/* Step indicators */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {(['key', 'node'] as Step[]).map((s, i) => (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                            width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 700,
                            background: step === s ? 'var(--green-mid)' : s === 'node' && step === 'node' ? 'var(--green-mid)' : (step === 'node' && s === 'key') ? 'var(--green-dim)' : 'var(--bg-elevated)',
                            color: step === s || (step === 'node' && s === 'key') ? '#fff' : 'var(--text-muted)',
                            border: `1px solid ${step === s ? 'var(--green-bright)' : 'var(--border-default)'}`
                        }}>
                            {step === 'node' && s === 'key' ? '✓' : i + 1}
                        </div>
                        <span style={{ fontSize: 11, color: step === s ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                            {s === 'key' ? 'Import Key' : 'Node Setup'}
                        </span>
                        {i < 1 && <span style={{ color: 'var(--border-default)', fontSize: 14 }}>›</span>}
                    </div>
                ))}
            </div>

            {/* ── STEP 1: Key Import ── */}
            {step === 'key' && (
                <div style={{
                    width: '100%', maxWidth: 460,
                    background: 'var(--bg-card)', border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-xl)', padding: 28
                }}>
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                            🔑 Import your WORM key file
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                            Export your key from the WORM app:<br />
                            <span style={{ color: 'var(--text-secondary)' }}>Wallet → Settings → Export Key (.worm file)</span>
                        </div>
                    </div>

                    {/* File drop zone */}
                    <div
                        id="key-dropzone"
                        onClick={() => fileRef.current?.click()}
                        onDragOver={e => { e.preventDefault(); }}
                        onDrop={e => {
                            e.preventDefault();
                            const f = e.dataTransfer.files[0];
                            if (!f) return;
                            setFileName(f.name);
                            const r = new FileReader();
                            r.onload = ev => setFileContent((ev.target?.result as string) || '');
                            r.readAsText(f);
                        }}
                        style={{
                            border: `2px dashed ${fileName ? 'var(--green-mid)' : 'var(--border-default)'}`,
                            borderRadius: 'var(--radius)',
                            padding: '24px 16px',
                            textAlign: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            background: fileName ? 'var(--green-dim)' : 'var(--bg-surface)',
                            marginBottom: 16
                        }}
                    >
                        <input ref={fileRef} type="file" accept=".worm,.txt" style={{ display: 'none' }} onChange={handleFileChange} />
                        <div style={{ fontSize: 22, marginBottom: 8 }}>{fileName ? '📄' : '📁'}</div>
                        <div style={{ fontSize: 12, color: fileName ? 'var(--green-text)' : 'var(--text-secondary)' }}>
                            {fileName ? fileName : 'Click to select or drag your .worm file here'}
                        </div>
                    </div>

                    {/* Password */}
                    <div style={{ marginBottom: 20 }}>
                        <label className="input-label">Key File Password</label>
                        <input
                            id="key-password-input"
                            className="input"
                            type="password"
                            placeholder="Your export password"
                            value={password}
                            onChange={e => { setPassword(e.target.value); setError(''); }}
                            onKeyDown={e => e.key === 'Enter' && handleImport()}
                            autoFocus={!!fileName}
                        />
                    </div>

                    {error && (
                        <div style={{
                            color: 'var(--red-text)', fontSize: 12, marginBottom: 14,
                            padding: '8px 12px', background: 'var(--red-dim)',
                            borderRadius: 'var(--radius)', border: '1px solid var(--red-mid)'
                        }}>
                            ⚠️ {error}
                        </div>
                    )}

                    <button
                        id="import-key-btn"
                        className="btn btn-primary"
                        style={{ width: '100%' }}
                        onClick={handleImport}
                        disabled={loading || !fileContent || !password}
                    >
                        {loading ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span className="spinner" />
                                Verifying key…
                            </span>
                        ) : '🔓 Verify & Continue'}
                    </button>

                    <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                            🔒 <strong style={{ color: 'var(--text-secondary)' }}>Private key never leaves this device.</strong> Your key is decrypted locally and stored in the app's sandboxed storage. The server only receives your identity name and ECDSA signatures.
                        </div>
                    </div>
                </div>
            )}

            {/* ── STEP 2: Node Setup (replaces tier selection) ── */}
            {step === 'node' && (
                <div style={{
                    width: '100%', maxWidth: 460,
                    background: 'var(--bg-card)', border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-xl)', padding: 28
                }}>
                    {/* Identity confirm banner */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 14px', background: 'var(--green-dim)',
                        borderRadius: 'var(--radius)', border: '1px solid var(--green-mid)',
                        marginBottom: 20
                    }}>
                        <span style={{ fontSize: 18 }}>✅</span>
                        <div>
                            <div style={{ fontSize: 11, color: 'var(--green-text)', fontWeight: 600 }}>Key verified successfully</div>
                            <div className="mono" style={{ fontSize: 13, color: 'var(--text-primary)' }}>{importedName}</div>
                        </div>
                    </div>

                    {/* Wallet Balance Card */}
                    <div style={{
                        padding: '18px 20px', marginBottom: 20,
                        background: 'linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(16,185,129,0.02) 100%)',
                        border: '1px solid var(--green-mid)',
                        borderRadius: 'var(--radius)',
                        position: 'relative', overflow: 'hidden'
                    }}>
                        {/* subtle bg accent */}
                        <div style={{ position: 'absolute', right: -20, top: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(16,185,129,0.06)' }} />
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                            Wallet Balance
                        </div>
                        {balanceLoading ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36 }}>
                                <span className="spinner" />
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading balance...</span>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--green-bright)', letterSpacing: '-0.02em' }}>
                                    {wmtBalance !== null ? wmtBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                                </span>
                                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>WMT</span>
                            </div>
                        )}
                        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green-bright)', display: 'inline-block' }} />
                            {importedName}
                        </div>
                    </div>

                    {/* Info box about staking */}
                    <div style={{
                        padding: '10px 14px', marginBottom: 20,
                        background: 'var(--bg-elevated)', borderRadius: 'var(--radius)',
                        border: '1px solid var(--border-subtle)',
                        fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6
                    }}>
                        💡 노드 등급(Tier)은 대시보드에서 <strong style={{ color: 'var(--text-secondary)' }}>WMT 스테이킹</strong>과 <strong style={{ color: 'var(--text-secondary)' }}>스토리지 할당</strong>을 설정할 때 자동으로 결정됩니다.
                    </div>

                    <div style={{ display: 'flex', gap: 10 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setStep('key')} style={{ flex: '0 0 auto' }}>
                            ← Back
                        </button>
                        <button id="start-node-btn" className="btn btn-primary" style={{ flex: 1 }} onClick={handleStart}>
                            🚀 Start Node as {importedName}
                        </button>
                    </div>
                </div>
            )}

            <div style={{ fontSize: 11, color: 'var(--text-disabled)' }}>
                ECDSA P-256 · AES-GCM · PBKDF2 · worm-protocol-production.up.railway.app
            </div>
        </div>
    );
}
