/**
 * On-Device Vision Redaction Engine
 * 
 * Part of the SIH Lightweight On-Device Visual Perception Pipeline.
 * Performs dynamic detection and visual redaction of sensitive visual regions
 * (passwords, PII, financial cards, secret keys, faces) directly inside the
 * browser before any network transmission occurs.
 */

import {
  REGION_KIND,
  selectRedactionRegions,
  mapRegionsToImage,
  pixelateDataUrl,
} from './screenshot-redaction.js';

export { REGION_KIND };

/**
 * Calculate Intersection over Union (IoU) between two bounding boxes.
 * @param {{x:number, y:number, w:number, h:number}} a 
 * @param {{x:number, y:number, w:number, h:number}} b 
 * @returns {number} IoU between 0 and 1
 */
export function calculateIoU(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);

  const intersectionW = Math.max(0, x2 - x1);
  const intersectionH = Math.max(0, y2 - y1);
  const intersectionArea = intersectionW * intersectionH;

  const areaA = a.w * a.h;
  const areaB = b.w * b.h;
  const unionArea = areaA + areaB - intersectionArea;

  return unionArea > 0 ? intersectionArea / unionArea : 0;
}

/**
 * Merge overlapping or contiguous redaction boxes using Non-Maximum Suppression (NMS) / box merging.
 * @param {Array<{kind: string, rect: {x:number, y:number, w:number, h:number}}>} regions 
 * @param {number} [iouThreshold=0.3] 
 * @returns {Array<{kind: string, rect: {x:number, y:number, w:number, h:number}}>}
 */
export function mergeOverlappingRegions(regions, iouThreshold = 0.3) {
  if (!Array.isArray(regions) || regions.length <= 1) return regions || [];

  const merged = [];
  const visited = new Uint8Array(regions.length);

  for (let i = 0; i < regions.length; i++) {
    if (visited[i]) continue;
    let current = { ...regions[i], rect: { ...regions[i].rect } };
    visited[i] = 1;

    for (let j = i + 1; j < regions.length; j++) {
      if (visited[j]) continue;
      const other = regions[j];
      const iou = calculateIoU(current.rect, other.rect);
      
      // If boxes significantly overlap, merge them into a single bounding box
      if (iou > iouThreshold || (calculateIoU(current.rect, other.rect) > 0 && current.kind === other.kind)) {
        visited[j] = 1;
        const x1 = Math.min(current.rect.x, other.rect.x);
        const y1 = Math.min(current.rect.y, other.rect.y);
        const x2 = Math.max(current.rect.x + current.rect.w, other.rect.x + other.rect.w);
        const y2 = Math.max(current.rect.y + current.rect.h, other.rect.y + other.rect.h);
        current.rect = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
      }
    }
    merged.push(current);
  }

  return merged;
}

/**
 * Perform end-to-end on-device visual sanitization on a captured screenshot.
 *
 * @param {string} rawScreenshotDataUrl Base64 data URL of the raw screenshot
 * @param {Array<object>} domElements DOM elements with rects & text
 * @param {object} [opts]
 * @param {Array<object>} [opts.visualDetections] Optional visual model detections (faces, cards)
 * @param {number} [opts.scale=1] Viewport scale factor
 * @param {number} [opts.block=12] Pixelation block size
 * @param {string} [opts.maskStyle='pixelate'] 'pixelate' | 'solid'
 * @returns {Promise<{
 *   sanitizedDataUrl: string,
 *   stats: {
 *     latencyMs: number,
 *     regionsCount: number,
 *     byKind: Record<string, number>,
 *     totalMaskedAreaPx: number
 *   }
 * }>}
 */
export async function sanitizeScreenshotOnDevice(rawScreenshotDataUrl, domElements, opts = {}) {
  const startTime = Date.now();
  if (!rawScreenshotDataUrl) {
    return {
      sanitizedDataUrl: rawScreenshotDataUrl,
      stats: { latencyMs: 0, regionsCount: 0, byKind: {}, totalMaskedAreaPx: 0 }
    };
  }

  // 1. Select candidate redaction regions from DOM & heuristics
  const domRegions = selectRedactionRegions(domElements, {
    redactTextInputs: opts.redactTextInputs !== false,
    redactDetectedPii: opts.redactDetectedPii !== false,
    maxRegions: opts.maxRegions || 500,
    viewport: opts.viewport,
  });

  // 2. Include any direct visual detections (e.g. from on-device face detector)
  const visualRegions = Array.isArray(opts.visualDetections) ? opts.visualDetections : [];
  const combinedRegions = [...domRegions, ...visualRegions];

  // 3. Map CSS coordinate space to image pixel space
  const imageRegions = mapRegionsToImage(combinedRegions, {
    scale: opts.scale || 1,
    scaleX: opts.scaleX,
    scaleY: opts.scaleY,
    offsetX: opts.offsetX || 0,
    offsetY: opts.offsetY || 0,
    imageWidth: opts.imageWidth,
    imageHeight: opts.imageHeight,
  });

  // 4. Merge overlapping regions to optimize rendering speed
  const finalRegions = mergeOverlappingRegions(imageRegions, 0.2);

  // 5. Apply pixelation/masking on OffscreenCanvas
  let sanitizedDataUrl = rawScreenshotDataUrl;
  if (finalRegions.length > 0) {
    sanitizedDataUrl = await pixelateDataUrl(rawScreenshotDataUrl, finalRegions, {
      block: opts.block || 12,
    });
  }

  const latencyMs = Date.now() - startTime;

  // Compute audit statistics (retained strictly locally)
  const byKind = {};
  let totalMaskedAreaPx = 0;
  for (const r of finalRegions) {
    byKind[r.kind] = (byKind[r.kind] || 0) + 1;
    totalMaskedAreaPx += (r.rect.w * r.rect.h);
  }

  return {
    sanitizedDataUrl,
    stats: {
      latencyMs,
      regionsCount: finalRegions.length,
      byKind,
      totalMaskedAreaPx,
    },
  };
}
