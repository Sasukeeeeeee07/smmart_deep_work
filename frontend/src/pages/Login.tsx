import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { KeyRound, Mail, Loader2, Cpu, ArrowRight } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/login', { email, password });
      if (response.data.success) {
        localStorage.setItem('token', response.data.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.data));
        // Add a slight delay for animation before redirect
        setTimeout(() => navigate('/'), 400);
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Authentication failed. Please check your credentials.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background relative overflow-hidden">
      {/* Animated Background Orbs */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-primary/30 rounded-full mix-blend-screen filter blur-[100px] animate-blob" />
        <div className="absolute top-[20%] right-[-10%] w-96 h-96 bg-accent/20 rounded-full mix-blend-screen filter blur-[100px] animate-blob" style={{ animationDelay: '2s' }} />
        <div className="absolute bottom-[-20%] left-[20%] w-96 h-96 bg-primary-dark/30 rounded-full mix-blend-screen filter blur-[100px] animate-blob" style={{ animationDelay: '4s' }} />
      </div>

      {/* Left side: Branding / Presentation */}
      <div className="w-full md:w-1/2 p-8 md:p-12 lg:p-24 flex flex-col justify-center relative z-10 hidden md:flex">
        <div className={`transition-all duration-1000 transform ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
          <div className="inline-flex items-center space-x-3 mb-8 bg-surface border border-white/10 px-4 py-2 rounded-full">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-accent"></span>
            </span>
            <span className="text-sm text-text-muted font-medium tracking-wide uppercase">System Online</span>
          </div>
          
          <h1 className="text-5xl lg:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-text-muted mb-6 tracking-tight">
            SmartDesk
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-light to-accent">Control Center</span>
          </h1>
          
          <p className="text-lg text-text-muted max-w-md leading-relaxed">
            Manage your IoT ecosystem, monitor live telemetry, and deploy tasks to physical hardware interfaces in real-time.
          </p>
        </div>
      </div>

      {/* Right side: Login Form */}
      <div className="w-full md:w-1/2 flex items-center justify-center p-6 sm:p-12 relative z-10 min-h-screen md:min-h-0">
        <div className={`glass-panel p-8 sm:p-10 rounded-[2rem] w-full max-w-md transition-all duration-1000 transform ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`} style={{ transitionDelay: '200ms' }}>
          
          <div className="flex md:hidden items-center justify-center space-x-3 mb-10">
            <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center border border-primary/30">
              <Cpu className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">SmartDesk</h2>
          </div>

          <div className="mb-10 text-center md:text-left">
            <h3 className="text-3xl font-bold text-white mb-2">Welcome Back</h3>
            <p className="text-text-muted">Authenticate to access the dashboard</p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl mb-6 text-sm flex items-center animate-fade-in-up">
              <div className="h-2 w-2 bg-red-500 rounded-full mr-3 animate-pulse"></div>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-1">
              <label className="text-sm font-medium text-text-muted ml-1">Email Address</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors group-focus-within:text-primary text-text-muted">
                  <Mail className="h-5 w-5" />
                </div>
                <input
                  type="email"
                  className="input-premium w-full pl-11 pr-4 py-3.5 rounded-xl placeholder-text-muted/50 outline-none"
                  placeholder="admin@smartdesk.local"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-text-muted ml-1">Password</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors group-focus-within:text-primary text-text-muted">
                  <KeyRound className="h-5 w-5" />
                </div>
                <input
                  type="password"
                  className="input-premium w-full pl-11 pr-4 py-3.5 rounded-xl placeholder-text-muted/50 outline-none"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="btn-premium w-full py-4 px-4 text-white font-semibold rounded-xl flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <Loader2 className="animate-spin h-5 w-5" />
                ) : (
                  <>
                    <span>Initialize Session</span>
                    <ArrowRight className="h-5 w-5 ml-2 opacity-80" />
                  </>
                )}
              </button>
            </div>
          </form>
          
          <div className="mt-8 text-center">
            <p className="text-xs text-text-muted/60">
              Secured by SmartDesk Encryption Protocol
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
