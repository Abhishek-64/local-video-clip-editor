/**
 * Meta Graph API v26.0 Helper for Cloudflare Worker
 * Handles Facebook Page OAuth, automated Page discovery, Reels Publishing, Page Video uploads, and Diagnostics.
 *
 * Strict Architecture:
 * - Meta OAuth requests only necessary Page publishing scopes (pages_show_list, pages_read_engagement, pages_manage_posts, public_profile).
 * - Page Access Tokens are retrieved strictly from Meta via /me/accounts.
 * - Manual token entry is completely prohibited.
 * - Sensitive tokens are encrypted server-side and never returned to the frontend.
 */

import { signOAuthState, decryptToken } from './crypto.js';
import { b2GetDownloadUrl, b2DeleteFile } from './b2.js';
import {
  updateFacebookUploadJob,
  claimDueFacebookJob,
  getDueFacebookJobs,
  getProcessingFacebookJobs,
  getStuckUploadingFacebookJobs,
  isB2FileNeededByOtherJobs
} from './db.js';

const GRAPH_BASE = 'https://graph.facebook.com';

export function getGraphVersion(env) {
  return env.META_GRAPH_API_VERSION || 'v26.0';
}

/**
 * Canonical redirect URI for Facebook OAuth.
 */
export function getFacebookRedirectUri(env) {
  const base = (env.APP_URL || '').replace(/\/$/, '');
  return `${base}/api/facebook/callback`;
}

/**
 * Build Facebook OAuth Dialog URL
 */
export async function buildFacebookAuthUrl(env, userId, frontendUrl = null, isPopup = false) {
  const version = getGraphVersion(env);
  const redirectUri = getFacebookRedirectUri(env);
  const secretKey = env.ENCRYPTION_KEY || env.FACEBOOK_APP_SECRET || 'oauth-state-secret-salt-2026';

  const state = await signOAuthState(
    {
      userId,
      frontendUrl,
      isPopup: Boolean(isPopup),
      provider: 'facebook'
    },
    secretKey
  );

  const scopes = [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
    'public_profile'
  ].join(',');

  const params = new URLSearchParams({
    client_id: env.FACEBOOK_APP_ID,
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
    scope: scopes,
    auth_type: 'rerequest'
  });

  return `https://www.facebook.com/${version}/dialog/oauth?${params.toString()}`;
}

/**
 * Exchange OAuth Code for User Access Token and upgrade to Long-Lived Token (~60 days)
 */
export async function exchangeFacebookCodeForTokens(env, code) {
  const version = getGraphVersion(env);
  const redirectUri = getFacebookRedirectUri(env);

  // Step 1: Exchange code for short-lived user token
  const tokenUrl = `${GRAPH_BASE}/${version}/oauth/access_token?` + new URLSearchParams({
    client_id: env.FACEBOOK_APP_ID,
    client_secret: env.FACEBOOK_APP_SECRET,
    redirect_uri: redirectUri,
    code
  }).toString();

  const res = await fetch(tokenUrl);
  if (!res.ok) {
    const errText = await res.text();
    console.error('[FB Graph API] Step 1 token exchange failed. Status:', res.status, 'Response:', errText);
    throw new Error(`Facebook token exchange failed (${res.status}): ${errText}`);
  }

  const shortTokenData = await res.json();
  const shortUserToken = shortTokenData.access_token;

  // Step 2: Exchange for Long-Lived User Token
  const longLivedUrl = `${GRAPH_BASE}/${version}/oauth/access_token?` + new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: env.FACEBOOK_APP_ID,
    client_secret: env.FACEBOOK_APP_SECRET,
    fb_exchange_token: shortUserToken
  }).toString();

  const longLivedRes = await fetch(longLivedUrl);
  let userAccessToken = shortUserToken;
  if (longLivedRes.ok) {
    const longLivedData = await longLivedRes.json();
    if (longLivedData.access_token) {
      userAccessToken = longLivedData.access_token;
    }
  } else {
    console.warn('[FB Graph API] Step 2 long-lived token exchange warning:', await longLivedRes.text());
  }

  return { userAccessToken };
}

/**
 * Fetch User Profile and all managed Facebook Pages with Meta-issued Page Access Tokens
 */
export async function fetchFacebookPages(env, userAccessToken) {
  const version = getGraphVersion(env);

  // 1. Fetch user profile
  const userRes = await fetch(`${GRAPH_BASE}/${version}/me?fields=id,name&access_token=${userAccessToken}`);
  let fbUser = { id: null, name: null };
  if (userRes.ok) {
    fbUser = await userRes.json();
  }

  // 2. Fetch user's managed Facebook Pages from Meta /me/accounts
  const accountsUrl = `${GRAPH_BASE}/${version}/me/accounts?fields=id,name,access_token,category,picture{url},tasks&limit=100&access_token=${userAccessToken}`;
  const accountsRes = await fetch(accountsUrl);

  if (!accountsRes.ok) {
    const errText = await accountsRes.text();
    console.error('[FB Graph API] Accounts fetch failed. Status:', accountsRes.status, 'Response:', errText);
    throw new Error(`Failed to fetch Facebook Pages (${accountsRes.status}): ${errText}`);
  }

  const accountsData = await accountsRes.json();
  const rawPages = accountsData.data || [];

  const pages = rawPages.map(page => ({
    page_id: String(page.id),
    page_name: page.name,
    page_category: page.category || 'Creator Page',
    page_thumbnail: page.picture?.data?.url || null,
    page_access_token: page.access_token || '',
    tasks: page.tasks || []
  }));

  return {
    fbUser,
    pages
  };
}

/**
 * Validate that a submitted Page ID belongs to the authenticated Facebook user
 * and retrieve its verified Page Access Token issued by Meta.
 */
