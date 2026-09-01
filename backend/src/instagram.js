/**
 * Meta Graph API Helper for Instagram Reels & Video Publishing
 * Cloudflare Worker Backend Service
 *
 * Capabilities:
 * - Canonical OAuth 2.0 redirect URI handling
 * - Cryptographically signed OAuth state
 * - Automatic discovery of linked Instagram Business & Creator accounts across Facebook Pages
 * - Real capability and content publishing limit diagnostics
 * - High-speed Server-to-Server Video Ingestion from Backblaze B2 to Instagram Media Containers
 * - Smart Backoff Container Status Polling and Reel Media Publishing
 */

import { signOAuthState } from './crypto.js';

const GRAPH_BASE = 'https://graph.facebook.com';

/**
 * Return Meta Graph API Version (defaults to v26.0 or env.META_GRAPH_API_VERSION)
 */
export function getGraphVersion(env) {
  return env.META_GRAPH_API_VERSION || 'v26.0';
}

/**
 * Canonical redirect URI for Instagram OAuth.
 * Used character-for-character in both authorization request and token exchange.
 */
export function getInstagramRedirectUri(env) {
  const base = (env.APP_URL || '').replace(/\/$/, '');
  return `${base}/api/instagram/callback`;
}

/**
 * Build Meta OAuth Dialog URL for Instagram Publishing
 */
export async function buildInstagramAuthUrl(env, userId, frontendUrl = null, isPopup = false) {
  const version = getGraphVersion(env);
  const redirectUri = getInstagramRedirectUri(env);
  const secretKey = env.ENCRYPTION_KEY || env.FACEBOOK_APP_SECRET || 'oauth-state-secret-salt-2026';

  const state = await signOAuthState(
    {
      userId,
      frontendUrl,
      isPopup: Boolean(isPopup),
      provider: 'instagram'
    },
    secretKey
  );

  // Exact permissions required for Instagram Professional discovery & Reel publishing
  const scopes = [
    'instagram_basic',
    'instagram_content_publish',
    'pages_show_list',
    'pages_read_engagement',
    'public_profile',
    'business_management'
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
export async function exchangeInstagramCodeForTokens(env, code) {
  const version = getGraphVersion(env);
  const redirectUri = getInstagramRedirectUri(env);

  console.log('[IG Graph API] Exchanging code with canonical redirect_uri:', redirectUri);

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
    console.error('[IG Graph API] Token exchange failed. Status:', res.status, 'Response:', errText);
    let detailedMsg = errText;
    try {
      const parsed = JSON.parse(errText);
      detailedMsg = parsed?.error?.message || errText;
    } catch {}
    throw new Error(`Instagram token exchange failed (${res.status}): ${detailedMsg}`);
  }

  const shortTokenData = await res.json();
  const shortUserToken = shortTokenData.access_token;

  if (!shortUserToken) {
    throw new Error('Meta did not return a user access token.');
  }

  // Step 2: Exchange for Long-Lived User Token (~60 days validity)
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
      console.log('[IG Graph API] ✓ Long-lived token acquired successfully');
    }
  } else {
    console.warn('[IG Graph API] Long-lived token exchange warning:', await longLivedRes.text());
  }

  return { userAccessToken };
}

/**
 * Discover all Instagram Business/Creator accounts linked to user's managed Facebook Pages
 */
