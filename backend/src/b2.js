/**
 * Backblaze B2 Helper for Cloudflare Worker
 * Handles temporary storage for Facebook Reels & Video ingestion.
 *
 * Flow:
 * 1. b2Authorize: Exchange B2_KEY_ID & B2_APPLICATION_KEY for authToken + apiUrl + downloadUrl
 * 2. b2GetUploadUrl: Obtain a presigned upload URL and auth token for client or worker upload
 * 3. b2GetDownloadUrl: Generate authorized download link for Facebook ingestion
 * 4. b2DeleteFile: Immediate cleanup of temporary file after upload completion
 */

let cachedAuth = null;
let cachedAuthExpiry = 0;

/**
 * Authorize Backblaze B2 Account
 */
export async function b2Authorize(env) {
  const keyId = env.B2_KEY_ID;
  const applicationKey = env.B2_APPLICATION_KEY;

  if (!keyId || !applicationKey) {
    throw new Error('Backblaze B2 credentials (B2_KEY_ID and B2_APPLICATION_KEY) are not configured.');
  }

  // Use cached token if valid (valid for 24h, refresh after 20h)
  if (cachedAuth && Date.now() < cachedAuthExpiry) {
    return cachedAuth;
  }

  const credentials = btoa(`${keyId}:${applicationKey}`);
  const res = await fetch('https://api.backblazeb2.com/b2api/v3/b2_authorize_account', {
    headers: {
      'Authorization': `Basic ${credentials}`
    }
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Backblaze B2 authorization failed: ${errText}`);
  }

  const data = await res.json();
  cachedAuth = {
    authorizationToken: data.authorizationToken,
    apiUrl: data.apiInfo?.storageApi?.apiUrl || data.apiUrl,
    downloadUrl: data.apiInfo?.storageApi?.downloadUrl || data.downloadUrl
  };
  cachedAuthExpiry = Date.now() + 20 * 60 * 60 * 1000; // 20 hours

  return cachedAuth;
}

/**
 * Get B2 Upload Target (URL + Token) for bucket
 */
export async function b2GetUploadUrl(env) {
  const auth = await b2Authorize(env);
  const bucketId = env.B2_BUCKET_ID;

  if (!bucketId) {
    throw new Error('B2_BUCKET_ID is not configured in environment.');
  }

  const res = await fetch(`${auth.apiUrl}/b2api/v3/b2_get_upload_url`, {
    method: 'POST',
    headers: {
      'Authorization': auth.authorizationToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ bucketId })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to get B2 upload URL: ${errText}`);
  }

  const data = await res.json();
  return {
    uploadUrl: data.uploadUrl,
    authorizationToken: data.authorizationToken,
    bucketId: data.bucketId
  };
}

/**
 * Generate Authorized Download URL for a specific file
 */
export async function b2GetDownloadUrl(env, fileName, validDurationInSeconds = 3600) {
  const auth = await b2Authorize(env);
  const bucketId = env.B2_BUCKET_ID;
  const bucketName = env.B2_BUCKET_NAME;

  const res = await fetch(`${auth.apiUrl}/b2api/v3/b2_get_download_authorization`, {
    method: 'POST',
    headers: {
      'Authorization': auth.authorizationToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      bucketId,
      fileNamePrefix: fileName,
      validDurationInSeconds
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to get B2 download authorization: ${errText}`);
  }

  const data = await res.json();
  const token = data.authorizationToken;

  return `${auth.downloadUrl}/file/${bucketName}/${encodeURIComponent(fileName)}?Authorization=${token}`;
}

/**
 * Delete a file from B2 bucket (immediate temporary storage cleanup)
 */
export async function b2DeleteFile(env, fileId, fileName) {
  if (!fileId || !fileName) return { success: false, reason: 'Missing fileId or fileName' };

  try {
    const auth = await b2Authorize(env);
    const res = await fetch(`${auth.apiUrl}/b2api/v3/b2_delete_file_version`, {
      method: 'POST',
      headers: {
        'Authorization': auth.authorizationToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fileId,
        fileName
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`B2 file deletion warning for ${fileName}:`, errText);
      return { success: false, error: errText };
    }

    return { success: true };
  } catch (err) {
    console.warn(`B2 file deletion error for ${fileName}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * List files stored in the Backblaze B2 bucket
 */
export async function b2ListFileNames(env, maxFileCount = 100) {
  const auth = await b2Authorize(env);
  const bucketId = env.B2_BUCKET_ID;

  if (!bucketId) {
    throw new Error('B2_BUCKET_ID is not configured in environment.');
  }

  const res = await fetch(`${auth.apiUrl}/b2api/v3/b2_list_file_names`, {
    method: 'POST',
    headers: {
      'Authorization': auth.authorizationToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      bucketId,
      maxFileCount
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to list B2 files (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const bucketName = env.B2_BUCKET_NAME || '';

  return (data.files || []).map(f => ({
    fileId: f.fileId,
    fileName: f.fileName,
    contentLength: f.contentLength,
    uploadTimestamp: f.uploadTimestamp,
    contentType: f.contentType,
    downloadUrl: `${auth.downloadUrl}/file/${bucketName}/${encodeURIComponent(f.fileName)}`
  }));
}

