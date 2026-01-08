/**
 * Open Graph Image Fetcher
 *
 * Fetches og:image meta tags from article URLs for thumbnails
 */

const OG_FETCH_TIMEOUT = 10000; // 10 seconds
const MAX_IMAGE_URL_LENGTH = 2000;

/**
 * Fetch Open Graph image URL from an article
 */
export async function fetchOgImage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OG_FETCH_TIMEOUT);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AI-Companions-Watch/1.0 (+https://github.com/ai-companions-watch)',
        'Accept': 'text/html',
      },
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    // Only read first 50KB to find meta tags (they're in <head>)
    const reader = response.body?.getReader();
    if (!reader) return null;

    let html = '';
    const decoder = new TextDecoder();
    const maxBytes = 50 * 1024;

    while (html.length < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });

      // Early exit if we've passed </head>
      if (html.includes('</head>')) break;
    }

    reader.cancel();

    return extractOgImage(html);
  } catch (error) {
    // Silently fail - images are optional
    console.debug(`Failed to fetch OG image from ${url}:`, (error as Error).message);
    return null;
  }
}

/**
 * Extract og:image from HTML
 */
function extractOgImage(html: string): string | null {
  // Try og:image first
  const ogImageMatch = html.match(
    /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i
  ) || html.match(
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i
  );

  if (ogImageMatch?.[1]) {
    return validateImageUrl(ogImageMatch[1]);
  }

  // Fallback to twitter:image
  const twitterImageMatch = html.match(
    /<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i
  ) || html.match(
    /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i
  );

  if (twitterImageMatch?.[1]) {
    return validateImageUrl(twitterImageMatch[1]);
  }

  return null;
}

/**
 * Validate and clean image URL
 */
function validateImageUrl(url: string): string | null {
  if (!url || url.length > MAX_IMAGE_URL_LENGTH) {
    return null;
  }

  // Decode HTML entities
  const decoded = url
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();

  // Must be http/https URL
  if (!decoded.startsWith('http://') && !decoded.startsWith('https://')) {
    return null;
  }

  // Basic URL validation
  try {
    const parsedUrl = new URL(decoded);

    // Skip dynamic OG images with long query strings (often unreliable)
    if (parsedUrl.search.length > 200) {
      return null;
    }

    // Skip known dynamic OG generators that may not work reliably
    if (parsedUrl.pathname.includes('/api/og') || parsedUrl.pathname.includes('/og-image')) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

/**
 * Batch fetch OG images for multiple URLs
 * Limits concurrency to avoid overwhelming servers
 */
export async function fetchOgImagesBatch(
  urls: string[],
  concurrency = 3
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();

  // Process in batches
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const promises = batch.map(async (url) => {
      const imageUrl = await fetchOgImage(url);
      results.set(url, imageUrl);
    });
    await Promise.all(promises);
  }

  return results;
}