export async function validateAndGetPageToken(env, userAccessToken, targetPageId) {
  const version = getGraphVersion(env);
  const cleanPageId = String(targetPageId || '').trim();

  if (!cleanPageId) {
    throw new Error('Facebook Page ID is required.');
  }

  // Fetch current accessible pages from Meta /me/accounts
  const { pages } = await fetchFacebookPages(env, userAccessToken);
  const match = pages.find(p => String(p.page_id).trim() === cleanPageId);

  if (!match) {
    const err = new Error('This Facebook Page is not accessible by the connected Facebook account.');
    err.status = 403;
    throw err;
  }

  if (!match.page_access_token) {
    throw new Error(`Facebook Page "${match.page_name}" (${cleanPageId}) was found, but Meta did not return a Page Access Token. Please re-authenticate with Facebook and make sure "${match.page_name}" is checked in the permissions prompt.`);
  }

  // Verify the Page token with Meta
  const testUrl = `${GRAPH_BASE}/${version}/${cleanPageId}?fields=id,name&access_token=${match.page_access_token}`;
  const testRes = await fetch(testUrl);

  if (!testRes.ok) {
    const errText = await testRes.text();
    console.error('[FB Graph API] Page token verification failed:', errText);
    throw new Error(`Page token verification failed for "${match.page_name}": ${errText}`);
  }

  const pageInfo = await testRes.json();

  return {
    page_id: cleanPageId,
    page_name: pageInfo.name || match.page_name,
    page_category: match.page_category || 'Creator Page',
    page_thumbnail: match.page_thumbnail || null,
    page_access_token: match.page_access_token,
    tasks: match.tasks || []
  };
}

/**
 * Sleep helper for polling delays
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Validate that a Page Access Token strictly belongs to the target Page ID
 */
export async function validatePageTokenMatch(env, pageAccessToken, targetPageId) {
  const version = getGraphVersion(env);
  const cleanTargetId = String(targetPageId || '').trim();

  if (!cleanTargetId || !pageAccessToken) {
    throw new Error('Facebook Page ID and Page Access Token are required.');
  }

  const meUrl = `${GRAPH_BASE}/${version}/me?fields=id,name&access_token=${pageAccessToken}`;
  const meRes = await fetch(meUrl);

  if (!meRes.ok) {
    const errText = await meRes.text();
    let msg = `Page token validation failed with Meta (${meRes.status}): ${errText}`;
    try {
      const parsed = JSON.parse(errText);
      if (parsed?.error?.message) msg = `Meta Token Error: ${parsed.error.message}`;
    } catch {}
    throw new Error(msg);
  }

  const meData = await meRes.json();
  const tokenPageId = String(meData.id || '').trim();
  const tokenPageName = meData.name || 'Facebook Page';

  if (tokenPageId !== cleanTargetId) {
    const mismatchErr = new Error(`Page ID and Page Access Token mismatch: token belongs to Page "${tokenPageName}" (${tokenPageId}) but requested Page is (${cleanTargetId}).`);
    mismatchErr.status = 403;
    throw mismatchErr;
  }

  console.log(`[FB Auth] Authoritative Page verified: pageId=${cleanTargetId}, pageName="${tokenPageName}", version=${version}`);
  return {
    page_id: cleanTargetId,
    page_name: tokenPageName
  };
}

/**
 * Normalizes a Meta video permalink to an absolute, canonical URL
 */
export function normalizeFacebookPermalink(permalinkUrl, videoId) {
  if (!permalinkUrl && !videoId) return null;
  if (!permalinkUrl && videoId) {
    return `https://www.facebook.com/reel/${videoId}/`;
  }
  let cleanUrl = String(permalinkUrl).trim();
  if (cleanUrl.startsWith('/')) {
    cleanUrl = `https://www.facebook.com${cleanUrl}`;
  }
  if (cleanUrl.includes('/reel/') && !cleanUrl.endsWith('/')) {
    cleanUrl = `${cleanUrl}/`;
  }
  return cleanUrl;
}

/**
 * Check the actual processing, publication, and copyright status of a Facebook Reel on Meta
 */
export async function checkFacebookReelStatus(env, pageAccessToken, videoId) {
  const version = getGraphVersion(env);
  const cleanVideoId = String(videoId || '').trim();

  if (!cleanVideoId || !pageAccessToken) {
    throw new Error('Video ID and Page Access Token are required to check Reel status.');
  }

  const url = `${GRAPH_BASE}/${version}/${cleanVideoId}?fields=status,permalink_url,published,privacy,id,created_time,description&access_token=${pageAccessToken}`;
  const res = await fetch(url);

  if (!res.ok) {
    const errText = await res.text();
    let errMsg = `Meta Graph API status check failed (${res.status}): ${errText}`;
    let isExpired = false;
    try {
      const errJson = JSON.parse(errText);
      const code = errJson?.error?.code;
      const subcode = errJson?.error?.error_subcode;
      const message = errJson?.error?.message;
      if (code === 190 || subcode === 460 || (message && message.toLowerCase().includes('session has been invalidated'))) {
        isExpired = true;
        errMsg = 'Meta session expired or invalidated (e.g. password changed). Please re-authenticate Facebook.';
      } else if (message) {
        errMsg = `Meta API Error (#${code}): ${message}`;
      }
    } catch {}

    return {
      videoId: cleanVideoId,
      videoStatus: 'error',
      isComplete: false,
      isProcessing: false,
      isError: true,
      isExpired,
      statusText: errMsg,
      errorDetails: errMsg,
      permalinkUrl: null,
      rawStatus: null
    };
  }

  const data = await res.json();
  const rawStatus = data.status || {};
  const videoStatus = rawStatus.video_status || (data.published ? 'ready' : 'processing');
  const uploadingPhase = rawStatus.uploading_phase || {};
  const processingPhase = rawStatus.processing_phase || {};
  const publishingPhase = rawStatus.publishing_phase || {};
  const copyrightCheck = rawStatus.copyright_check_status || {};

  const isPublishingComplete = publishingPhase.status === 'complete' || publishingPhase.publish_status === 'published';
  const isVideoReady = videoStatus === 'ready';
  const isPublishedBool = Boolean(data.published);

  const isComplete = (isVideoReady && (isPublishingComplete || isPublishedBool)) && videoStatus !== 'error';
  const isError = videoStatus === 'error' || processingPhase.status === 'error' || publishingPhase.status === 'error';
  const isExpired = videoStatus === 'expired';
  const isProcessing = !isComplete && !isError && !isExpired;

  let errorDetails = null;
  if (isError) {
    if (processingPhase.errors && Array.isArray(processingPhase.errors)) {
      errorDetails = processingPhase.errors.join(', ');
    } else if (rawStatus.errors && Array.isArray(rawStatus.errors)) {
      errorDetails = rawStatus.errors.join(', ');
    } else {
      errorDetails = rawStatus.error_description || 'Video transcoding or publishing failed on Meta.';
    }
  }

  const canonicalPermalink = normalizeFacebookPermalink(data.permalink_url, cleanVideoId);

  return {
    videoId: cleanVideoId,
    videoStatus,
    isComplete,
    isProcessing,
    isError,
    isExpired,
    permalinkUrl: canonicalPermalink,
    published: isPublishedBool,
    privacy: data.privacy || null,
    uploadingPhase,
    processingPhase,
    publishingPhase,
    copyrightCheck,
    errorDetails,
    rawStatus
  };
}

