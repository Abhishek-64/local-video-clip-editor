/**
 * useYouTube — React hook for YouTube connection state and settings
 *
 * Manages:
 * - YouTube account connection status (from Cloudflare Worker / D1)
 * - YouTube upload settings (title template, description, tags, visibility, etc.)
 * - OAuth connect/disconnect flow
 *
 * If VITE_API_URL is not set, the hook gracefully degrades:
 * all YouTube features are disabled, existing local features work unchanged.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getYouTubeAccount,
  getYouTubeConnectUrl,
  disconnectYouTube,
  getSettings,
  saveSettings,
  isApiConfigured,
  setClientUserId
} from '../services/apiService';
import { formatTagsAsHashtagString, parseTagsInput } from '../utils/titleCleaner';

// Default YouTube settings (applied when no D1 record exists yet)
const DEFAULT_YT_SETTINGS = {
  yt_title_template: '{movie} - Part {part} | #Shorts',
  yt_description_template: '{movie} - Part {part}\n\n#Shorts\n\n{hashtags}',
  yt_tags: ['shorts', 'youtube shorts', 'clips', 'viral', 'fyp'],
  yt_visibility: 'private',
  yt_category: '22',
  yt_made_for_kids: false,
  yt_notify_subscribers: true,
  yt_default_upload: 'manual', // 'manual' | 'auto'
  schedule_interval: '1hour',
  schedule_base_time: '20:00',
  schedule_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
};

export function useYouTube({ isAuthenticated = false } = {}) {
  const apiAvailable = isApiConfigured();

  // Connection state
  const [ytAccount, setYtAccount] = useState(null);     // null = disconnected
  const [isConnected, setIsConnected] = useState(false);
  const [isLoadingAccount, setIsLoadingAccount] = useState(false);
  const [accountError, setAccountError] = useState(null);

  // Settings state
  const [ytSettings, setYtSettings] = useState(DEFAULT_YT_SETTINGS);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const clearYouTubeState = useCallback(() => {
    setYtAccount(null);
    setIsConnected(false);
    setAccountError(null);
    setYtSettings(DEFAULT_YT_SETTINGS);
  }, []);

  // ── Fetch account + settings on mount / auth change ─────────────────────────

  const fetchAccountStatus = useCallback(async () => {
    if (!apiAvailable || !isAuthenticated) return;
    setIsLoadingAccount(true);
    setAccountError(null);
    try {
      const data = await getYouTubeAccount();
      if (data?.connected && data.account) {
        setYtAccount(data.account);
        setIsConnected(true);
      } else {
        setYtAccount(null);
        setIsConnected(false);
      }
    } catch (err) {
      console.warn('Could not fetch YouTube account status:', err.message);
      setYtAccount(null);
      setIsConnected(false);
    } finally {
      setIsLoadingAccount(false);
    }
  }, [apiAvailable, isAuthenticated]);

  const fetchSettings = useCallback(async () => {
    if (!apiAvailable || !isAuthenticated) return;
    setIsLoadingSettings(true);
    try {
      const data = await getSettings();
      setYtSettings({
        ...DEFAULT_YT_SETTINGS,
        ...data,
        // Ensure tags is always an array of clean strings
        yt_tags: Array.isArray(data.yt_tags) && data.yt_tags.length > 0
          ? parseTagsInput(data.yt_tags)
          : DEFAULT_YT_SETTINGS.yt_tags
      });
    } catch (err) {
      console.warn('Could not load YouTube settings:', err.message);
    } finally {
      setIsLoadingSettings(false);
    }
  }, [apiAvailable, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      clearYouTubeState();
      return;
    }

    fetchAccountStatus();
    fetchSettings();

    // Check for OAuth callback params in URL (if opened via direct redirect)
    const params = new URLSearchParams(window.location.search);
    if (params.get('yt_connected') === '1') {
      fetchAccountStatus();
      fetchSettings();
      // Clean URL without reloading
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    }
    if (params.get('yt_error')) {
      setAccountError(decodeURIComponent(params.get('yt_error')));
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    }
  }, [isAuthenticated, fetchAccountStatus, fetchSettings, clearYouTubeState]);

  // ── Connect / Disconnect ─────────────────────────────────────────────────────

  /**
   * Initiates YouTube OAuth in a popup window to prevent main page reload.
   * Preserves all in-memory editor states (video, clips, subtitles, etc.).
   */
  const connectYouTube = useCallback(() => {
    const currentFrontend = window.location.origin;
    const url = getYouTubeConnectUrl({ popup: true, frontendUrl: currentFrontend });
    if (!url) {
      setAccountError('API URL is not configured. Set VITE_API_URL in your .env file.');
      return;
    }

    const width = 580;
    const height = 680;
    const left = Math.max(0, (window.screen.width - width) / 2);
    const top = Math.max(0, (window.screen.height - height) / 2);

    const popup = window.open(
      url,
      'youtube_oauth_popup',
      `width=${width},height=${height},top=${top},left=${left},status=no,menubar=no,toolbar=no`
    );

    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      // If browser blocked popup, fallback to redirect
      window.location.href = url;
      return;
    }

    try {
      popup.focus();
    } catch {}

    const handleAuthMessage = (event) => {
      if (event.data?.type === 'YOUTUBE_AUTH_SUCCESS') {
        window.removeEventListener('message', handleAuthMessage);
        if (event.data.userId) {
          setClientUserId(event.data.userId);
        }
        fetchAccountStatus();
        fetchSettings();
      } else if (event.data?.type === 'YOUTUBE_AUTH_ERROR') {
        window.removeEventListener('message', handleAuthMessage);
        setAccountError(event.data.error || 'Failed to connect YouTube account');
      }
    };

    window.addEventListener('message', handleAuthMessage);

    // Watch for popup close
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', handleAuthMessage);
        // Refresh status once popup is closed
        fetchAccountStatus();
        fetchSettings();
      }
    }, 1000);
  }, [fetchAccountStatus, fetchSettings]);

  const disconnectYouTubeAccount = useCallback(async () => {
    if (!apiAvailable) return;
    try {
      await disconnectYouTube();
      setIsConnected(false);
      setYtAccount(null);
    } catch (err) {
      setAccountError(err.message);
    }
  }, [apiAvailable]);

  // ── Settings ─────────────────────────────────────────────────────────────────

  const updateYtSettings = useCallback((updates) => {
    setYtSettings(prev => ({ ...prev, ...updates }));
  }, []);

  const persistSettings = useCallback(async (overrides) => {
    if (!apiAvailable) return;
    setIsSavingSettings(true);
    try {
      const toSave = { ...ytSettings, ...overrides };
      await saveSettings(toSave);
    } catch (err) {
      console.error('Failed to save YouTube settings:', err);
      throw err;
    } finally {
      setIsSavingSettings(false);
    }
  }, [apiAvailable, ytSettings]);

  // ── Template Rendering ────────────────────────────────────────────────────────

  /**
   * Render a YouTube title or description template with actual values.
   * {movie} → movie name, {part} → zero-padded part number
   * {hashtags} → #Shorts #Viral #Tag
   * {tags} → shorts, viral, tag
   */
  const renderTemplate = useCallback((template, { movieName, partNumber, zeroPad = true, tags = [] }) => {
    const partStr = zeroPad ? String(partNumber).padStart(2, '0') : String(partNumber);
    const cleanTagArray = parseTagsInput(tags);
    const hashtagsStr = formatTagsAsHashtagString(cleanTagArray);
    const tagsStr = cleanTagArray.join(', ');

    return (template || '')
      .replace(/\{movie\}/gi, movieName || 'My Movie')
      .replace(/\{part\}/gi, partStr)
      .replace(/\{hashtags\}/gi, hashtagsStr)
      .replace(/\{tags\}/gi, tagsStr);
  }, []);

  return {
    // API availability
    apiAvailable,

    // Account
    ytAccount,
    isConnected,
    isLoadingAccount,
    accountError,
    connectYouTube,
    disconnectYouTubeAccount,
    clearYouTubeState,
    refreshAccount: fetchAccountStatus,

    // Settings
    ytSettings,
    isLoadingSettings,
    isSavingSettings,
    updateYtSettings,
    persistSettings,

    // Utilities
    renderTemplate
  };
}
