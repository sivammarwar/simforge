import React, { useEffect, useState, useCallback } from 'react';
import './AccessGate.css';

/**
 * AccessGate
 * ==========
 * Phase 1 landing/access-gate. Blocks the SimForge app behind an 8-digit
 * access code. On mount, checks for an existing valid session cookie
 * (GET /api/auth/session) so returning users skip straight to the app.
 * On submit, calls POST /api/auth/verify-code; the backend sets an
 * httpOnly signed session cookie on success.
 */
export default function AccessGate({ children }) {
  const [checkingSession, setCheckingSession] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/session', { credentials: 'same-origin' })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.authenticated) {
          setAuthenticated(true);
        }
      })
      .catch(() => {
        // Backend unreachable — fall through to the access gate.
      })
      .finally(() => {
        if (!cancelled) setCheckingSession(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleCodeChange = useCallback((e) => {
    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 8);
    setCode(digitsOnly);
    if (error) setError('');
  }, [error]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (code.length !== 8 || submitting) return;

    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.success) {
        setAuthenticated(true);
      } else {
        setError(data.error || 'Invalid access code.');
        setCode('');
      }
    } catch (err) {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [code, submitting]);

  if (checkingSession) {
    return (
      <div className="access-gate-loading">
        <div className="access-gate-spinner" />
      </div>
    );
  }

  if (authenticated) {
    return children;
  }

  return (
    <div className="access-gate">
      <div className="access-gate-card">
        <div className="access-gate-mark">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <path d="M14 17.5h7M17.5 14v7" />
          </svg>
        </div>
        <div className="access-gate-title">SimForge</div>
        <div className="access-gate-subtitle">
          AI-driven circuit simulation platform.<br />
          Enter your access code to continue.
        </div>
        <form className="access-gate-form" onSubmit={handleSubmit}>
          <input
            className={`access-gate-input${error ? ' error' : ''}`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="········"
            value={code}
            onChange={handleCodeChange}
            autoFocus
            maxLength={8}
          />
          <div className="access-gate-error">{error}</div>
          <button
            type="submit"
            className="access-gate-submit"
            disabled={code.length !== 8 || submitting}
          >
            {submitting ? 'Verifying…' : 'Enter'}
          </button>
        </form>
        <div className="access-gate-footer">
          Access is invite-only during this preview.
        </div>
      </div>
    </div>
  );
}