/**
 * Poll Meta Graph API until Reel processing completes or fails
 */
export async function pollFacebookReelStatus(env, pageAccessToken, videoId, {
  maxAttempts = 5,
  initialDelayMs = 2500,
  backoffMs = 1000
} = {}) {
  let attempt = 0;
  let currentDelay = initialDelayMs;
  let lastStatus = null;

  while (attempt < maxAttempts) {
    attempt++;
    await sleep(currentDelay);
    currentDelay += backoffMs;

    lastStatus = await checkFacebookReelStatus(env, pageAccessToken, videoId);
    console.log(`[FB Reels] Status poll attempt ${attempt}/${maxAttempts}: videoId=${videoId}, video_status=${lastStatus.videoStatus}, isComplete=${lastStatus.isComplete}`);

    if (lastStatus.isComplete) {
      return lastStatus;
    }

    if (lastStatus.isError) {
      throw new Error(`Facebook Reel processing failed on Meta: ${lastStatus.errorDetails || 'Video rejected during processing.'}`);
    }

    if (lastStatus.isExpired) {
      throw new Error('Facebook Reel upload session expired on Meta.');
    }
  }

  console.log(`[FB Reels] Polling window elapsed (${maxAttempts} attempts). Reel is still processing in background on Meta (videoId=${videoId}).`);
  return lastStatus;
}

/**
 * Safe Page diagnostics check (verifies Page Access Token without exposing secrets)
 */
export async function verifyPagePublishCapability(env, pageAccessToken, pageId, targetVideoId = null) {
  const version = getGraphVersion(env);
  const cleanPageId = String(pageId || '').trim();

  if (!pageAccessToken || !cleanPageId) {
    return {
      connected: false,
      page_id: cleanPageId || null,
      page_name: null,
      has_page_access_token: false,
      can_publish: false,
      error: 'Missing Page Access Token or Page ID'
    };
  }

  try {
    const testUrl = `${GRAPH_BASE}/${version}/${cleanPageId}?fields=id,name,tasks&access_token=${pageAccessToken}`;
    const res = await fetch(testUrl);

    if (!res.ok) {
      const errText = await res.text();
      let errorMsg = `Meta API error (${res.status})`;
      let isTokenExpired = false;
      try {
        const errJson = JSON.parse(errText);
        const code = errJson?.error?.code;
        const subcode = errJson?.error?.error_subcode;
        const msg = errJson?.error?.message;
        if (code === 190 || subcode === 460 || (msg && msg.toLowerCase().includes('session has been invalidated'))) {
          isTokenExpired = true;
          errorMsg = 'Meta session expired or invalidated (e.g. password changed). Please re-authenticate Facebook.';
        } else {
          errorMsg = msg || errorMsg;
        }
      } catch {}

      return {
        connected: false,
        page_id: cleanPageId,
        page_name: null,
        has_page_access_token: true,
        can_publish: false,
        token_expired: isTokenExpired,
        error: errorMsg
      };
    }

    const data = await res.json();
    const result = {
      connected: true,
      page_id: cleanPageId,
      page_name: data.name || 'Facebook Page',
      tasks: data.tasks || [],
      has_page_access_token: true,
      can_publish: true,
      graph_version: version
    };

    if (targetVideoId) {
      try {
        const reelStatus = await checkFacebookReelStatus(env, pageAccessToken, targetVideoId);
        result.reel = {
          videoId: reelStatus.videoId,
          videoStatus: reelStatus.videoStatus,
          isComplete: reelStatus.isComplete,
          isProcessing: reelStatus.isProcessing,
          canonicalPermalink: reelStatus.permalinkUrl,
          metaObjectPrivacy: reelStatus.privacy,
          rawStatus: reelStatus.rawStatus,
          viewerAccessibilityNote: 'If Meta App is in Development Mode, content is only visible to users in App Roles (Administrators, Developers, Testers). To enable public viewer access, switch Meta App to Live Mode or add the viewer to App Roles in Meta for Developers.'
        };
      } catch (reelErr) {
        result.reelError = reelErr.message;
      }
    }

    return result;
  } catch (err) {
    return {
      connected: false,
      page_id: cleanPageId,
      page_name: null,
      has_page_access_token: true,
      can_publish: false,
      error: err.message
    };
  }
}

/**
 * Publish a Facebook Reel via Meta Graph API Reels API with post-finish processing verification
 */
