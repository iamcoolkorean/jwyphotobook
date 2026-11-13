import {
  computeCanvasDrawSpecs,
  parseRemotePhotobooksPayload,
  ParsedRemoteConfig,
} from '../utils/githubSync.ts';

export interface GitHubCommitResult {
  success: boolean;
  commitSha?: string;
  url?: string;
  error?: string;
}

/**
 * Checks connection and permissions to the user's GitHub repository.
 */
export async function testGitHubConnection(
  token: string,
  owner: string,
  repo: string
): Promise<{ success: boolean; repoName?: string; error?: string }> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: `GitHub API error (${res.status}): ${err}` };
    }

    const data = await res.json();
    return { success: true, repoName: data.full_name };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error reaching GitHub' };
  }
}

/**
 * Commits or updates a text or JSON file in the target GitHub repository.
 */
export async function commitFileToGitHub(
  token: string,
  owner: string,
  repo: string,
  path: string,
  contentStr: string,
  message: string,
  branch: string = 'main'
): Promise<GitHubCommitResult> {
  try {
    // 1. Check if file exists to fetch sha
    let existingSha: string | undefined;
    const checkRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );

    if (checkRes.ok) {
      const existingData = await checkRes.json();
      existingSha = existingData.sha;
    }

    // Convert utf-8 string to base64
    const base64Content = btoa(unescape(encodeURIComponent(contentStr)));

    const putRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          content: base64Content,
          branch,
          sha: existingSha,
        }),
      }
    );

    if (!putRes.ok) {
      const errText = await putRes.text();
      return { success: false, error: `GitHub commit failed (${putRes.status}): ${errText}` };
    }

    const result = await putRes.json();
    return {
      success: true,
      commitSha: result.commit?.sha,
      url: result.content?.html_url,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Commit operation failed' };
  }
}

/**
 * Generates an actual square (1:1) white-matted image using HTML5 Canvas
 * and exports it as a pure base64 string for committing to GitHub.
 */
export async function renderSquareMatteBase64(
  imgUrl: string,
  targetCanvasSize: number = 2000,
  paddingRatio: number = 0.025
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        // Preserve maximum native fidelity: canvas matches or exceeds natural photo dimensions
        const naturalW = img.naturalWidth || img.width || 2400;
        const naturalH = img.naturalHeight || img.height || 2400;
        const finalCanvasSize = Math.max(targetCanvasSize, Math.max(naturalW, naturalH));

        const canvas = document.createElement('canvas');
        canvas.width = finalCanvasSize;
        canvas.height = finalCanvasSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D context not available'));
          return;
        }

        // Enable high-quality image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Fill pure museum white matting background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, finalCanvasSize, finalCanvasSize);

        // Compute aspect-ratio preserved centered coordinates
        const specs = computeCanvasDrawSpecs(
          naturalW,
          naturalH,
          finalCanvasSize,
          paddingRatio
        );

        ctx.drawImage(img, specs.dx, specs.dy, specs.dw, specs.dh);

        // Export as maximum-fidelity JPEG (0.98 quality) or PNG
        const dataUrl = canvas.toDataURL('image/jpeg', 0.98);
        const base64Data = dataUrl.split(',')[1];
        resolve(base64Data);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => {
      reject(new Error(`Failed to load image from: ${imgUrl}`));
    };
    img.src = imgUrl;
  });
}

/**
 * Commits a binary/base64 square image file directly to GitHub repo.
 */
export async function commitSquareImageToGitHub(
  token: string,
  owner: string,
  repo: string,
  filePath: string,
  base64Content: string,
  message: string,
  branch: string = 'main'
): Promise<GitHubCommitResult> {
  try {
    let existingSha: string | undefined;
    const checkRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );

    if (checkRes.ok) {
      const data = await checkRes.json();
      existingSha = data.sha;
    }

    const putRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          content: base64Content,
          branch,
          sha: existingSha,
        }),
      }
    );

    if (!putRes.ok) {
      const err = await putRes.text();
      return { success: false, error: `GitHub image upload failed (${putRes.status}): ${err}` };
    }

    const result = await putRes.json();
    return {
      success: true,
      commitSha: result.commit?.sha,
      url: result.content?.html_url,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to upload image to GitHub' };
  }
}

/**
 * Fetches the latest published photobooks configuration from GitHub repository.
 * Attempts fast public raw.githubusercontent.com first (zero auth needed for visitors).
 * If raw fetch returns 404/403 or fails, attempts GitHub Contents API (supports PAT if available).
 */
export async function fetchRemotePhotobooksConfig(
  owner: string,
  repo: string,
  branch: string = 'main',
  token?: string
): Promise<ParsedRemoteConfig | null> {
  if (!owner || !repo) return null;

  // 1. Try public raw content (works without token for public repos and avoids GitHub API rate limits)
  try {
    const nonce = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/data/photobooks.json?_t=${nonce}`;
    const rawRes = await fetch(rawUrl, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });
    if (rawRes.ok) {
      const json = await rawRes.json();
      const parsed = parseRemotePhotobooksPayload(json);
      if (parsed) return parsed;
    }
  } catch {
    // Continue to GitHub API fallback
  }

  // 2. Fallback to GitHub API (supports private repos if token is provided, always fresh from git tree)
  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/data/photobooks.json?ref=${branch}&_t=${Date.now()}`;
    const apiRes = await fetch(apiUrl, { headers, cache: 'no-store' });
    if (apiRes.ok) {
      const data = await apiRes.json();
      if (data && data.content) {
        // Base64 decoded utf-8 content
        const decoded = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
        const parsed = parseRemotePhotobooksPayload(decoded);
        if (parsed) return parsed;
      }
    }
  } catch (err) {
    console.warn('GitHub API fetch failed:', err);
  }

  return null;
}