export async function fetchInstagramAccounts(env, userAccessToken) {
  const version = getGraphVersion(env);

  // 1. Fetch user profile
  const userRes = await fetch(`${GRAPH_BASE}/${version}/me?fields=id,name&access_token=${userAccessToken}`);
  let fbUser = { id: null, name: null };
  if (userRes.ok) {
    fbUser = await userRes.json();
  }

  // 2. Fetch user's managed Pages with connected Instagram Accounts
  const accountsUrl = `${GRAPH_BASE}/${version}/me/accounts?fields=id,name,access_token,category,picture{url},instagram_business_account{id,username,name,profile_picture_url}&limit=100&access_token=${userAccessToken}`;
  const accountsRes = await fetch(accountsUrl);

  if (!accountsRes.ok) {
    const errText = await accountsRes.text();
    console.error('[IG Graph API] Accounts fetch failed. Status:', accountsRes.status, 'Response:', errText);
    throw new Error(`Failed to fetch Meta accounts (${accountsRes.status}): ${errText}`);
  }

  const accountsData = await accountsRes.json();
  const rawPages = accountsData.data || [];

  const igAccounts = [];
  const seenIgUserIds = new Set();

  for (const page of rawPages) {
    const pageAccessToken = page.access_token || userAccessToken;
    let igData = page.instagram_business_account || null;

    // Fallback: Query Page directly if subfield expansion was omitted
    if (!igData || !igData.id) {
      try {
        const pageProbeRes = await fetch(
          `${GRAPH_BASE}/${version}/${page.id}?fields=instagram_business_account{id,username,name,profile_picture_url},connected_instagram_account{id,username,name,profile_picture_url}&access_token=${pageAccessToken}`
        );
        if (pageProbeRes.ok) {
          const pageProbeData = await pageProbeRes.json();
          igData = pageProbeData.instagram_business_account || pageProbeData.connected_instagram_account || null;
        }
      } catch (e) {
        console.warn('[IG Graph API] Page fallback probe warning:', e.message);
      }
    }

    if (igData && igData.id) {
      const igId = String(igData.id);
      if (!seenIgUserIds.has(igId)) {
        seenIgUserIds.add(igId);

        // Fetch full profile info for discovered account
        let igUsername = igData.username || null;
        let igName = igData.name || page.name;
        let igProfilePic = igData.profile_picture_url || page.picture?.data?.url || null;

        try {
          const profileRes = await fetch(
            `${GRAPH_BASE}/${version}/${igId}?fields=id,username,name,profile_picture_url&access_token=${pageAccessToken}`
          );
          if (profileRes.ok) {
            const profileData = await profileRes.json();
            igUsername = profileData.username || igUsername;
            igName = profileData.name || igName;
            igProfilePic = profileData.profile_picture_url || igProfilePic;
          }
        } catch {}

        igAccounts.push({
          ig_user_id: igId,
          ig_username: igUsername || `ig_${igId}`,
          ig_name: igName || `Instagram Account (${igId})`,
          ig_profile_picture_url: igProfilePic,
          page_id: String(page.id),
          page_name: page.name,
          access_token: pageAccessToken
        });
      }
    }
  }

  return {
    fbUser,
    accounts: igAccounts,
    rawPagesCount: rawPages.length
  };
}

/**
 * Validate that a submitted Instagram User ID or Username belongs to the user and retrieve active token.
 */
export async function validateAndGetInstagramAccount(env, userAccessToken, targetIgIdentifier) {
  const version = getGraphVersion(env);
  const cleanTarget = String(targetIgIdentifier || '').trim().replace(/^@/, '');

  if (!cleanTarget) {
    throw new Error('Instagram Account ID or Username is required.');
  }

  const { accounts } = await fetchInstagramAccounts(env, userAccessToken);
  const match = accounts.find(
    a => a.ig_user_id === cleanTarget || a.ig_username.toLowerCase() === cleanTarget.toLowerCase() || a.page_id === cleanTarget
  );

  if (!match) {
    const err = new Error(
      `Instagram account "${cleanTarget}" was not found or is not linked to any Facebook Page managed by this account. Ensure your Instagram account is set to Professional (Creator or Business) and connected to a Facebook Page.`
    );
    err.status = 404;
    throw err;
  }

  // Safe probe of the Instagram account with Meta
  const probeUrl = `${GRAPH_BASE}/${version}/${match.ig_user_id}?fields=id,username,name,profile_picture_url&access_token=${match.access_token}`;
  const probeRes = await fetch(probeUrl);

  if (probeRes.ok) {
    const probeData = await probeRes.json();
    return {
      ...match,
      ig_username: probeData.username || match.ig_username,
      ig_name: probeData.name || match.ig_name,
      ig_profile_picture_url: probeData.profile_picture_url || match.ig_profile_picture_url
    };
  }

  return match;
}

/**
 * Safe Instagram diagnostics check.
 * Verifies account existence AND tests real publishing capability via content_publishing_limit.
 */
