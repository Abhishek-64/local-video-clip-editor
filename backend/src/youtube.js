/**
 * YouTube Data API v3 helpers for Cloudflare Worker
 *
 * Key principle: Video blobs are NEVER touched by this Worker.
 * We only create resumable upload sessions (returning an uploadUrl to the browser)
 * and manage metadata/scheduling via the YouTube API.
 * The actual video bytes travel directly from the browser to YouTube's servers.
 */

const YT_BASE = 'https://www.googleapis.com/youtube/v3';
const YT_UPLOAD_BASE = 'https://www.googleapis.com/upload/youtube/v3';

/**
 * Normalize tags for YouTube Data API v3.
 * YouTube snippet.tags expects an array of clean string keywords (no '#' prefix, no '<' or '>').
 * Limits: Max 50 tags, total character length <= 500 chars.
 */
export function normalizeYouTubeTags(rawTags) {
  if (!rawTags) return [];
  let list = [];
  if (Array.isArray(rawTags)) {
    list = rawTags;
  } else if (typeof rawTags === 'string') {
    try {
      const parsed = JSON.parse(rawTags);
      if (Array.isArray(parsed)) list = parsed;
      else list = rawTags.split(/[\s,]+/);
    } catch {
      list = rawTags.split(/[\s,]+/);
    }
  }

  const seen = new Set();
  const cleanTags = [];
  let totalChars = 0;

  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    let clean = raw.trim().replace(/^#+/, '').replace(/[<>]/g, '').trim();
    if (!clean) continue;
    const lower = clean.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);

    if (clean.length > 100) clean = clean.substring(0, 100);
    if (totalChars + clean.length > 480) break;
    totalChars += clean.length;
    cleanTags.push(clean);
    if (cleanTags.length >= 50) break;
  }

  return cleanTags;
}

/**
 * Create a YouTube resumable upload session.
 *
 * Returns the upload URL that the browser will use to upload directly to YouTube.
 * The video bytes never touch the Worker or D1.
 *
 * @param {string} accessToken - Valid YouTube access token
 * @param {object} metadata - { title, description, tags, visibility, categoryId, madeForKids, scheduledAt }
 * @param {object} videoInfo - { size, mimeType }
 * @returns {{ uploadUrl: string, videoId?: string }}
 */
export async function createResumableUploadSession(accessToken, metadata, videoInfo, origin) {
  const cleanTags = normalizeYouTubeTags(metadata.tags);
  const safeTitle = (metadata.title || 'Untitled Video').trim().slice(0, 100);
  const safeDescription = (metadata.description || '').trim().slice(0, 5000);

  const snippet = {
    title: safeTitle,
    description: safeDescription,
    tags: cleanTags,
    categoryId: String(metadata.categoryId || metadata.category || '22')
  };

  const status = {
    privacyStatus: metadata.visibility || 'private',
    selfDeclaredMadeForKids: metadata.madeForKids || false
  };

  // If scheduled, set publishAt and override to private (YouTube requires private for scheduled)
  if (metadata.scheduledAt) {
    try {
      const scheduledDate = new Date(metadata.scheduledAt);
      if (!isNaN(scheduledDate.getTime()) && scheduledDate.getTime() > Date.now()) {
        status.privacyStatus = 'private';
        status.publishAt = scheduledDate.toISOString();
      } else {
        status.privacyStatus = metadata.visibility || 'private';
      }
    } catch {
      status.privacyStatus = metadata.visibility || 'private';
    }
  }

  const body = JSON.stringify({
    snippet,
    status
  });

  const params = new URLSearchParams({
    uploadType: 'resumable',
    part: 'snippet,status'
  });

  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json; charset=UTF-8',
    'X-Upload-Content-Type': videoInfo?.mimeType || 'video/mp4',
    'X-Upload-Content-Length': String(videoInfo?.size || 0)
  };

  if (origin) {
    headers['Origin'] = origin;
  }

  const res = await fetch(`${YT_UPLOAD_BASE}/videos?${params.toString()}`, {
    method: 'POST',
    headers,
    body
  });

  if (!res.ok) {
    const errText = await res.text();
    let parsed;
    try { parsed = JSON.parse(errText); } catch {}
    const reason = parsed?.error?.message || errText || `HTTP ${res.status}`;
    throw new Error(`YouTube upload session creation failed: ${reason}`);
  }

  const uploadUrl = res.headers.get('Location');
  if (!uploadUrl) {
    throw new Error('YouTube did not return an upload URL');
  }

  return { uploadUrl };
}

/**
 * Update an existing video's metadata (title, description, visibility, schedule, etc.)
 * Used after upload to set scheduling or update metadata.
 */
export async function updateVideoMetadata(accessToken, videoId, metadata) {
  const status = {
    privacyStatus: metadata.visibility || 'private',
    selfDeclaredMadeForKids: metadata.madeForKids || false
  };

  if (metadata.scheduledAt) {
    try {
      const scheduledDate = new Date(metadata.scheduledAt);
      if (!isNaN(scheduledDate.getTime()) && scheduledDate.getTime() > Date.now()) {
        status.privacyStatus = 'private';
        status.publishAt = scheduledDate.toISOString();
      } else {
        status.privacyStatus = metadata.visibility || 'private';
      }
    } catch {
      status.privacyStatus = metadata.visibility || 'private';
    }
  }

  const cleanTags = normalizeYouTubeTags(metadata.tags);
  const safeTitle = (metadata.title || 'Untitled Video').trim().slice(0, 100);
  const safeDescription = (metadata.description || '').trim().slice(0, 5000);

  const body = JSON.stringify({
    id: videoId,
    snippet: {
      title: safeTitle,
      description: safeDescription,
      tags: cleanTags,
      categoryId: metadata.categoryId || '22'
    },
    status
  });

  const res = await fetch(`${YT_BASE}/videos?part=snippet,status`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Video metadata update failed: ${err}`);
  }

  return res.json();
}

/**
 * Get the current status of a YouTube video.
 */
export async function getVideoStatus(accessToken, videoId) {
  const res = await fetch(
    `${YT_BASE}/videos?part=status,snippet&id=${encodeURIComponent(videoId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );

  if (!res.ok) {
    throw new Error(`Video status fetch failed: ${res.status}`);
  }

  const data = await res.json();
  const video = data.items?.[0];
  if (!video) return null;

  return {
    id: video.id,
    title: video.snippet?.title,
    status: video.status?.uploadStatus,
    privacyStatus: video.status?.privacyStatus,
    publishAt: video.status?.publishAt
  };
}

/**
 * Build the YouTube watch URL from a video ID.
 */
export function buildYouTubeUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Build the YouTube Studio edit URL from a video ID.
 */
export function buildYouTubeStudioUrl(videoId) {
  return `https://studio.youtube.com/video/${videoId}/edit`;
}
