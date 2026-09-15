import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REGION_KIND,
  selectRedactionRegions,
  mapRegionsToImage,
  rectIntersects,
} from '../src/chrome/src/agent/screenshot-redaction.js';
import {
  calculateIoU,
  mergeOverlappingRegions,
} from '../src/chrome/src/agent/vision-redaction-engine.js';
import {
  containsDomLeaks,
  sanitizeTextContent,
  sanitizeOutboundVlmPayload,
} from '../src/chrome/src/agent/privacy-airgap.js';
import {
  normalizeToViewportPx,
} from '../src/chrome/src/content/visual-grounding.js';

test('SIH Benchmark 1: Sensitive & PII Multi-Class Detection (Precision & Recall)', async (t) => {
  // Synthetic DOM elements representing mixed public and sensitive page content
  const testElements = [
    { kind: 'text', text: 'Contact us at support@example.com for help', rect: { x: 50, y: 100, w: 200, h: 20 } },
    { kind: 'text', text: 'Call +1 (555) 234-5678 today', rect: { x: 50, y: 130, w: 180, h: 20 } },
    { kind: 'text', text: 'Card: 4532-1234-5678-9010', rect: { x: 50, y: 160, w: 220, h: 20 } },
    { kind: 'text', text: 'API Secret: sk-proj-1234567890abcdefghijklmn', rect: { x: 50, y: 190, w: 250, h: 20 } },
    { kind: 'input', type: 'password', rect: { x: 50, y: 220, w: 150, h: 30 } },
    { kind: 'input', type: 'text', value: 'John Doe', rect: { x: 50, y: 260, w: 150, h: 30 } },
    { kind: 'face', rect: { x: 400, y: 100, w: 80, h: 80 } },
    // Public non-sensitive elements
    { kind: 'text', text: 'Welcome to Flight Search Portal', rect: { x: 50, y: 20, w: 300, h: 30 } },
    { kind: 'text', text: 'Search Results: 42 flights available', rect: { x: 50, y: 60, w: 250, h: 20 } },
  ];

  const regions = selectRedactionRegions(testElements, {
    redactTextInputs: true,
    redactDetectedPii: true,
  });

  // Expected true positives: email, phone, credit card, secret key, password, text input, face
  assert.equal(regions.length, 7, 'All 7 sensitive items should be detected');

  const kinds = regions.map(r => r.kind);
  assert.ok(kinds.includes(REGION_KIND.EMAIL), 'Email detected');
  assert.ok(kinds.includes(REGION_KIND.PHONE), 'Phone detected');
  assert.ok(kinds.includes(REGION_KIND.FINANCIAL), 'Credit card detected');
  assert.ok(kinds.includes(REGION_KIND.SECRET_KEY), 'API Secret key detected');
  assert.ok(kinds.includes(REGION_KIND.PASSWORD), 'Password field detected');
  assert.ok(kinds.includes(REGION_KIND.INPUT), 'Text input detected');
  assert.ok(kinds.includes(REGION_KIND.FACE), 'Face region detected');
});

test('SIH Benchmark 2: IoU Merging & Box Calculation Precision', async (t) => {
  const boxA = { x: 10, y: 10, w: 100, h: 50 };
  const boxB = { x: 20, y: 20, w: 100, h: 50 };
  const iou = calculateIoU(boxA, boxB);
  assert.ok(iou > 0.4 && iou < 0.8, `IoU should be ~0.53, got ${iou}`);

  const overlapping = [
    { kind: 'input', rect: { x: 10, y: 10, w: 100, h: 50 } },
    { kind: 'input', rect: { x: 20, y: 10, w: 110, h: 50 } },
  ];
  const merged = mergeOverlappingRegions(overlapping, 0.2);
  assert.equal(merged.length, 1, 'Overlapping input boxes should be merged into one');
  assert.equal(merged[0].rect.x, 10);
  assert.equal(merged[0].rect.w, 120);
});

test('SIH Benchmark 3: Zero-DOM Privacy Airgap Outbound Enforcement', async (t) => {
  const dirtyMessages = [
    {
      role: 'system',
      content: 'You are EDITH. Current page: <button id="submit" ref="e42">Book Flight</button>',
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Find flight to Delhi. Current state: <div>Prices: $350</div>' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,SANITIZED_PIXELS' } },
      ],
    },
  ];

  const { sanitizedMessages, leaksBlockedCount } = sanitizeOutboundVlmPayload(dirtyMessages);

  assert.ok(leaksBlockedCount >= 2, 'Should block both DOM leak occurrences');

  // Verify that sanitized messages have no DOM tags or refs
  const systemText = sanitizedMessages[0].content;
  assert.equal(containsDomLeaks(systemText), false, 'System text must be clean of DOM leaks');
  assert.ok(!systemText.includes('<button'), 'HTML button removed');
  assert.ok(!systemText.includes('ref='), 'ref attribute removed');

  const userContent = sanitizedMessages[1].content;
  const userText = userContent.find(p => p.type === 'text')?.text;
  assert.equal(containsDomLeaks(userText), false, 'User text must be clean of DOM leaks');
  assert.ok(!userText.includes('<div>'), 'HTML div removed');
});

test('SIH Benchmark 4: Coordinate Normalization & Viewport Mapping Accuracy', async (t) => {
  // Test normalized 0-1000 coordinate mapping
  const coord1000 = normalizeToViewportPx(500, 500);
  assert.ok(coord1000.cssX > 0, 'Horizontal pixel calculated');
  assert.ok(coord1000.cssY > 0, 'Vertical pixel calculated');

  // Test normalized 0-1 coordinate mapping
  const coord1 = normalizeToViewportPx(0.5, 0.5);
  assert.equal(coord1.cssX, coord1000.cssX, '0.5 should map identical to 500/1000');

  // Clamping test
  const clamped = normalizeToViewportPx(-50, 99999);
  assert.equal(clamped.cssX, 0, 'Negative coordinate clamped to 0');
  assert.ok(clamped.cssY > 0, 'Oversized coordinate clamped to viewport height');
});

test('SIH Benchmark 5: Latency & Performance Budgeting (<50ms for local processing)', async (t) => {
  const start = performance.now();

  // Benchmark processing 500 elements
  const syntheticElements = [];
  for (let i = 0; i < 500; i++) {
    syntheticElements.push({
      kind: i % 5 === 0 ? 'input' : (i % 7 === 0 ? 'text' : 'button'),
      type: i % 10 === 0 ? 'password' : 'text',
      text: i % 7 === 0 ? 'user' + i + '@mail.com' : 'Public item ' + i,
      rect: { x: (i * 10) % 1000, y: (i * 20) % 2000, w: 100, h: 25 },
    });
  }

  const regions = selectRedactionRegions(syntheticElements, {
    redactTextInputs: true,
    redactDetectedPii: true,
  });

  const imageRegions = mapRegionsToImage(regions, {
    scale: 1,
    imageWidth: 1920,
    imageHeight: 1080,
  });

  const merged = mergeOverlappingRegions(imageRegions, 0.2);

  const durationMs = performance.now() - start;
  assert.ok(durationMs < 50, `Local processing latency must be <50ms, took ${durationMs.toFixed(2)}ms`);
  assert.ok(merged.length > 0, 'Processed regions successfully');
});
