import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/api';

/**
 * Where Duo sends the browser back after the user approves the push.
 * Duo returns ?code=&state= on the URL; we hand both to the backend, which
 * verifies the signed token and finishes the login that was already pending.
 */
export default function DuoCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // HashRouter puts the query after the hash, so read from both places.
    const hash = window.location.hash;
    const qs = hash.includes('?') ? hash.slice(hash.indexOf('?')) : window.location.search;
    const params = new URLSearchParams(qs);
    const code = params.get('code');
    const state = params.get('state');

    if (!code || !state) {
      setError('Duo did not return a valid response.');
      return;
    }

    const trust = sessionStorage.getItem('nwks_duo_trust') === '1';
    sessionStorage.removeItem('nwks_duo_trust');

    apiFetch('/auth/2fa/duo/callback', {
      method: 'POST',
      body: JSON.stringify({ code, state, trust_device: trust }),
    })
      .then(() => navigate('/', { replace: true }))
      .catch((err: Error) => setError(err.message));
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg, #F5F3EC)' }}>
      <div className="text-center space-y-3">
        {error ? (
          <>
            <p role="alert" className="text-sm text-red-700">{error}</p>
            <button onClick={() => navigate('/login', { replace: true })} className="text-sm underline">
              Back to sign in
            </button>
          </>
        ) : (
          <p className="text-sm animate-pulse" style={{ color: '#78716c' }}>Finishing Duo sign-in…</p>
        )}
      </div>
    </div>
  );
}