export async function verifyInstagramPublishCapability(env, accessToken, igUserId) {
  const version = getGraphVersion(env);
  const cleanId = String(igUserId || '').trim();

  if (!accessToken || !cleanId) {
    return {
      connected: false,
      ig_user_id: cleanId || null,
      ig_username: null,
      has_access_token: false,
      can_publish: false,
      error: 'Missing Access Token or Instagram Account ID'
    };
  }

  try {
    // 1. Account info probe
    const testUrl = `${GRAPH_BASE}/${version}/${cleanId}?fields=id,username,name,profile_picture_url&access_token=${accessToken}`;
    const res = await fetch(testUrl);

    if (!res.ok) {
      const errText = await res.text();
      let errorMsg = `Meta API error (${res.status})`;
      try {
        const errJson = JSON.parse(errText);
        errorMsg = errJson?.error?.message || errorMsg;
      } catch {}

      return {
        connected: false,
        ig_user_id: cleanId,
        ig_username: null,
        has_access_token: true,
        can_publish: false,
        error: errorMsg
      };
    }

    const data = await res.json();

    // 2. Real Publishing Capability Probe via content_publishing_limit
    let canPublish = false;
    let quotaUsage = null;
    let quotaTotal = null;
    let publishError = null;

    try {
      const quotaUrl = `${GRAPH_BASE}/${version}/${cleanId}/content_publishing_limit?fields=quota_usage,config&access_token=${accessToken}`;
      const quotaRes = await fetch(quotaUrl);

      if (quotaRes.ok) {
        const quotaData = await quotaRes.json();
        const limitItem = quotaData?.data?.[0];
        if (limitItem) {
          canPublish = true;
          quotaUsage = limitItem.quota_usage ?? 0;
          quotaTotal = limitItem.config?.quota_total ?? 50;
        } else {
          canPublish = true;
        }
      } else {
        const quotaErrText = await quotaRes.text();
        try {
          const parsedErr = JSON.parse(quotaErrText);
          if (parsedErr?.error?.code === 200 || parsedErr?.error?.code === 10) {
            publishError = "Permission 'instagram_content_publish' is not active or account is not eligible for Reels publishing.";
          } else {
            publishError = parsedErr?.error?.message || 'Publishing capability probe returned an error.';
          }
        } catch {
          publishError = quotaErrText;
        }
      }
    } catch (e) {
      publishError = e.message;
    }

    return {
      connected: true,
      ig_user_id: cleanId,
      ig_username: data.username || 'instagram_creator',
      ig_name: data.name || '',
      ig_profile_picture_url: data.profile_picture_url || null,
      has_access_token: true,
      can_publish: canPublish,
      quotaUsage,
      quotaTotal,
      error: publishError
    };
  } catch (err) {
    return {
      connected: false,
      ig_user_id: cleanId,
      ig_username: null,
      has_access_token: true,
      can_publish: false,
      error: err.message
    };
  }
}

/**
 * Helper to wait / sleep
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Publish an Instagram Reel via Meta Graph API Container Ingestion Workflow
 *
 * 4-Phase Flow:
 * Phase 1: POST /{ig_user_id}/media -> returns container_id
 * Phase 2: Smart Backoff Poll /{container_id} until status_code === 'FINISHED'
 * Phase 3: POST /{ig_user_id}/media_publish -> returns media_id
 * Phase 4: GET /{media_id}?fields=permalink -> returns permalink
 */
