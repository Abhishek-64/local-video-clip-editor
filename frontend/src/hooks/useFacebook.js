/**
 * useFacebook — React Hook for Meta Graph API v21.0 & Facebook Page/Reels Upload
 *
 * Manages:
 * - Facebook Page OAuth & Active Page Selection
 * - Template tokens for Facebook Captions & Hashtags
 * - End-to-end publishing pipeline: Client -> Backblaze B2 -> Meta Graph API -> B2 Cleanup
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getFacebookAccount,
  selectFacebookPage,
  connectFacebookPageById,
  disconnectFacebookAccount,
  debugFacebookPage,
  getB2UploadTarget,
  uploadToB2,
  publishToFacebook,
  getFacebookJobs,
  isApiConfigured
} from '../services/apiService';

const FB_SETTINGS_STORAGE_KEY = 'video_clip_editor_fb_settings';

const DEFAULT_FB_SETTINGS = {
  fb_name: '',
  fb_start_part: 1,
  fb_zero_pad: true,
  fb_content_type: 'reel', // 'reel' | 'video'
  fb_caption_template: '{movie} - Part {part}\n\n#Reels #Shorts\n\n{hashtags}',
  fb_title_template: '{movie} - Part {part} | #Reels',
  fb_tags: ['reels', 'facebookreels', 'viral', 'clips', 'shorts'],
  fb_schedule_mode: 'now', // 'now' | 'schedule'
  fb_schedule_time: ''
};

function loadStoredFbSettings() {
  try {
    const raw = localStorage.getItem(FB_SETTINGS_STORAGE_KEY);
    return raw ? { ...DEFAULT_FB_SETTINGS, ...JSON.parse(raw) } : DEFAULT_FB_SETTINGS;
  } catch {
    return DEFAULT_FB_SETTINGS;
  }
}

export function useFacebook({ isAuthenticated = false } = {}) {
  const [fbAccount, setFbAccount] = useState(null);
  const [availablePages, setAvailablePages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isUserConnected, setIsUserConnected] = useState(false);
  const [isPageConnected, setIsPageConnected] = useState(false);
  const [isLoadingAccount, setIsLoadingAccount] = useState(false);
  const [accountError, setAccountError] = useState(null);

  // Manual Page Connection State
  const [isConnectingPage, setIsConnectingPage] = useState(false);
  const [pageConnectError, setPageConnectError] = useState(null);

  // Facebook Publishing Settings (persisted locally)
  const [fbSettings, setFbSettings] = useState(loadStoredFbSettings);

  // Publishing Execution State
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState(0);
  const [publishStage, setPublishStage] = useState(''); // 'b2_upload' | 'fb_processing' | 'cleanup' | 'done' | 'error'
  const [publishError, setPublishError] = useState(null);
  const [lastPublishedPost, setLastPublishedPost] = useState(null);

  // Job History
  const [fbJobs, setFbJobs] = useState([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);

  const apiAvailable = isApiConfigured();

  const updateFbSettings = useCallback((updates) => {
    setFbSettings(prev => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem(FB_SETTINGS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // ── Load Account Info ────────────────────────────────────────────────────────

  const refreshFbAccount = useCallback(async () => {
    if (!apiAvailable) return;
    setIsLoadingAccount(true);
    setAccountError(null);
    try {
      const res = await getFacebookAccount();
      if (res && res.account) {
        const hasActivePage = Boolean(res.isPageConnected || (res.account.page_id && res.account.page_name));
        const hasUser = Boolean(res.isUserConnected || res.account.fb_user_name);

        setFbAccount(res.account);
        setAvailablePages(res.availablePages || []);
        setIsUserConnected(hasUser);
        setIsPageConnected(hasActivePage);
        setIsConnected(hasActivePage);
      } else {
        setFbAccount(null);
        setAvailablePages([]);
        setIsUserConnected(false);
        setIsPageConnected(false);
        setIsConnected(false);
      }
    } catch (err) {
      setAccountError(err.message);
      setIsUserConnected(false);
      setIsPageConnected(false);
      setIsConnected(false);
    } finally {
      setIsLoadingAccount(false);
    }
  }, [apiAvailable]);

  useEffect(() => {
    refreshFbAccount();
  }, [refreshFbAccount, isAuthenticated]);

  // ── Connect Facebook via Popup ───────────────────────────────────────────────

  const connectFacebook = useCallback(() => {
    if (!apiAvailable) {
      alert('Backend API is not configured.');
      return;
    }

    const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
    const frontendUrl = window.location.origin;
    const connectUrl = `${apiUrl}/api/facebook/connect?frontendUrl=${encodeURIComponent(frontendUrl)}&popup=1`;

    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      connectUrl,
      'facebook_oauth',
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,status=yes`
    );

    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      window.location.href = connectUrl;
      return;
    }

    const handleMessage = (event) => {
      if (event.data && event.data.type === 'FACEBOOK_AUTH_RESULT') {
        window.removeEventListener('message', handleMessage);
        if (event.data.success) {
          refreshFbAccount();
        } else {
          setAccountError(event.data.error || 'Failed to connect Facebook account.');
        }
      }
    };

    window.addEventListener('message', handleMessage);

    // Fallback interval to check if popup closed
    const timer = setInterval(() => {
      if (popup && popup.closed) {
        clearInterval(timer);
        window.removeEventListener('message', handleMessage);
        refreshFbAccount();
      }
    }, 1000);
  }, [apiAvailable, refreshFbAccount]);

  // ── Manually Connect Page by Page ID ─────────────────────────────────────────

  const connectPageById = useCallback(async (pageId) => {
    const cleanId = String(pageId || '').trim();
    if (!cleanId) {
      setPageConnectError('Please enter a valid Facebook Page ID.');
      return false;
    }
    setIsConnectingPage(true);
    setPageConnectError(null);
    try {
      const res = await connectFacebookPageById({ pageId: cleanId });
      if (res && res.success) {
        await refreshFbAccount();
        return true;
      }
      return false;
    } catch (err) {
      setPageConnectError(err.message || 'This Facebook Page is not accessible by the connected Facebook account.');
      return false;
    } finally {
      setIsConnectingPage(false);
    }
  }, [refreshFbAccount]);

  // ── Safe Page Diagnostics ───────────────────────────────────────────────────

  const checkPageDiagnostics = useCallback(async () => {
    try {
      return await debugFacebookPage();
    } catch (err) {
      return { connected: false, can_publish: false, error: err.message };
    }
  }, []);

  // ── Switch Active Facebook Page ──────────────────────────────────────────────

  const switchPage = useCallback(async (pageId) => {
    if (!pageId) return;
    try {
      await selectFacebookPage(pageId);
      await refreshFbAccount();
    } catch (err) {
      setAccountError(err.message);
    }
  }, [refreshFbAccount]);

  // ── Disconnect Facebook ──────────────────────────────────────────────────────

  const disconnectFacebook = useCallback(async () => {
    try {
      await disconnectFacebookAccount();
      setFbAccount(null);
      setAvailablePages([]);
      setIsConnected(false);
      setIsUserConnected(false);
      setIsPageConnected(false);
    } catch (err) {
      console.error('Failed to disconnect Facebook:', err);
    }
  }, []);

  // ── Template Token Renderer ──────────────────────────────────────────────────

  const renderFbTemplate = useCallback((templateStr, {
    movieName = 'My Movie',
    partNumber = 1,
    zeroPad = true,
    tags = []
  } = {}) => {
    if (!templateStr) return '';
    const partFormatted = zeroPad ? String(partNumber).padStart(2, '0') : String(partNumber);
    const activeTags = (tags && tags.length > 0) ? tags : (fbSettings.fb_tags || []);
    const hashtagsFormatted = activeTags.map(t => `#${t.replace(/^#+/, '')}`).join(' ');

    return templateStr
      .replace(/\{movie\}/gi, movieName)
      .replace(/\{title\}/gi, movieName)
      .replace(/\{text\}/gi, movieName)
      .replace(/\{part\}/gi, partFormatted)
      .replace(/\{hashtags\}/gi, hashtagsFormatted)
      .replace(/\{tags\}/gi, activeTags.join(', '));
  }, [fbSettings.fb_tags]);

  // ── End-to-End Publish Pipeline ──────────────────────────────────────────────

  const publishToFacebookPipeline = useCallback(async (blobOrOptions, maybeOptions = {}) => {
    let videoBlob = blobOrOptions;
    let opts = maybeOptions || {};

    // Support both publishToFacebookPipeline(blob, opts) and publishToFacebookPipeline({ videoBlob, ...opts })
    if (blobOrOptions && !(blobOrOptions instanceof Blob) && blobOrOptions.videoBlob instanceof Blob) {
      videoBlob = blobOrOptions.videoBlob;
      opts = blobOrOptions;
    }

    const {
      contentType = 'reel', // 'reel' | 'video'
      caption = '',
      title = '',
      hashtags = [],
      scheduledAt = null,
      fileName = 'clip.mp4',
      pageId = null
    } = opts;

    if (!videoBlob || !(videoBlob instanceof Blob)) {
      throw new Error('No valid video blob available to publish.');
    }

    if (!isConnected || !fbAccount) {
      throw new Error('Please connect your Facebook Page before publishing.');
    }

    setIsPublishing(true);
    setPublishProgress(0);
    setPublishError(null);
    setLastPublishedPost(null);

    const tempFileName = `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    try {
      // Step 1: Obtain Backblaze B2 Upload Endpoint
      setPublishStage('b2_upload');
      const target = await getB2UploadTarget();
      if (!target || !target.uploadUrl) {
        throw new Error('Failed to obtain Backblaze B2 upload target.');
      }

      // Step 2: Upload Video to Backblaze B2 with progress tracking
      const b2Res = await uploadToB2(
        target.uploadUrl,
        target.authorizationToken,
        videoBlob,
        tempFileName,
        (percent) => {
          setPublishProgress(percent);
        }
      );

      const b2FileId = b2Res.fileId || tempFileName;
      const b2FileName = b2Res.fileName || tempFileName;

      // Step 3: Trigger Meta Graph API Ingestion via Cloudflare Worker
      setPublishStage('fb_processing');
      setPublishProgress(100);

      const publishResult = await publishToFacebook({
        contentType,
        b2FileId,
        b2FileName,
        caption,
        title,
        hashtags,
        scheduledAt,
        pageId: pageId || fbAccount.page_id
      });

      if (!publishResult || !publishResult.success) {
        throw new Error(publishResult?.error || 'Facebook publishing failed.');
      }

      setPublishStage('done');
      setLastPublishedPost({
        videoId: publishResult.videoId,
        postUrl: publishResult.postUrl,
        status: publishResult.status,
        scheduledAt
      });

      return publishResult;
    } catch (err) {
      console.error('Facebook publish pipeline error:', err);
      setPublishStage('error');
      setPublishError(err.message);
      throw err;
    } finally {
      setIsPublishing(false);
    }
  }, [isConnected, fbAccount]);

  return {
    fbAccount,
    availablePages,
    isConnected,
    isUserConnected,
    isPageConnected,
    isLoadingAccount,
    accountError,
    connectFacebook,
    connectPageById,
    isConnectingPage,
    pageConnectError,
    setPageConnectError,
    switchPage,
    disconnectFacebook,
    refreshFbAccount,
    checkPageDiagnostics,
    fbSettings,
    updateFbSettings,
    renderFbTemplate,
    publishToFacebookPipeline,
    isPublishing,
    publishProgress,
    publishStage,
    publishError,
    lastPublishedPost,
    apiAvailable
  };
}