export async function publishFacebookReel(env, pageAccessToken, pageId, {
  b2DownloadUrl,
  caption = '',
  title = '',
  scheduledAt = null,
  isAiGenerated = false,
  pollOptions = null,
  onStepUpdate = null
}) {
  const version = getGraphVersion(env);

  // ── Step 0: Validate that Page Access Token strictly matches Page ID ──
  await validatePageTokenMatch(env, pageAccessToken, pageId);

  // ── Step 1: Initialize Reel Upload Session ──
  const startUrl = `${GRAPH_BASE}/${version}/${pageId}/video_reels`;
  const startRes = await fetch(startUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      upload_phase: 'start',
      access_token: pageAccessToken
    })
  });

  if (!startRes.ok) {
    const errText = await startRes.text();
    let friendlyMessage = `Failed to start Facebook Reel session: ${errText}`;
    try {
      const errObj = JSON.parse(errText);
      const code = errObj?.error?.code;
      const subcode = errObj?.error?.error_subcode;
      const message = errObj?.error?.message;
      if (code === 190 || subcode === 460 || (message && message.toLowerCase().includes('session has been invalidated'))) {
        friendlyMessage = `Facebook Session Expired (#190): The Meta session has been invalidated (e.g. password changed). Please re-authenticate your Facebook account.`;
      } else if (code === 200) {
        friendlyMessage = `Facebook Permission Error (#200): Subject does not have permission to post videos on this Page. Please ensure your Page has 'pages_manage_posts' & 'pages_read_engagement' permissions by re-authenticating with Facebook.`;
      } else if (message) {
        friendlyMessage = `Facebook API Error: ${message}`;
      }
    } catch {}
    throw new Error(friendlyMessage);
  }

  const startData = await startRes.json();
  const videoId = startData.video_id;
  const uploadUrl = startData.upload_url;

  if (!uploadUrl) {
    throw new Error('Facebook did not return a Reel upload_url.');
  }

  // Milestone 1: videoId is received from Meta. Immediately persist to database.
  if (onStepUpdate) {
    try {
      await onStepUpdate({ step: 'start', videoId });
    } catch (stepErr) {
      console.warn('[FB Reels] onStepUpdate start callback error:', stepErr.message);
    }
  }

  // ── Step 2: Ingest Video Stream from B2 to Facebook ──
  // Attempt 1: High-Speed Meta Server-to-Server Ingestion via file_url header
  let uploadSucceeded = false;
  try {
    const fileUrlRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `OAuth ${pageAccessToken}`,
        'file_url': b2DownloadUrl
      }
    });
    if (fileUrlRes.ok) {
      uploadSucceeded = true;
    } else {
      const fallbackErr = await fileUrlRes.text();
      console.warn('[FB Reels] file_url header response not 200 (fallback to binary stream):', fileUrlRes.status, fallbackErr);
    }
  } catch (err) {
    console.warn('[FB Reels] Direct file_url ingest error, falling back to stream:', err.message);
  }

  // Attempt 2: Direct binary transfer fallback if file_url is not accepted
  if (!uploadSucceeded) {
    const videoFileRes = await fetch(b2DownloadUrl);
    if (!videoFileRes.ok) {
      throw new Error(`Could not fetch video from B2 temporary storage: ${videoFileRes.status}`);
    }

    const videoBlob = await videoFileRes.arrayBuffer();
    const videoSize = videoBlob.byteLength;

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `OAuth ${pageAccessToken}`,
        'offset': '0',
        'file_size': String(videoSize),
        'Content-Type': 'application/octet-stream'
      },
      body: videoBlob
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Failed to upload Reel binary to Facebook: ${errText}`);
    }
  }

  // ── Step 3: Finish & Publish Reel ──
  const finishPayload = {
    upload_phase: 'finish',
    video_id: videoId,
    description: caption,
    is_ai_generated: Boolean(isAiGenerated),
    access_token: pageAccessToken
  };

  if (title) {
    finishPayload.title = title;
  }

  if (scheduledAt) {
    const scheduledEpoch = Math.floor(new Date(scheduledAt).getTime() / 1000);
    const nowEpoch = Math.floor(Date.now() / 1000);
    if (scheduledEpoch >= nowEpoch + 600 && scheduledEpoch <= nowEpoch + 75 * 86400) {
      finishPayload.video_state = 'SCHEDULED';
      finishPayload.scheduled_publish_time = scheduledEpoch;
    } else {
      console.warn(`[FB Publish] scheduledAt is within 10 minutes (${Math.round((scheduledEpoch - nowEpoch) / 60)}m) or beyond 75 days. Publishing immediately.`);
      finishPayload.video_state = 'PUBLISHED';
    }
  } else {
    finishPayload.video_state = 'PUBLISHED';
  }

  const finishRes = await fetch(startUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(finishPayload)
  });

  if (!finishRes.ok) {
    const errText = await finishRes.text();
    throw new Error(`Failed to finalize Facebook Reel: ${errText}`);
  }

  const finishData = await finishRes.json();

  // Milestone 2: Reel finish request accepted by Meta. Immediately persist 'processing' state in DB.
  if (onStepUpdate && finishPayload.video_state !== 'SCHEDULED') {
    try {
      await onStepUpdate({ step: 'finish', videoId, status: 'processing' });
    } catch (stepErr) {
      console.warn('[FB Reels] onStepUpdate finish callback error:', stepErr.message);
    }
  }

  if (finishPayload.video_state === 'SCHEDULED') {
    const scheduledUrl = normalizeFacebookPermalink(null, videoId);
    return {
      success: true,
      videoId,
      postUrl: scheduledUrl,
      canonicalPermalink: scheduledUrl,
      status: 'scheduled',
      finishData
    };
  }

  // ── Step 4: Verify Meta Processing Status & Retrieve Canonical Permalink ──
  // Use quick inline polling (max 2 attempts) to keep execution well within Worker timeout limits.
  // Any Reel still transcoding after this is safely tracked by background scheduler Phase 1.
  console.log(`[FB Reels] Finish request successful. Now polling Meta Graph API processing status (videoId=${videoId})...`);
  const effectivePollOptions = pollOptions || {
    maxAttempts: 2,
    initialDelayMs: 2000,
    backoffMs: 1000
  };
  const statusInfo = await pollFacebookReelStatus(env, pageAccessToken, videoId, effectivePollOptions);

  const isFullyPublished = statusInfo.isComplete;
  const finalStatus = isFullyPublished ? 'published' : 'processing';
  const canonicalPermalink = statusInfo.permalinkUrl || normalizeFacebookPermalink(null, videoId);

  console.log(`[FB Reels] Publication verification complete: videoId=${videoId}, finalStatus=${finalStatus}, permalink=${canonicalPermalink}`);

  return {
    success: true,
    videoId,
    postUrl: isFullyPublished ? canonicalPermalink : null,
    canonicalPermalink,
    status: finalStatus,
    statusInfo,
    finishData
  };
}

/**
 * Publish a Standard Facebook Page Video
 */
export async function publishFacebookPageVideo(env, pageAccessToken, pageId, {
  b2DownloadUrl,
  title = '',
  description = '',
  scheduledAt = null
}) {
  const version = getGraphVersion(env);
  const videoUrl = `${GRAPH_BASE}/${version}/${pageId}/videos`;

  const payload = {
    file_url: b2DownloadUrl,
    description: description,
    access_token: pageAccessToken
  };

  if (title) {
    payload.title = title;
  }

  if (scheduledAt) {
    const scheduledEpoch = Math.floor(new Date(scheduledAt).getTime() / 1000);
    const nowEpoch = Math.floor(Date.now() / 1000);
    if (scheduledEpoch >= nowEpoch + 600 && scheduledEpoch <= nowEpoch + 75 * 86400) {
      payload.published = false;
      payload.scheduled_publish_time = scheduledEpoch;
    } else {
      payload.published = true;
    }
  } else {
    payload.published = true;
  }

  const res = await fetch(videoUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to publish Facebook Page Video: ${errText}`);
  }

  const data = await res.json();
  const videoId = data.id;
  const postUrl = `https://www.facebook.com/${videoId}`;

  return {
    success: true,
    videoId,
    postUrl,
    status: scheduledAt ? 'scheduled' : 'published',
    data
  };
}

