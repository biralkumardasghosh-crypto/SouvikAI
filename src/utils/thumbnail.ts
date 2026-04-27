/**
 * Client-side thumbnail generator.
 *
 * Used by the attachment pipeline so that:
 *  • the input UI always has a real preview without re-decoding the full image
 *  • the message-history DB row stores a compact preview (~10–50 KB) instead of
 *    the full base64 (~1–7 MB), keeping chat_messages rows lean.
 *
 * Output is WebP for size; we fall back to JPEG on the very rare browser
 * without WebP encode support.
 */

const DEFAULT_MAX_DIMENSION = 384;
const DEFAULT_QUALITY = 0.72;

export async function generateThumbnail(
    dataUrl: string,
    maxDimension: number = DEFAULT_MAX_DIMENSION,
    quality: number = DEFAULT_QUALITY,
): Promise<string> {
    if (typeof window === 'undefined' || !dataUrl.startsWith('data:image/')) {
        return dataUrl;
    }

    const img = await loadImage(dataUrl);

    // Already small? Skip the canvas round-trip.
    if (img.width <= maxDimension && img.height <= maxDimension) {
        return dataUrl;
    }

    const ratio = Math.min(maxDimension / img.width, maxDimension / img.height);
    const w = Math.max(1, Math.round(img.width * ratio));
    const h = Math.max(1, Math.round(img.height * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);

    // Try WebP first, fall back to JPEG.
    try {
        const webp = canvas.toDataURL('image/webp', quality);
        if (webp.startsWith('data:image/webp')) return webp;
    } catch {
        // ignore — fall through to JPEG
    }
    return canvas.toDataURL('image/jpeg', quality);
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to decode image for thumbnail'));
        img.src = src;
    });
}
