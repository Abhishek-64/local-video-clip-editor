/**
 * useAuth — React hook for User Authentication & Account Sync
 * Manages logged-in user state, session persistence, and auth modal triggers.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  signup,
  login,
  logout,
  getMe,
  getAuthToken,
  clearAuthToken,
  isApiConfigured
} from '../services/apiService';

export function useAuth({ onAuthSuccess } = {}) {
  const apiAvailable = isApiConfigured();

  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Auth modal state
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState('login'); // 'login' | 'signup'

  const hasChecked = useRef(false);

  const checkCurrentUser = useCallback(async () => {
    if (!apiAvailable) {
      setIsLoading(false);
      return;
    }

    const token = getAuthToken();
    if (!token) {
      setUser(null);
      setIsConnected(false);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const data = await getMe();
      if (data.authenticated && data.user) {
        setUser(data.user);
        setIsConnected(true);
      } else {
        setUser(null);
        setIsConnected(false);
        clearAuthToken();
      }
    } catch (err) {
      console.warn('Auth check warning:', err.message);
      setUser(null);
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, [apiAvailable]);

  useEffect(() => {
    if (hasChecked.current) return;
    hasChecked.current = true;
    checkCurrentUser();
  }, [checkCurrentUser]);

  const openAuthModal = useCallback((tab = 'login') => {
    setAuthModalTab(tab);
    setAuthError(null);
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
    setAuthError(null);
  }, []);

  const handleSignup = useCallback(async ({ email, password, name }) => {
    setAuthError(null);
    try {
      const res = await signup({ email, password, name });
      setUser(res.user);
      setIsConnected(true);
      setIsAuthModalOpen(false);
      if (onAuthSuccess) onAuthSuccess(res);
      return res;
    } catch (err) {
      setAuthError(err.message);
      throw err;
    }
  }, [onAuthSuccess]);

  const handleLogin = useCallback(async ({ email, password }) => {
    setAuthError(null);
    try {
      const res = await login({ email, password });
      setUser(res.user);
      setIsConnected(true);
      setIsAuthModalOpen(false);
      if (onAuthSuccess) onAuthSuccess(res);
      return res;
    } catch (err) {
      setAuthError(err.message);
      throw err;
    }
  }, [onAuthSuccess]);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setUser(null);
      setIsConnected(false);
      if (onAuthSuccess) onAuthSuccess(null);
    }
  }, [onAuthSuccess]);

  return {
    user,
    isAuthenticated,
    isLoading,
    authError,
    setAuthError,
    isAuthModalOpen,
    authModalTab,
    setAuthModalTab,
    openAuthModal,
    closeAuthModal,
    handleSignup,
    handleLogin,
    handleLogout,
    refreshUser: checkCurrentUser
  };
}
