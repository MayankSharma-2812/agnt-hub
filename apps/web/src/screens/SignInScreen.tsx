import React, { useState } from 'react';
import { Bot, Key, Globe, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { saveStoredAuth } from '../api/client.js';

interface SignInScreenProps {
  onSignInSuccess: () => void;
}

export const SignInScreen: React.FC<SignInScreenProps> = ({ onSignInSuccess }) => {
  const [hubUrl, setHubUrl] = useState(
    window.location.origin.includes('5173') ? 'http://localhost:3000' : window.location.origin,
  );
  const [token, setToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const normalizedUrl = hubUrl.replace(/\/+$/, '');

      // 1. Healthcheck
      const healthRes = await fetch(`${normalizedUrl}/health`);
      if (!healthRes.ok) throw new Error('Hub healthcheck failed. Check URL.');

      // 2. Validate Token
      const meRes = await fetch(`${normalizedUrl}/api/v1/me`, {
        headers: { Authorization: `Bearer ${token.trim()}` },
      });

      if (!meRes.ok) {
        if (meRes.status === 401) throw new Error('Invalid or revoked API token.');
        throw new Error(`Authentication error (Status: ${meRes.status})`);
      }

      const meData = await meRes.json();

      saveStoredAuth({
        hubUrl: normalizedUrl,
        token: token.trim(),
        memberName: meData.member?.name,
        isAdmin: meData.member?.is_admin === 1,
      });

      onSignInSuccess();
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to connect to Agent Hub');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-hub-border bg-hub-surface p-6 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-hub-accent text-white">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-hub-text">Agent Hub</h1>
            <p className="text-xs text-hub-muted">Multi-Agent Coordination Platform</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-hub-danger/30 bg-hub-danger/10 p-3 text-xs text-hub-danger">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-hub-muted" htmlFor="hubUrl">
              Hub URL
            </label>
            <div className="relative">
              <Globe className="absolute left-3 top-2.5 h-4 w-4 text-hub-muted" />
              <input
                id="hubUrl"
                type="text"
                required
                value={hubUrl}
                onChange={(e) => setHubUrl(e.target.value)}
                className="w-full rounded-lg border border-hub-border bg-hub-bg py-2 pl-9 pr-3 text-sm text-hub-text focus:border-hub-accent focus:outline-none"
                placeholder="http://localhost:3000"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-hub-muted" htmlFor="token">
              Bearer API Token
            </label>
            <div className="relative">
              <Key className="absolute left-3 top-2.5 h-4 w-4 text-hub-muted" />
              <input
                id="token"
                type="password"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="w-full rounded-lg border border-hub-border bg-hub-bg py-2 pl-9 pr-3 text-sm text-hub-text focus:border-hub-accent focus:outline-none"
                placeholder="Paste member token..."
              />
            </div>
            <p className="mt-1 text-[11px] text-hub-muted">
              Tokens are stored in localStorage and never sent outside the Hub.
            </p>
          </div>

          <button
            type="submit"
            disabled={isLoading || !token}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-hub-accent py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <span>Sign In to Hub</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