/**
 * Publish a Facebook Page Photo Post
 */
export async function publishFacebookPhoto(env, pageAccessToken, pageId, {
  b2DownloadUrl,
  caption = '',
  scheduledAt = null
}) {
  const version = getGraphVersion(env);
  const photoUrl = `${GRAPH_BASE}/${version}/${pageId}/photos`;

  // Primary: Direct multipart/form-data upload by fetching image bytes in worker.
  // This bypasses Meta crawler accessing Backblaze B2 authorization URLs, preventing "Missing or invalid image file" errors.
  try {
    const imgRes = await fetch(b2DownloadUrl);
    if (imgRes.ok) {
      const imgBuffer = await imgRes.arrayBuffer();
      const formData = new FormData();
      formData.append('source', new Blob([imgBuffer], { type: 'image/jpeg' }), 'photo.jpg');
      formData.append('access_token', pageAccessToken);
      if (caption) formData.append('caption', caption);

      if (scheduledAt) {
        const scheduledEpoch = Math.floor(new Date(scheduledAt).getTime() / 1000);
        const nowEpoch = Math.floor(Date.now() / 1000);
        if (scheduledEpoch >= nowEpoch + 600 && scheduledEpoch <= nowEpoch + 75 * 86400) {
          formData.append('published', 'false');
          formData.append('scheduled_publish_time', String(scheduledEpoch));
        } else {
          formData.append('published', 'true');
        }
      } else {
        formData.append('published', 'true');
      }

      console.log(`[FB Photo] Uploading directly via multipart/form-data (${imgBuffer.byteLength} bytes) to ${photoUrl}`);
      const directRes = await fetch(photoUrl, {
        method: 'POST',
        body: formData
      });

      if (directRes.ok) {
        const data = await directRes.json();
        const photoId = data.id;
        const postUrl = `https://www.facebook.com/${data.post_id || photoId}`;
        console.log(`[FB Photo] Direct multipart upload successful: photoId=${photoId}`);
        return {
          success: true,
          photoId,
          postId: data.post_id || photoId,
          postUrl,
          status: scheduledAt ? 'scheduled' : 'published',
          data
        };
      } else {
        const directErrText = await directRes.text();
        console.warn(`[FB Photo] Direct multipart upload non-200 (${directRes.status}): ${directErrText}, attempting URL fallback...`);
      }
    } else {
      console.warn(`[FB Photo] Failed to fetch image from B2 (${imgRes.status}), attempting URL fallback...`);
    }
  } catch (directErr) {
    console.warn('[FB Photo] Direct multipart upload error, falling back to URL payload:', directErr.message);
  }

  // Fallback: URL payload
  const payload = {
    url: b2DownloadUrl,
    caption: caption,
    access_token: pageAccessToken
  };

  if (scheduledAt) {
    const scheduledEpoch = Math.floor(new Date(scheduledAt).getTime() / 1000);
    const nowEpoch = Math.floor(Date.now() / 1000);
    if (scheduledEpoch >= nowEpoch + 600 && scheduledEpoch <= nowEpoch + 75 * 86400) {
      payload.published = false;
      payload.scheduled_publish_time = scheduledEpoch;
    } else {
      payload.published = true;
    }
  } else {
    payload.published = true;
  }

  const res = await fetch(photoUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    let msg = `Failed to publish Facebook Photo: ${errText}`;
    try {
      const errObj = JSON.parse(errText);
      if (errObj?.error?.message) msg = `Facebook API Error: ${errObj.error.message}`;
    } catch {}
    throw new Error(msg);
  }

  const data = await res.json();
  const photoId = data.id;
  const postUrl = `https://www.facebook.com/${data.post_id || photoId}`;

  return {
    success: true,
    photoId,
    postId: data.post_id || photoId,
    postUrl,
    status: scheduledAt ? 'scheduled' : 'published',
    data
  };
}

/**
 * Publish a Facebook Page Photo Story
 */
export async function publishFacebookPhotoStory(env, pageAccessToken, pageId, {
  b2DownloadUrl
}) {
  const version = getGraphVersion(env);
  const storyUrl = `${GRAPH_BASE}/${version}/${pageId}/photo_stories`;

  const payload = {
    url: b2DownloadUrl,
    access_token: pageAccessToken
  };

  const res = await fetch(storyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to publish Facebook Photo Story: ${errText}`);
  }

  const data = await res.json();
  const storyId = data.id || data.post_id;
  return {
    success: true,
    storyId,
    postUrl: `https://www.facebook.com/${pageId}`,
    status: 'published',
    data
  };
}

/**
 * Reconciles stuck Facebook upload jobs that have been in 'uploading' status.
 * Checks Meta Graph API for video transcoding completion or matches published Page reels/videos.
 */
