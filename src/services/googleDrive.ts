import { GoogleDriveFile } from '../types/photobook.ts';

export interface GoogleDriveFolder {
  id: string;
  name: string;
  createdTime?: string;
  modifiedTime?: string;
}

/**
 * Searches specifically for the '사진' folder (or specified folder name) in Google Drive.
 * Includes supportsAllDrives=true and high pageSize to prevent pagination truncation.
 */
export async function findDriveFoldersByName(
  accessToken: string,
  targetName: string = '사진'
): Promise<GoogleDriveFolder[]> {
  // Query by exact name or name contains
  const query = encodeURIComponent(
    `mimeType = 'application/vnd.google-apps.folder' and name contains '${targetName}' and trashed = false`
  );
  const fields = encodeURIComponent('files(id, name, createdTime, modifiedTime)');
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=${fields}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google Drive API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return (data.files || []) as GoogleDriveFolder[];
}

/**
 * Lists child folders (sub-albums) inside a parent folder (e.g. inside the '사진' folder).
 */
export async function listSubfolders(
  accessToken: string,
  parentFolderId: string
): Promise<GoogleDriveFolder[]> {
  const query = encodeURIComponent(
    `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  const fields = encodeURIComponent('files(id, name, createdTime, modifiedTime)');
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&pageSize=100&orderBy=name&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=${fields}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google Drive API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return (data.files || []) as GoogleDriveFolder[];
}

/**
 * Fetches folder details by its ID (useful for direct ID entry or URL pasting).
 */
export async function getDriveFolderById(
  accessToken: string,
  folderId: string
): Promise<GoogleDriveFolder> {
  const fields = encodeURIComponent('id, name, createdTime, modifiedTime');
  const url = `https://www.googleapis.com/drive/v3/files/${folderId}?supportsAllDrives=true&fields=${fields}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Folder lookup error (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as GoogleDriveFolder;
}

/**
 * Parses a Google Drive folder ID from a folder share URL, drive URL, or raw ID.
 */
export function extractFolderId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }
  const matchIdParam = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchIdParam && matchIdParam[1]) {
    return matchIdParam[1];
  }
  return trimmed;
}

/**
 * Lists user folders in Google Drive for folder-to-monograph conversion.
 * Expanded pageSize to 100 with supportsAllDrives=true.
 */
export async function listDriveFolders(
  accessToken: string,
  pageSize: number = 100
): Promise<GoogleDriveFolder[]> {
  const query = encodeURIComponent("mimeType = 'application/vnd.google-apps.folder' and trashed = false");
  const fields = encodeURIComponent('files(id, name, createdTime, modifiedTime)');
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&pageSize=${pageSize}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=${fields}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google Drive API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return (data.files || []) as GoogleDriveFolder[];
}

/**
 * Fetches list of image files inside a specific Google Drive folder.
 * Uses high pageSize and full metadata.
 */
export async function listDriveImagesInFolder(
  accessToken: string,
  folderId: string,
  pageSize: number = 100
): Promise<GoogleDriveFile[]> {
  const query = encodeURIComponent(`'${folderId}' in parents and mimeType contains 'image/' and trashed = false`);
  const fields = encodeURIComponent(
    'files(id, name, mimeType, thumbnailLink, webContentLink, webViewLink, createdTime, modifiedTime, size, imageMediaMetadata)'
  );
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&pageSize=${pageSize}&orderBy=name&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=${fields}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google Drive API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return (data.files || []) as GoogleDriveFile[];
}

/**
 * Fetches general list of image files from Google Drive using the provided Bearer token.
 */
export async function listDriveImages(
  accessToken: string,
  pageSize: number = 50
): Promise<GoogleDriveFile[]> {
  const query = encodeURIComponent("mimeType contains 'image/' and trashed = false");
  const fields = encodeURIComponent(
    'files(id, name, mimeType, thumbnailLink, webContentLink, webViewLink, createdTime, modifiedTime, size, imageMediaMetadata)'
  );
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&pageSize=${pageSize}&orderBy=modifiedTime%20desc&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=${fields}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google Drive API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return (data.files || []) as GoogleDriveFile[];
}

/**
 * Fetches the binary image content of a Drive file and converts it to a local Blob URL
 * for clean, authenticated rendering in the browser at maximum native resolution.
 */
export async function fetchDriveImageBlobUrl(
  accessToken: string,
  fileId: string
): Promise<string> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to load Drive image media: ${response.status}`);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/**
 * Fetches the binary image content of a Drive file and converts it to a persistent Data URL (base64).
 * Unlike blob URLs (which expire when the page is reloaded), Data URLs persist in localStorage,
 * avoid CORS and third-party cookie restrictions, and are always visible.
 */
export async function fetchDriveImageAsDataUrl(
  accessToken: string,
  fileId: string
): Promise<string> {
  // 1. Try direct media download
  try {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.ok) {
      const blob = await response.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
  } catch (err) {
    console.warn('Direct media download failed, attempting metadata thumbnail fallback:', err);
  }

  // 2. Fallback: query thumbnailLink with Bearer token
  try {
    const metaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=thumbnailLink,webContentLink&supportsAllDrives=true`;
    const metaRes = await fetch(metaUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (metaRes.ok) {
      const meta = await metaRes.json();
      const thumb = meta.thumbnailLink?.replace(/=s\d+/, '=s1600') || meta.thumbnailLink;
      if (thumb) {
        const thumbRes = await fetch(thumb);
        if (thumbRes.ok) {
          const blob = await thumbRes.blob();
          return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }
      }
    }
  } catch (err) {
    console.warn('Metadata thumbnail fallback failed:', err);
  }

  throw new Error(`Unable to fetch Drive image data for ${fileId}`);
}

/**
 * Uploads an image file to Google Drive using multipart upload.
 * Note: Must be preceded by explicit user confirmation in the UI.
 */
export async function uploadImageToDrive(
  accessToken: string,
  file: File,
  customName?: string,
  targetFolderId?: string
): Promise<GoogleDriveFile> {
  const metadata: any = {
    name: customName || file.name,
    mimeType: file.type || 'image/jpeg',
    description: 'Archived via JWY PHOTO BOOK Minimalist Monograph',
  };

  if (targetFolderId) {
    metadata.parents = [targetFolderId];
  }

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const reader = file.stream().getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const fileBytes = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    fileBytes.set(c, offset);
    offset += c.length;
  }

  const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
    metadata
  )}`;
  const mediaPartHeader = `${delimiter}Content-Type: ${file.type || 'image/jpeg'}\r\n\r\n`;

  const enc = new TextEncoder();
  const metaBytes = enc.encode(metadataPart);
  const mediaHeaderBytes = enc.encode(mediaPartHeader);
  const closeBytes = enc.encode(closeDelimiter);

  const totalLength = metaBytes.length + mediaHeaderBytes.length + fileBytes.length + closeBytes.length;
  const body = new Uint8Array(totalLength);
  let pos = 0;
  body.set(metaBytes, pos);
  pos += metaBytes.length;
  body.set(mediaHeaderBytes, pos);
  pos += mediaHeaderBytes.length;
  body.set(fileBytes, pos);
  pos += fileBytes.length;
  body.set(closeBytes, pos);

  const uploadUrl =
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,thumbnailLink,webContentLink,webViewLink,createdTime,size,imageMediaMetadata';
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: body,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Drive upload error (${response.status}): ${errText}`);
  }

  return (await response.json()) as GoogleDriveFile;
}
