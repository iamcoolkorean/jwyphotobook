import { useState, FormEvent } from 'react';

interface AdminPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AdminPasswordModal({
  isOpen,
  onClose,
  onSuccess,
}: AdminPasswordModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  if (!isOpen) return null;

  const hashPassword = async (input: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password.trim()) {
      setError('Please enter your password.');
      return;
    }

    try {
      setIsVerifying(true);
      const inputHash = await hashPassword(password.trim());
      // Expected SHA-256 hash (never exposes plaintext password in bundle or public repository)
      const expectedHash =
        (import.meta as any).env?.VITE_ADMIN_PASSWORD_HASH ||
        '1b69189834112b6bc7b8b0233de2320b538ae1f720a1eb5a97427552004da426';

      if (inputHash.toLowerCase() === expectedHash.toLowerCase().trim()) {
        setPassword('');
        try {
          sessionStorage.setItem('jwy_admin_password_verified', 'true');
        } catch (_) {}
        onSuccess();
      } else {
        setError('Incorrect password. Please try again.');
      }
    } catch (err) {
      console.error('Password verification error:', err);
      setError('Verification service unavailable.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm select-none">
      <div className="bg-[#0A0A0A] border border-white/20 w-full max-w-md p-6 sm:p-8 space-y-6 shadow-2xl shadow-black">
        <div className="space-y-1">
          <div className="font-sans text-[11px] text-neutral-400 uppercase tracking-[0.2em]">
            SECURITY GATE
          </div>
          <h2 className="text-xl sm:text-2xl font-light tracking-tight text-white font-sans">
            ADMIN ACCESS
          </h2>
          <p className="text-neutral-400 text-xs sm:text-sm font-light pt-1 leading-relaxed">
            Enter master password to access admin console and archive publishing controls.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-[11px] font-sans uppercase tracking-[0.15em] text-neutral-400">
              PASSWORD
            </label>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              placeholder="••••••••"
              className="w-full bg-black border border-white/20 px-3.5 py-2.5 text-white font-light tracking-tight text-sm focus:outline-hidden focus:border-white transition-colors"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-950/30 border border-red-900/60 text-red-400 text-xs font-light tracking-tight">
              {error}
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setPassword('');
                setError(null);
                onClose();
              }}
              className="px-4 py-2 border border-neutral-800 hover:border-neutral-600 bg-transparent text-neutral-400 hover:text-white font-sans text-xs uppercase tracking-[0.15em] cursor-pointer transition-colors"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={isVerifying}
              className="px-5 py-2 bg-white text-black hover:bg-neutral-200 disabled:opacity-50 border border-white font-sans text-xs uppercase tracking-[0.15em] font-medium cursor-pointer transition-colors"
            >
              {isVerifying ? 'VERIFYING...' : 'VERIFY & ENTER →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