export async function reconcileStuckFacebookJobs(env, userId = null) {
  if (!env.DB) return { reconciled: 0, failed: 0, checked: 0 };
  const secretKey = env.ENCRYPTION_KEY || env.FACEBOOK_APP_SECRET || '7a279df54155e4f8f70991df0a4e9c9c';
  let reconciled = 0;
  let failed = 0;

  try {
    const stuckJobs = await getStuckUploadingFacebookJobs(env.DB, 3, userId);
    if (stuckJobs.length === 0) return { reconciled: 0, failed: 0, checked: 0 };

    console.log(`[FB Reconcile] Found ${stuckJobs.length} stuck uploading Facebook job(s). Reconciling with Meta...`);

    for (const job of stuckJobs) {
      try {
        let encryptedPageToken = job.page_access_token;
        if (job.page_id && job.available_pages) {
          try {
            const pages = JSON.parse(job.available_pages || '[]');
            const match = pages.find(p => p.page_id === job.page_id);
            if (match && match.page_access_token) {
              encryptedPageToken = match.page_access_token;
            }
          } catch {}
        }

        const activePageToken = await decryptToken(encryptedPageToken, secretKey);
        if (!activePageToken) {
          console.warn(`[FB Reconcile] Cannot decrypt page token for job ${job.id}`);
          continue;
        }

        // Case A: facebook_video_id is already recorded on the job
        if (job.facebook_video_id) {
          console.log(`[FB Reconcile] Job ${job.id} has videoId=${job.facebook_video_id}. Checking reel status on Meta...`);
          const statusInfo = await checkFacebookReelStatus(env, activePageToken, job.facebook_video_id);
          if (statusInfo.isComplete) {
            const postUrl = statusInfo.permalinkUrl || normalizeFacebookPermalink(null, job.facebook_video_id);
            await updateFacebookUploadJob(env.DB, job.id, {
              status: 'published',
              facebook_post_url: postUrl,
              published_at: new Date().toISOString()
            });
            if (job.b2_file_name) {
              const needed = await isB2FileNeededByOtherJobs(env.DB, job.b2_file_name, job.id);
              if (!needed && job.b2_file_id) {
                try { await b2DeleteFile(env, job.b2_file_id, job.b2_file_name); } catch {}
              }
            }
            reconciled++;
            console.log(`[FB Reconcile] Job ${job.id} successfully marked as published: ${postUrl}`);
            continue;
          } else if (statusInfo.isError || statusInfo.isExpired) {
            const errMsg = statusInfo.errorDetails || 'Meta video transcoding failed.';
            await updateFacebookUploadJob(env.DB, job.id, {
              status: 'failed',
              error_message: errMsg
            });
            failed++;
            continue;
          } else {
            // Still processing on Meta
            await updateFacebookUploadJob(env.DB, job.id, { status: 'processing' });
            continue;
          }
        }

        // Case B: facebook_video_id is NULL (worker interrupted before video_id was saved or during upload)
        // Query Facebook Page video_reels and videos to find matching published post
        console.log(`[FB Reconcile] Job ${job.id} has no videoId. Querying Page reels & videos on Meta for matching title/caption...`);
        const version = getGraphVersion(env);
        let matchingVideo = null;

        // 1. Try checking recent video_reels
        try {
          const reelsRes = await fetch(`${GRAPH_BASE}/${version}/${job.page_id}/video_reels?fields=id,video_id,description,created_time,permalink_url&limit=30&access_token=${encodeURIComponent(activePageToken)}`);
          if (reelsRes.ok) {
            const reelsData = await reelsRes.json();
            const reelsList = reelsData?.data || [];
            const cleanTitle = (job.title || '').trim().toLowerCase();
            const cleanCaption = (job.caption || '').trim().toLowerCase().slice(0, 40);

            for (const r of reelsList) {
              const desc = (r.description || '').toLowerCase();
              if (cleanTitle && desc.includes(cleanTitle)) {
                matchingVideo = {
                  id: r.video_id || r.id,
                  permalinkUrl: normalizeFacebookPermalink(r.permalink_url, r.video_id || r.id),
                  createdTime: r.created_time
                };
                break;
              } else if (cleanCaption && desc.includes(cleanCaption)) {
                matchingVideo = {
                  id: r.video_id || r.id,
                  permalinkUrl: normalizeFacebookPermalink(r.permalink_url, r.video_id || r.id),
                  createdTime: r.created_time
                };
                break;
              }
            }
          }
        } catch (reelErr) {
          console.warn(`[FB Reconcile] Error querying video_reels for job ${job.id}:`, reelErr.message);
        }

        // 2. Try checking recent videos
        if (!matchingVideo) {
          try {
            const vidsRes = await fetch(`${GRAPH_BASE}/${version}/${job.page_id}/videos?fields=id,title,description,created_time,permalink_url&limit=30&access_token=${encodeURIComponent(activePageToken)}`);
            if (vidsRes.ok) {
              const vidsData = await vidsRes.json();
              const vidsList = vidsData?.data || [];
              const cleanTitle = (job.title || '').trim().toLowerCase();
              const cleanCaption = (job.caption || '').trim().toLowerCase().slice(0, 40);

              for (const v of vidsList) {
                const title = (v.title || '').toLowerCase();
                const desc = (v.description || '').toLowerCase();
                if (cleanTitle && (title.includes(cleanTitle) || desc.includes(cleanTitle))) {
                  matchingVideo = {
                    id: v.id,
                    permalinkUrl: normalizeFacebookPermalink(v.permalink_url, v.id),
                    createdTime: v.created_time
                  };
                  break;
                } else if (cleanCaption && desc.includes(cleanCaption)) {
                  matchingVideo = {
                    id: v.id,
                    permalinkUrl: normalizeFacebookPermalink(v.permalink_url, v.id),
                    createdTime: v.created_time
                  };
                  break;
                }
              }
            }
          } catch (vidErr) {
            console.warn(`[FB Reconcile] Error querying videos for job ${job.id}:`, vidErr.message);
          }
        }

        if (matchingVideo) {
          console.log(`[FB Reconcile] Found matched video on Meta for job ${job.id}: videoId=${matchingVideo.id}, url=${matchingVideo.permalinkUrl}`);
          await updateFacebookUploadJob(env.DB, job.id, {
            status: 'published',
            facebook_video_id: matchingVideo.id,
            facebook_post_url: matchingVideo.permalinkUrl,
            published_at: matchingVideo.createdTime || new Date().toISOString()
          });
          if (job.b2_file_name) {
            const needed = await isB2FileNeededByOtherJobs(env.DB, job.b2_file_name, job.id);
            if (!needed && job.b2_file_id) {
              try { await b2DeleteFile(env, job.b2_file_id, job.b2_file_name); } catch {}
            }
          }
          reconciled++;
        } else {
          // Check how long it has been stuck
          const updatedMs = new Date(job.updated_at || job.created_at).getTime();
          const scheduledMs = job.scheduled_at ? new Date(job.scheduled_at).getTime() : updatedMs;
          const oldestRef = Math.min(updatedMs, scheduledMs);
          const minutesStuck = (Date.now() - oldestRef) / (60 * 1000);

          if (minutesStuck > 15) {
            console.warn(`[FB Reconcile] Job ${job.id} stuck for ${Math.round(minutesStuck)}m with no match on Meta. Marking failed.`);
            await updateFacebookUploadJob(env.DB, job.id, {
              status: 'failed',
              error_message: 'Upload session timed out before completing on Meta. You can reschedule or publish now.'
            });
            failed++;
          } else {
            console.log(`[FB Reconcile] Job ${job.id} still within 15m timeout window (${Math.round(minutesStuck)}m). Will check again on next pass.`);
          }
        }
      } catch (jobErr) {
        console.error(`[FB Reconcile] Error reconciling job ${job.id}:`, jobErr.message);
      }
    }
    return { reconciled, failed, checked: stuckJobs.length };
  } catch (err) {
    console.error('[FB Reconcile] Fatal error during reconciliation pass:', err.message);
    return { reconciled, failed, error: err.message };
  }
}

