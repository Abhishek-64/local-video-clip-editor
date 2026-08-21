/**
 * useYouTube — React hook for YouTube connection state and settings
 *
 * Manages:
 * - YouTube account connection status (from Cloudflare Worker / D1)
 * - YouTube upload settings (title template, description, tags, visibility, etc.)
 * - Branding presets (from D1)
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
  getBrandingPresets,
  createBrandingPreset,
  updateBrandingPreset,
  deleteBrandingPreset,
  isApiConfigured
} from '../services/apiService';

// Default YouTube settings (applied when no D1 record exists yet)
const DEFAULT_YT_SETTINGS = {
  yt_title_template: '{movie} - Part {part} | #Shorts',
  yt_description_template: '{movie} - Part {part}\n\nCreated with Local Video Clip Editor\n\n#Shorts',
  yt_tags: ['shorts', 'youtube shorts', 'clips'],
  yt_visibility: 'private',
  yt_category: '22',
  yt_made_for_kids: false,
  yt_notify_subscribers: true,
  yt_default_upload: 'manual', // 'manual' | 'auto'
  schedule_interval: '1day',
  schedule_base_time: '20:00',
  schedule_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
};

export function useYouTube() {
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

  // Branding presets state
  const [brandingPresets, setBrandingPresets] = useState([]);
  const [isLoadingPresets, setIsLoadingPresets] = useState(false);

  const hasMounted = useRef(false);

  // ── Fetch account + settings + presets on mount ──────────────────────────────

  const fetchAccountStatus = useCallback(async () => {
    if (!apiAvailable) return;
    setIsLoadingAccount(true);
    setAccountError(null);
    try {
      const data = await getYouTubeAccount();
      setIsConnected(data.connected);
      setYtAccount(data.account);
    } catch (err) {
      setAccountError(err.message);
      setIsConnected(false);
      setYtAccount(null);
    } finally {
      setIsLoadingAccount(false);
    }
  }, [apiAvailable]);

  const fetchSettings = useCallback(async () => {
    if (!apiAvailable) return;
    setIsLoadingSettings(true);
    try {
      const data = await getSettings();
      setYtSettings({
        ...DEFAULT_YT_SETTINGS,
        ...data,
        // Ensure tags is always an array
        yt_tags: Array.isArray(data.yt_tags) ? data.yt_tags : DEFAULT_YT_SETTINGS.yt_tags
      });
    } catch (err) {
      // Non-fatal — use defaults
      console.warn('Could not load YouTube settings:', err.message);
    } finally {
      setIsLoadingSettings(false);
    }
  }, [apiAvailable]);

  const fetchBrandingPresets = useCallback(async () => {
    if (!apiAvailable) return;
    setIsLoadingPresets(true);
    try {
      const presets = await getBrandingPresets();
      setBrandingPresets(presets || []);
    } catch (err) {
      console.warn('Could not load branding presets:', err.message);
    } finally {
      setIsLoadingPresets(false);
    }
  }, [apiAvailable]);

  useEffect(() => {
    if (hasMounted.current) return;
    hasMounted.current = true;

    if (!apiAvailable) return;

    fetchAccountStatus();
    fetchSettings();
    fetchBrandingPresets();

    // Check for OAuth callback params in URL
    const params = new URLSearchParams(window.location.search);
    if (params.get('yt_connected') === '1') {
      fetchAccountStatus();
      // Clean URL without reloading
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('yt_error')) {
      setAccountError(decodeURIComponent(params.get('yt_error')));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [apiAvailable, fetchAccountStatus, fetchSettings, fetchBrandingPresets]);

  // ── Connect / Disconnect ─────────────────────────────────────────────────────

  /**
   * Initiates YouTube OAuth by navigating to the Worker's connect URL.
   * The user is redirected to Google, then back to the frontend with ?yt_connected=1
   */
  const connectYouTube = useCallback(() => {
    const url = getYouTubeConnectUrl();
    if (!url) {
      setAccountError('API URL is not configured. Set VITE_API_URL in your .env file.');
      return;
    }
    window.location.href = url;
  }, []);

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

  // ── Branding Presets ─────────────────────────────────────────────────────────

  const addBrandingPreset = useCallback(async (data) => {
    if (!apiAvailable) return;
    const preset = await createBrandingPreset(data);
    setBrandingPresets(prev => [...prev, { ...data, ...preset }]);
    return preset;
  }, [apiAvailable]);

  const editBrandingPreset = useCallback(async (id, data) => {
    if (!apiAvailable) return;
    await updateBrandingPreset(id, data);
    setBrandingPresets(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
  }, [apiAvailable]);

  const removeBrandingPreset = useCallback(async (id) => {
    if (!apiAvailable) return;
    await deleteBrandingPreset(id);
    setBrandingPresets(prev => prev.filter(p => p.id !== id));
  }, [apiAvailable]);

  // ── Template Rendering ────────────────────────────────────────────────────────

  /**
   * Render a YouTube title or description template with actual values.
   * {movie} → movie name, {part} → zero-padded part number
   */
  const renderTemplate = useCallback((template, { movieName, partNumber, zeroPad = true }) => {
    const partStr = zeroPad ? String(partNumber).padStart(2, '0') : String(partNumber);
    return (template || '')
      .replace(/\{movie\}/gi, movieName || 'My Movie')
      .replace(/\{part\}/gi, partStr);
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
    refreshAccount: fetchAccountStatus,

    // Settings
    ytSettings,
    isLoadingSettings,
    isSavingSettings,
    updateYtSettings,
    persistSettings,

    // Branding presets
    brandingPresets,
    isLoadingPresets,
    addBrandingPreset,
    editBrandingPreset,
    removeBrandingPreset,
    fetchBrandingPresets,

    // Utilities
    renderTemplate
  };
}