export async function publishInstagramReel(env, accessToken, igUserId, {
  b2DownloadUrl,
  caption = '',
  shareToFeed = true,
  scheduledAt = null
}) {
  const version = getGraphVersion(env);
  const cleanIgUserId = String(igUserId || '').trim();

  if (!cleanIgUserId || !accessToken) {
    throw new Error('Instagram User ID and Access Token are required for publishing.');
  }

  if (!b2DownloadUrl) {
    throw new Error('Video download URL is required for Instagram ingestion.');
  }

  // ── Phase 1: Create Instagram Reel Media Container ──
  const containerUrl = `${GRAPH_BASE}/${version}/${cleanIgUserId}/media`;
  const containerPayload = {
    media_type: 'REELS',
    video_url: b2DownloadUrl,
    caption: caption || '',
    share_to_feed: shareToFeed !== false,
    access_token: accessToken
  };

  // If scheduling, Meta requires scheduled_publish_time at container creation (UNIX epoch seconds)
  if (scheduledAt) {
    const scheduledEpoch = Math.floor(new Date(scheduledAt).getTime() / 1000);
    containerPayload.scheduled_publish_time = scheduledEpoch;
  }

  console.log('[IG Publish] Step 1: Creating Reel container for igUserId:', cleanIgUserId);
  const containerRes = await fetch(containerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(containerPayload)
  });

  if (!containerRes.ok) {
    const errText = await containerRes.text();
    let friendlyMessage = `Failed to create Instagram Reel container: ${errText}`;
    try {
      const errObj = JSON.parse(errText);
      const code = errObj?.error?.code;
      const subcode = errObj?.error?.error_subcode;
      const message = errObj?.error?.message;
      const traceId = errObj?.error?.fbtrace_id;

      if (code === 200 || code === 10) {
        friendlyMessage = `Instagram Permission Error (Code ${code}): The connected account does not have permission to publish Reels. Ensure 'instagram_content_publish' is granted and account is a Professional Creator/Business account.`;
      } else if (message) {
        friendlyMessage = `Meta API Error (${code}${subcode ? `:${subcode}` : ''}): ${message}${traceId ? ` [trace: ${traceId}]` : ''}`;
      }
    } catch {}
    throw new Error(friendlyMessage);
  }

  const containerData = await containerRes.json();
  const containerId = containerData.id;

  if (!containerId) {
    throw new Error('Meta did not return a valid Instagram container_id.');
  }

  console.log('[IG Publish] Step 1 ✓ Container created:', containerId, 'Now polling status with smart backoff...');

  // ── Phase 2: Poll Container Status until Meta Finishes Ingestion & Encoding ──
  let isFinished = false;
  const maxAttempts = 30;
  let attempt = 0;
  let delayMs = 2500;

  while (!isFinished && attempt < maxAttempts) {
    attempt++;
    await sleep(delayMs);
    // Gradually back off polling interval (2.5s -> 3.5s -> 4.5s max)
    delayMs = Math.min(4500, delayMs + 300);

    const statusUrl = `${GRAPH_BASE}/${version}/${containerId}?fields=status_code,status&access_token=${accessToken}`;
    const statusRes = await fetch(statusUrl);

    if (statusRes.ok) {
      const statusData = await statusRes.json();
      const statusCode = statusData.status_code;
      console.log(`[IG Publish] Polling attempt ${attempt}/${maxAttempts} - status:`, statusCode);

      if (statusCode === 'FINISHED') {
        isFinished = true;
        break;
      } else if (statusCode === 'ERROR') {
        const errMsg = statusData.status || 'Meta video transcoding encountered an error.';
        throw new Error(`Instagram video processing failed: ${errMsg}`);
      } else if (statusCode === 'EXPIRED') {
        throw new Error('Instagram media container expired before publishing completed. Please try again.');
      }
    } else {
      console.warn('[IG Publish] Status poll warning:', await statusRes.text());
    }
  }

  if (!isFinished) {
    throw new Error('Instagram video processing timed out while waiting for Meta to encode the video stream.');
  }

  console.log('[IG Publish] Step 2 ✓ Container processing FINISHED. Step 3: Publishing media container...');

  // ── Phase 3: Publish Container ──
  const publishUrl = `${GRAPH_BASE}/${version}/${cleanIgUserId}/media_publish`;
  const publishRes = await fetch(publishUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: containerId,
      access_token: accessToken
    })
  });

  if (!publishRes.ok) {
    const errText = await publishRes.text();
    let errDetail = errText;
    try {
      const parsed = JSON.parse(errText);
      errDetail = parsed?.error?.message || errText;
    } catch {}
    throw new Error(`Failed to publish Instagram media container: ${errDetail}`);
  }

  const publishData = await publishRes.json();
  const mediaId = publishData.id;

  console.log('[IG Publish] Step 3 ✓ Media published with ID:', mediaId);

  // ── Phase 4: Retrieve Permalink ──
  let permalink = `https://www.instagram.com/reel/`;
  try {
    const mediaInfoUrl = `${GRAPH_BASE}/${version}/${mediaId}?fields=id,permalink,shortcode&access_token=${accessToken}`;
    const mediaInfoRes = await fetch(mediaInfoUrl);
    if (mediaInfoRes.ok) {
      const mediaInfoData = await mediaInfoRes.json();
      if (mediaInfoData.permalink) {
        permalink = mediaInfoData.permalink;
      }
    }
  } catch (e) {
    console.warn('[IG Publish] Failed to fetch permalink, using default:', e.message);
  }

  return {
    success: true,
    mediaId,
    containerId,
    postUrl: permalink,
    status: scheduledAt ? 'scheduled' : 'published',
    publishData
  };
}