/**
 * Processes due scheduled Facebook upload jobs from the D1 database.
 * Invoked by Cloudflare Worker cron trigger (* * * * *) or maintenance API.
 */
export async function processScheduledFacebookJobs(env) {
  if (!env.DB) return { processed: 0, errors: [] };

  const secretKey = env.ENCRYPTION_KEY || env.FACEBOOK_APP_SECRET || '7a279df54155e4f8f70991df0a4e9c9c';
  const errors = [];
  let processed = 0;
  const nowIso = new Date().toISOString();

  // ── Phase 0: Reconcile Stuck Uploading Jobs ──
  try {
    const recResult = await reconcileStuckFacebookJobs(env);
    if (recResult.reconciled > 0 || recResult.failed > 0) {
      console.log(`[FB Scheduler] Phase 0 Reconcile: ${recResult.reconciled} published, ${recResult.failed} failed`);
    }
  } catch (recErr) {
    console.warn('[FB Scheduler] Phase 0 Reconcile error:', recErr.message);
  }

  // ── Phase 1: Query & Verify In-Progress Processing Facebook Reel Jobs ──
  try {
    const processingJobs = await getProcessingFacebookJobs(env.DB, 10);
    for (const job of processingJobs) {
      console.log(`[FB Scheduler] Checking in-progress processing Facebook job: jobId=${job.id}, videoId=${job.facebook_video_id}`);
      try {
        let encryptedPageToken = job.page_access_token;
        if (job.page_id && job.available_pages) {
          try {
            const pages = JSON.parse(job.available_pages || '[]');
            const match = pages.find(p => p.page_id === job.page_id);
            if (match && match.page_access_token) {
              encryptedPageToken = match.page_access_token;
            }
          } catch {}
        }

        const activePageToken = await decryptToken(encryptedPageToken, secretKey);
        if (!activePageToken) {
          throw new Error('Could not decrypt Facebook Page access token.');
        }

        const statusInfo = await checkFacebookReelStatus(env, activePageToken, job.facebook_video_id);
        console.log(`[FB Scheduler] Background status check for jobId=${job.id}: video_status=${statusInfo.videoStatus}, isComplete=${statusInfo.isComplete}`);

        if (statusInfo.isComplete) {
          const canonicalPermalink = statusInfo.permalinkUrl || normalizeFacebookPermalink(null, job.facebook_video_id);
          await updateFacebookUploadJob(env.DB, job.id, {
            status: 'published',
            facebook_post_url: canonicalPermalink,
            published_at: new Date().toISOString()
          });

          // Safe B2 lifecycle check: delete only if no other pending/scheduled jobs need this file
          if (job.b2_file_name) {
            const needed = await isB2FileNeededByOtherJobs(env.DB, job.b2_file_name, job.id);
            if (!needed && job.b2_file_id) {
              try {
                await b2DeleteFile(env, job.b2_file_id, job.b2_file_name);
                console.log(`[FB Scheduler] Cleaned up temporary B2 file after verification: ${job.b2_file_name}`);
              } catch (delErr) {
                console.warn('[FB Scheduler] B2 cleanup warning:', delErr.message);
              }
            } else {
              console.log(`[FB Scheduler] Retaining B2 file ${job.b2_file_name} for other dependent jobs.`);
            }
          }

          processed++;
          console.log(`[FB Scheduler] jobId=${job.id} verified as published on Meta: permalink=${canonicalPermalink}`);
        } else if (statusInfo.isError || statusInfo.isExpired) {
          const errMsg = statusInfo.errorDetails || (statusInfo.isExpired ? 'Reel upload session expired on Meta.' : 'Video transcoding failed on Meta.');
          await updateFacebookUploadJob(env.DB, job.id, {
            status: 'failed',
            error_message: errMsg
          });

          if (job.b2_file_name) {
            const needed = await isB2FileNeededByOtherJobs(env.DB, job.b2_file_name, job.id);
            if (!needed && job.b2_file_id) {
              try {
                await b2DeleteFile(env, job.b2_file_id, job.b2_file_name);
              } catch {}
            }
          }

          errors.push({ jobId: job.id, error: errMsg });
        }
      } catch (procErr) {
        console.error(`[FB Scheduler] Error checking processing job ${job.id}:`, procErr.message);
      }
    }
  } catch (err) {
    console.error('[FB Scheduler] Error querying processing jobs:', err.message);
  }

  // ── Phase 2: Query newly due scheduled Facebook jobs ──
  try {
    const dueJobs = await getDueFacebookJobs(env.DB, 10);

    if (dueJobs.length === 0) {
      return { processed, errors };
    }

    console.log(`[FB Scheduler] Found ${dueJobs.length} due scheduled Facebook job(s) at ${nowIso}. Processing...`);

    for (const job of dueJobs) {
      console.log(`[SCHEDULER] jobId=${job.id} platform=facebook userId=${job.user_id} scheduledAtUtc=${job.scheduled_at} currentTimeUtc=${nowIso} due=true`);

      // 1. Atomic claim: ensure only this worker execution processes the job
      const claimed = await claimDueFacebookJob(env.DB, job.id);
      if (!claimed) {
        console.log(`[SCHEDULER] jobId=${job.id} platform=facebook claimResult=already_claimed`);
        continue;
      }

      console.log(`[SCHEDULER] jobId=${job.id} platform=facebook claimResult=success statusBefore=scheduled statusAfter=uploading`);

      try {
        let encryptedPageToken = job.page_access_token;
        if (job.page_id && job.available_pages) {
          try {
            const pages = JSON.parse(job.available_pages || '[]');
            const match = pages.find(p => p.page_id === job.page_id);
            if (match && match.page_access_token) {
              encryptedPageToken = match.page_access_token;
            }
          } catch {}
        }

        const activePageToken = await decryptToken(encryptedPageToken, secretKey);
        if (!activePageToken) {
          throw new Error('Could not decrypt Facebook Page access token.');
        }

        if (!job.b2_file_name) {
          throw new Error('Missing B2 file name for scheduled Facebook job.');
        }

        const b2DownloadUrl = await b2GetDownloadUrl(env, job.b2_file_name, 3600);

        // Pre-flight check: verify file exists in B2 before initiating Meta ingestion
        try {
          const headCheck = await fetch(b2DownloadUrl, { method: 'HEAD' });
          if (headCheck.status === 404) {
            throw new Error(`B2_FILE_NOT_FOUND: The media file "${job.b2_file_name}" was not found in storage (it was already published or removed).`);
          }
        } catch (headErr) {
          if (headErr.message?.includes('B2_FILE_NOT_FOUND')) throw headErr;
        }

        let hashtagsArr = [];
        try {
          hashtagsArr = JSON.parse(job.hashtags || '[]');
        } catch {}

        const hashtagsStr = Array.isArray(hashtagsArr) && hashtagsArr.length > 0
          ? hashtagsArr.map(t => `#${t.replace(/^#+/, '')}`).join(' ')
          : '';
        const fullCaption = `${job.caption ? job.caption.trim() : ''}${hashtagsStr ? (job.caption ? '\n\n' : '') + hashtagsStr : ''}`;

        const publishStart = new Date().toISOString();
        console.log(`[SCHEDULER] jobId=${job.id} platform=facebook publishStart=${publishStart}`);

        let publishResult;
        if (job.content_type === 'image' || job.content_type === 'photo') {
          publishResult = await publishFacebookPhoto(env, activePageToken, job.page_id, {
            b2DownloadUrl,
            caption: fullCaption || job.title || ''
          });
        } else if (job.content_type === 'story') {
          publishResult = await publishFacebookPhotoStory(env, activePageToken, job.page_id, {
            b2DownloadUrl
          });
        } else if (job.content_type === 'video') {
          publishResult = await publishFacebookPageVideo(env, activePageToken, job.page_id, {
            b2DownloadUrl,
            title: job.title || '',
            description: fullCaption || job.description || ''
          });
        } else {
          publishResult = await publishFacebookReel(env, activePageToken, job.page_id, {
            b2DownloadUrl,
            caption: fullCaption,
            title: job.title || '',
            isAiGenerated: Boolean(job.is_ai_generated),
            onStepUpdate: async ({ step, videoId }) => {
              if (step === 'start') {
                await updateFacebookUploadJob(env.DB, job.id, {
                  facebook_video_id: videoId
                });
              } else if (step === 'finish') {
                await updateFacebookUploadJob(env.DB, job.id, {
                  status: 'processing',
                  facebook_video_id: videoId
                });
              }
            }
          });
        }

        const publishEnd = new Date().toISOString();
        const isPublished = publishResult.status === 'published';
        const postUrl = isPublished ? (publishResult.postUrl || null) : null;
        console.log(`[SCHEDULER] jobId=${job.id} platform=facebook publishEnd=${publishEnd} status=${publishResult.status} postUrl=${postUrl}`);

        await updateFacebookUploadJob(env.DB, job.id, {
          status: publishResult.status || 'published',
          facebook_video_id: publishResult.videoId || publishResult.photoId || publishResult.postId || null,
          facebook_post_url: postUrl,
          published_at: isPublished ? new Date().toISOString() : null
        });

        // Safe B2 lifecycle check: delete only if no other pending/scheduled jobs need this file AND job is published
        if (job.b2_file_name && isPublished) {
          const needed = await isB2FileNeededByOtherJobs(env.DB, job.b2_file_name, job.id);
          if (!needed && job.b2_file_id) {
            try {
              await b2DeleteFile(env, job.b2_file_id, job.b2_file_name);
              console.log(`[FB Scheduler] Cleaned up temporary B2 file: ${job.b2_file_name}`);
            } catch (delErr) {
              console.warn('[FB Scheduler] B2 cleanup warning:', delErr.message);
            }
          } else {
            console.log(`[FB Scheduler] Retaining B2 file ${job.b2_file_name} for other dependent jobs.`);
          }
        } else if (job.b2_file_name && !isPublished) {
          console.log(`[FB Scheduler] Retaining B2 file ${job.b2_file_name} while processing continues.`);
        }

        processed++;
      } catch (err) {
        console.error(`[SCHEDULER] jobId=${job.id} platform=facebook error="${err.message}"`);
        errors.push({ jobId: job.id, error: err.message });

        await updateFacebookUploadJob(env.DB, job.id, {
          status: 'failed',
          error_message: err.message
        });

        // On failure, also check if B2 file should be deleted if no other active jobs need it
        if (job.b2_file_name) {
          const needed = await isB2FileNeededByOtherJobs(env.DB, job.b2_file_name, job.id);
          if (!needed && job.b2_file_id) {
            try {
              await b2DeleteFile(env, job.b2_file_id, job.b2_file_name);
            } catch {}
          }
        }
      }
    }

    return { processed, errors };
  } catch (err) {
    console.error('[FB Scheduler] Fatal error executing scheduled jobs query:', err);
    return { processed: 0, errors: [err.message] };
  }
}

