import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/api';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--color-bg, #F5F3EC)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl shadow-lg p-8"
        style={{ background: 'var(--color-surface, #FFFFFF)' }}
      >
        {/* Brand header */}
        <div className="text-center mb-8">
          <span className="text-4xl" aria-hidden="true">⛺</span>
          <h1
            className="mt-3 text-2xl font-bold tracking-tight"
            style={{ color: 'var(--color-primary, #6B7645)', fontFamily: 'Georgia, serif' }}
          >
            NWKS Encounter
          </h1>
          <p className="text-sm mt-1" style={{ color: '#78716c' }}>Admin Panel</p>
        </div>

        {/* Inline error alert */}
        {error && (
          <div
            role="alert"
            className="mb-5 rounded-lg border px-4 py-3 text-sm"
            style={{
              background: '#fef2f2',
              borderColor: '#fecaca',
              color: '#991b1b',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium mb-1"
              style={{ color: '#44403c' }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
              style={{ borderColor: '#d6d3d1' }}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium mb-1"
              style={{ color: '#44403c' }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
              style={{ borderColor: '#d6d3d1' }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity"
            style={{
              background: 'var(--color-primary, #6B7645)',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
