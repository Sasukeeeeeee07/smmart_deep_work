import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { Loader2, ArrowRight, AlertCircle, Eye, EyeOff } from 'lucide-react';

const Login = () => {
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [mounted, setMounted]         = useState(false);
  const passwordInputRef              = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => { 
    document.title = 'Sign In — smmart Desk';
    setTimeout(() => setMounted(true), 60); 
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await api.post('/auth/login', { email: email.trim(), password });
      if (response.data.success) {
        localStorage.setItem('token', response.data.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.data));
        setTimeout(() => navigate('/select-mode'), 300);
      }
    } catch (err: any) {
      const msg = err.response?.data?.error?.message
        || err.response?.data?.message
        || 'Incorrect email or password — please verify your credentials.';
      setError(msg);
      setLoading(false);
    }
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart;
    setPassword(val);
    // Preserve cursor position if an aggressive extension script blurs the element
    requestAnimationFrame(() => {
      if (passwordInputRef.current && document.activeElement !== passwordInputRef.current) {
        passwordInputRef.current.focus();
        if (cursor !== null) {
          passwordInputRef.current.setSelectionRange(cursor, cursor);
        }
      }
    });
  };

  return (
    <div
      className="min-h-screen flex"
      style={{ background: 'var(--canvas)' }}
    >
      {/* Left panel — brand story */}
      <div
        className="hidden lg:flex flex-col justify-between w-1/2 p-14"
        style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}
      >
        {/* Logo */}
        <Link to="/login" className="flex items-center cursor-pointer group" title="smmart deep work">
          <img
            src="/smmart-logo.png"
            alt="smmart deep work"
            loading="lazy"
            decoding="async"
            className="h-11 md:h-12 w-auto object-contain transition-transform group-hover:scale-105"
          />
        </Link>

        {/* Hero copy */}
        <div>
          <h1
            className="leading-tight mb-5"
            style={{
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 42,
              fontWeight: 700,
              color: 'var(--ink)',
              letterSpacing: '-0.03em',
              maxWidth: 420,
            }}
          >
            Make room for<br />
            <span style={{ color: 'var(--forest)' }}>meaningful work.</span>
          </h1>
          <p
            className="leading-relaxed max-w-sm"
            style={{ color: 'var(--ink-3)', fontSize: 16 }}
          >
            smmart Desk connects your physical workspace to intelligent session
            monitoring — so you can understand how you truly work.
          </p>
        </div>

        {/* Features */}
        <div className="space-y-4">
          {[
            { label: 'Radar-based presence detection', sub: "Knows when you're at your desk" },
            { label: 'Uninterrupted session tracking', sub: 'Real data, not estimates' },
            { label: 'Break pattern analysis', sub: 'Understand your rhythms' },
          ].map(f => (
            <div key={f.label} className="flex items-start gap-3">
              <div
                className="mt-1 shrink-0"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--sage)',
                  marginTop: 6,
                }}
              />
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{f.label}</p>
                <p className="text-xs" style={{ color: 'var(--ink-4)' }}>{f.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div
          className="w-full"
          style={{
            maxWidth: 380,
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'none' : 'translateY(12px)',
            transition: 'opacity 0.5s ease, transform 0.5s ease',
          }}
        >
          {/* Mobile logo */}
          <Link to="/login" className="flex lg:hidden items-center justify-center mb-8 cursor-pointer group" title="smmart deep work">
            <img
              src="/smmart-logo.png"
              alt="smmart deep work"
              loading="lazy"
              decoding="async"
              className="h-10 w-auto object-contain transition-transform group-hover:scale-105"
            />
          </Link>

          <h2
            className="mb-1"
            style={{
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 26,
              fontWeight: 700,
              color: 'var(--ink)',
              letterSpacing: '-0.02em',
            }}
          >
            Welcome back
          </h2>
          <p className="mb-8 text-sm" style={{ color: 'var(--ink-3)' }}>
            Sign in to your workspace
          </p>

          {error && (
            <div
              className="flex items-start gap-3 p-3.5 rounded-xl mb-6 text-sm"
              style={{
                background: 'rgba(182, 83, 75, 0.08)',
                border: '1px solid rgba(182, 83, 75, 0.2)',
                color: 'var(--error)',
              }}
            >
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">{error}</p>
                <p className="text-xs mt-1 opacity-80">
                  Forgot your password? Ask your admin to reset it from the Team page.
                </p>
              </div>
            </div>
          )}

          <form
            name="login"
            id="login-form"
            method="post"
            action="#"
            onSubmit={handleLogin}
            className="space-y-5"
            autoComplete="on"
          >
            <div>
              <label
                className="block text-sm font-medium mb-1.5"
                htmlFor="username"
                style={{ color: 'var(--ink-2)' }}
              >
                Email address
              </label>
              <input
                id="username"
                name="username"
                type="email"
                className="input-base"
                placeholder="you@smmart.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="username email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  className="block text-sm font-medium"
                  htmlFor="password"
                  style={{ color: 'var(--ink-2)' }}
                >
                  Password
                </label>
                <span className="text-xs" style={{ color: 'var(--ink-4)' }}>
                  Press Enter to submit
                </span>
              </div>
              <div className="relative">
                <input
                  ref={passwordInputRef}
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className="input-base pr-10"
                  placeholder="••••••••"
                  value={password}
                  onChange={handlePasswordChange}
                  required
                  autoComplete="current-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full py-3 mt-2"
              style={{ fontSize: 15 }}
            >
              {loading ? (
                <><Loader2 size={16} className="animate-spin" /> Signing in…</>
              ) : (
                <><span>Sign in</span><ArrowRight size={16} /></>
              )}
            </button>
          </form>

          <p
            className="mt-6 text-center"
            style={{ color: 'var(--ink-4)', fontSize: 12 }}
          >
            smmart Desk — workspace intelligence for focused professionals
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
