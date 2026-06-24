import { useState } from 'react';
import { registerUser, loginUser } from '../utils/api.js';
import { setAuth } from '../utils/auth.js';

export default function Login() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const fn = mode === 'register' ? registerUser : loginUser;
      const { token, username: name } = await fn(username.trim(), passcode);
      setAuth(token, name);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell" dir="rtl" lang="ar">
      <div className="login-screen">
        <div className="login-card">
          <div className="login-logo">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
          </div>
          <h1 className="login-title">مكتبتي</h1>
          <p className="login-subtitle">
            {mode === 'register' ? 'أنشئ حساباً لحفظ كتبك بشكل خاص' : 'سجّل الدخول للوصول إلى كتبك'}
          </p>

          <form onSubmit={submit} className="login-form">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="اسم المستخدم"
              autoComplete="username"
              dir="rtl"
              required
            />
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="الرمز السري"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              dir="ltr"
              required
            />
            {error && <div className="error">{error}</div>}
            <button type="submit" className="login-submit" disabled={busy}>
              {busy ? '...' : mode === 'register' ? 'إنشاء حساب' : 'تسجيل الدخول'}
            </button>
          </form>

          <button
            type="button"
            className="login-switch"
            onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError(null); }}
          >
            {mode === 'register' ? 'لديك حساب؟ سجّل الدخول' : 'ليس لديك حساب؟ أنشئ واحداً'}
          </button>
        </div>
      </div>
    </div>
  );
}
