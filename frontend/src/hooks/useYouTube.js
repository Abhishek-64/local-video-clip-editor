/**
 * useYouTube — React hook for YouTube connection state and live settings
 *
 * Manages:
 * - YouTube account connection status (from Cloudflare Worker / D1)
 * - YouTube upload settings (title template, description, tags, visibility, etc.)
 *   applied directly in real-time to all render & upload pipelines, persisted in localStorage.
 * - OAuth connect/disconnect flow
 *
 * If VITE_API_URL is not set, the hook gracefully degrades:
 * all YouTube features are disabled, existing local features work unchanged.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getYouTubeAccount,
  getYouTubeConnectUrl,
  disconnectYouTube,
  isApiConfigured,
  setClientUserId
} from '../services/apiService';
import { formatTagsAsHashtagString, parseTagsInput } from '../utils/titleCleaner';

const STORAGE_KEY = 'yt_editor_settings';

// Default YouTube settings (applied directly to uploads)
const DEFAULT_YT_SETTINGS = {
  yt_name: 'My Movie',
  yt_start_part: 1,
  yt_zero_pad: true,
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

function getInitialYtSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...DEFAULT_YT_SETTINGS,
        ...parsed,
        yt_tags: Array.isArray(parsed.yt_tags) && parsed.yt_tags.length > 0
          ? parseTagsInput(parsed.yt_tags)
          : DEFAULT_YT_SETTINGS.yt_tags
      };
    }
  } catch (e) {
    console.warn('Could not parse saved YouTube settings from localStorage:', e);
  }
  return DEFAULT_YT_SETTINGS;
}

export function useYouTube({ isAuthenticated = false } = {}) {
  const apiAvailable = isApiConfigured();

  // Connection state
  const [ytAccount, setYtAccount] = useState(null);     // null = disconnected
  const [isConnected, setIsConnected] = useState(false);
  const [isLoadingAccount, setIsLoadingAccount] = useState(false);
  const [accountError, setAccountError] = useState(null);

  // Settings state (applied directly in memory & synced with localStorage)
  const [ytSettings, setYtSettings] = useState(getInitialYtSettings);

  const clearYouTubeState = useCallback(() => {
    setYtAccount(null);
    setIsConnected(false);
    setAccountError(null);
  }, []);

  // ── Fetch account on mount / auth change ─────────────────────────────────────

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

  useEffect(() => {
    if (!isAuthenticated) {
      clearYouTubeState();
      return;
    }

    fetchAccountStatus();

    // Check for OAuth callback params in URL (if opened via direct redirect)
    const params = new URLSearchParams(window.location.search);
    if (params.get('yt_connected') === '1') {
      fetchAccountStatus();
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    }
    if (params.get('yt_error')) {
      setAccountError(decodeURIComponent(params.get('yt_error')));
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    }
  }, [isAuthenticated, fetchAccountStatus, clearYouTubeState]);

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
      }
    }, 1000);
  }, [fetchAccountStatus]);

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

  // ── Settings (Direct live updates + client-side persistence) ─────────────────

  const updateYtSettings = useCallback((updates) => {
    setYtSettings(prev => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.warn('Could not persist YouTube settings to localStorage:', e);
      }
      return next;
    });
  }, []);

  // ── Template Rendering ────────────────────────────────────────────────────────

  /**
   * Render a YouTube title or description template with actual values.
   * {movie} → movie name, {part} → zero-padded part number
   * {hashtags} → #Shorts #Viral #Tag
   * {tags} → shorts, viral, tag
   */
  const renderTemplate = useCallback((template, { movieName, partNumber, zeroPad, tags } = {}) => {
    const isZeroPad = zeroPad !== undefined ? zeroPad : (ytSettings?.yt_zero_pad !== false);
    const num = partNumber != null ? partNumber : (ytSettings?.yt_start_part || 1);
    const partStr = isZeroPad ? String(num).padStart(2, '0') : String(num);

    // Resolve tags: use explicitly passed tags if non-empty, otherwise use ytSettings.yt_tags, otherwise default hashtags
    const tagSource = (tags && tags.length > 0)
      ? tags
      : (Array.isArray(ytSettings?.yt_tags) && ytSettings.yt_tags.length > 0
          ? ytSettings.yt_tags
          : ['shorts', 'viral', 'clips']);
    const cleanTagArray = parseTagsInput(tagSource);
    let hashtagsStr = formatTagsAsHashtagString(cleanTagArray);
    if (!hashtagsStr) {
      hashtagsStr = '#Shorts #Viral';
    }
    const tagsStr = cleanTagArray.join(', ');
    const finalMovie = movieName || ytSettings?.yt_name || 'My Movie';

    let rendered = (template || '{movie} - Part {part}\n\n#Shorts\n\n{hashtags}')
      .replace(/\{movie\}/gi, finalMovie)
      .replace(/\{title\}/gi, finalMovie)
      .replace(/\{text\}/gi, finalMovie)
      .replace(/\{part\}/gi, partStr)
      .replace(/\{hashtags\}/gi, hashtagsStr)
      .replace(/\{tags\}/gi, tagsStr);

    return rendered;
  }, [ytSettings?.yt_name, ytSettings?.yt_start_part, ytSettings?.yt_zero_pad, ytSettings?.yt_tags]);

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

    // Settings (Direct live applied)
    ytSettings,
    updateYtSettings,

    // Utilities
    renderTemplate
  };
}
