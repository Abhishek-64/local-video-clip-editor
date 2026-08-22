import React, { useState, useEffect } from 'react';
import { X, Mail, Lock, User, Sparkles, Youtube, Sliders, Star, Loader2, Eye, EyeOff, CheckCircle } from 'lucide-react';

export default function AuthModal({
  isOpen,
  onClose,
  initialTab = 'login',
  onLogin,
  onSignup,
  error,
  onErrorClear
}) {
  const [tab, setTab] = useState(initialTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);

  useEffect(() => {
    setTab(initialTab);
    setLocalError(null);
    if (onErrorClear) onErrorClear();
  }, [initialTab, isOpen, onErrorClear]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    if (onErrorClear) onErrorClear();

    if (!email || !email.includes('@')) {
      setLocalError('Please enter a valid email address.');
      return;
    }
    if (!password || password.length < 6) {
      setLocalError('Password must be at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (tab === 'signup') {
        await onSignup({ email, password, name });
      } else {
        await onLogin({ email, password });
      }
    } catch (err) {
      setLocalError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayError = localError || error;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      {/* Backdrop click */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal Box */}
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden z-10 animate-scaleUp">
        {/* Glow accent header */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-full transition-all cursor-pointer z-20"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="px-6 pt-7 pb-4 text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-tr from-orange-500 to-rose-500 flex items-center justify-center shadow-lg shadow-orange-500/25 mb-3">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-lg font-bold text-white tracking-tight">
            {tab === 'signup' ? 'Create Your Account' : 'Welcome Back'}
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
            {tab === 'signup'
              ? 'Sign up to sync your YouTube channel, project defaults, and branding presets.'
              : 'Sign in to access your linked YouTube account, presets, and upload history.'}
          </p>

          {/* Tab Switcher */}
          <div className="flex bg-slate-950/60 p-1 rounded-xl border border-slate-800/80 mt-5">
            <button
              type="button"
              onClick={() => {
                setTab('login');
                setLocalError(null);
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                tab === 'login'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('signup');
                setLocalError(null);
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                tab === 'signup'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Create Account
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          {displayError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 flex items-start space-x-2">
              <X className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{displayError}</span>
            </div>
          )}

          {tab === 'signup' && (
            <div>
              <label className="block text-[11px] font-medium text-slate-300 mb-1.5">
                Full Name or Creator Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex Shorts"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950/60 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 rounded-xl text-xs text-white placeholder-slate-500 outline-none transition-all"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950/60 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 rounded-xl text-xs text-white placeholder-slate-500 outline-none transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full pl-10 pr-10 py-2.5 bg-slate-950/60 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 rounded-xl text-xs text-white placeholder-slate-500 outline-none transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer p-1"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 py-2.5 px-4 bg-gradient-to-r from-orange-500 via-rose-500 to-amber-500 hover:from-orange-400 hover:to-rose-400 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-lg shadow-orange-500/20 transition-all flex items-center justify-center space-x-2 cursor-pointer touch-manipulation"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{tab === 'signup' ? 'Creating Account...' : 'Signing In...'}</span>
              </>
            ) : (
              <span>{tab === 'signup' ? 'Create Free Account' : 'Sign In'}</span>
            )}
          </button>

          {/* Feature Highlights Footer */}
          <div className="pt-3 border-t border-slate-800/80">
            <p className="text-[10px] text-slate-400 font-medium mb-2 uppercase tracking-wider text-center">
              Account Benefits
            </p>
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <div className="p-2 bg-slate-950/40 rounded-lg border border-slate-800/50">
                <Youtube className="w-3.5 h-3.5 text-red-400 mx-auto mb-1" />
                <span className="text-[10px] text-slate-300 block font-medium">YouTube Sync</span>
              </div>
              <div className="p-2 bg-slate-950/40 rounded-lg border border-slate-800/50">
                <Sliders className="w-3.5 h-3.5 text-orange-400 mx-auto mb-1" />
                <span className="text-[10px] text-slate-300 block font-medium">Cloud Presets</span>
              </div>
              <div className="p-2 bg-slate-950/40 rounded-lg border border-slate-800/50">
                <Star className="w-3.5 h-3.5 text-amber-400 mx-auto mb-1" />
                <span className="text-[10px] text-slate-300 block font-medium">Multi-Device</span>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
