/**
 * Meta Graph API v22.0 Helper for Cloudflare Worker
 * Handles Facebook Page OAuth, automated Page discovery, Reels Publishing, Page Video uploads, and Diagnostics.
 *
 * Strict Architecture:
 * - Meta OAuth requests only necessary Page publishing scopes (pages_show_list, pages_read_engagement, pages_manage_posts, public_profile).
 * - Page Access Tokens are retrieved strictly from Meta via /me/accounts.
 * - Manual token entry is completely prohibited.
 * - Sensitive tokens are encrypted server-side and never returned to the frontend.
 */

const GRAPH_BASE = 'https://graph.facebook.com';

export function getGraphVersion(env) {
  return env.META_GRAPH_API_VERSION || 'v22.0';
}

/**
 * Build Facebook OAuth Dialog URL
 */
export function buildFacebookAuthUrl(env, userId, frontendUrl = null, isPopup = false) {
  const version = getGraphVersion(env);
  const redirectUri = `${env.APP_URL}/api/facebook/callback`;
  const state = btoa(JSON.stringify({ userId, frontendUrl, isPopup, ts: Date.now() }));

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
  const redirectUri = `${env.APP_URL}/api/facebook/callback`;

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
  const testUrl = `${GRAPH_BASE}/${version}/${cleanPageId}?fields=id,name,tasks&access_token=${match.page_access_token}`;
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
 * Safe Page diagnostics check (verifies Page Access Token without exposing secrets)
 */
export async function verifyPagePublishCapability(env, pageAccessToken, pageId) {
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
      try {
        const errJson = JSON.parse(errText);
        errorMsg = errJson?.error?.message || errorMsg;
      } catch {}

      return {
        connected: false,
        page_id: cleanPageId,
        page_name: null,
        has_page_access_token: true,
        can_publish: false,
        error: errorMsg
      };
    }

    const data = await res.json();
    return {
      connected: true,
      page_id: cleanPageId,
      page_name: data.name || 'Facebook Page',
      has_page_access_token: true,
      can_publish: true
    };
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
 * Publish a Facebook Reel via Meta Graph API Reels API (3-phase workflow)
 */
export async function publishFacebookReel(env, pageAccessToken, pageId, {
  b2DownloadUrl,
  caption = '',
  title = '',
  scheduledAt = null
}) {
  const version = getGraphVersion(env);

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
      if (errObj?.error?.code === 200) {
        friendlyMessage = `Facebook Permission Error (#200): Subject does not have permission to post videos on this Page. Please ensure your Page has 'pages_manage_posts' & 'pages_read_engagement' permissions by re-authenticating with Facebook.`;
      } else if (errObj?.error?.message) {
        friendlyMessage = `Facebook API Error: ${errObj.error.message}`;
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

  // ── Step 2: Ingest Video Stream from B2 to Facebook ──
  // Attempt 1: High-Speed Meta Server-to-Server Ingestion via file_url header (0 Worker RAM overhead)
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
    access_token: pageAccessToken
  };

  if (title) {
    finishPayload.title = title;
  }

  if (scheduledAt) {
    const scheduledEpoch = Math.floor(new Date(scheduledAt).getTime() / 1000);
    finishPayload.video_state = 'SCHEDULED';
    finishPayload.scheduled_publish_time = scheduledEpoch;
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
  const permalinkUrl = `https://www.facebook.com/reel/${videoId}`;

  return {
    success: true,
    videoId,
    postUrl: permalinkUrl,
    status: scheduledAt ? 'scheduled' : 'published',
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
    payload.published = false;
    payload.scheduled_publish_time = scheduledEpoch;
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
