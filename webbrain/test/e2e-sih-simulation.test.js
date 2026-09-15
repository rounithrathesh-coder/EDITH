/**
 * End-to-End SIH Pipeline Integration & Simulation Test
 * 
 * Verifies:
 * 1. Rendering a simulated web page with PII and sensitive inputs.
 * 2. Generating and executing on-device visual redaction.
 * 3. Verifying that the privacy airgap prevents all DOM/HTML leakage to the cloud payload.
 * 4. Simulating cloud VLM coordinate output (x, y) and verifying local visual grounding.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REGION_KIND,
  selectRedactionRegions,
  mapRegionsToImage,
} from '../src/chrome/src/agent/screenshot-redaction.js';

import {
  sanitizeScreenshotOnDevice,
  calculateIoU,
  mergeOverlappingRegions,
} from '../src/chrome/src/agent/vision-redaction-engine.js';

import {
  sanitizeOutboundVlmPayload,
  containsDomLeaks,
} from '../src/chrome/src/agent/privacy-airgap.js';

import {
  normalizeToViewportPx,
} from '../src/chrome/src/content/visual-grounding.js';

test('E2E SIH Pipeline Flow: Live Simulated Scenario', async (t) => {
  console.log('\n--- Step 1: User navigates to a flight booking & payment page ---');
  
  // Simulated page elements extracted locally by the extension
  const pageElements = [
    { kind: 'text', text: 'Flight Booking Confirmation', rect: { x: 50, y: 30, w: 300, h: 40 } },
    { kind: 'text', text: 'Passenger: Alice Smith', rect: { x: 50, y: 80, w: 200, h: 25 } },
    { kind: 'text', text: 'Email: alice.smith@example.com', rect: { x: 50, y: 110, w: 250, h: 25 } },
    { kind: 'text', text: 'Phone: +1-800-555-0199', rect: { x: 50, y: 140, w: 200, h: 25 } },
    { kind: 'text', text: 'Payment Card: 4111-2222-3333-4444', rect: { x: 50, y: 170, w: 280, h: 25 } },
    { kind: 'input', type: 'password', rect: { x: 50, y: 210, w: 200, h: 35 } },
    { kind: 'face', rect: { x: 450, y: 80, w: 100, h: 100 } },
    { kind: 'button', text: 'Confirm & Pay $450', rect: { x: 50, y: 280, w: 180, h: 45 } },
  ];

  console.log('--- Step 2: On-device visual perception & PII redaction ---');
  
  // Dummy 1x1 PNG data URL
  const dummyScreenshotUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const { sanitizedDataUrl, stats } = await sanitizeScreenshotOnDevice(
    dummyScreenshotUrl,
    pageElements,
    {
      imageWidth: 1280,
      imageHeight: 800,
      scale: 1,
    }
  );

  console.log(`-> Local redaction completed in ${stats.latencyMs}ms`);
  console.log('-> Redacted regions by category:', stats.byKind);

  assert.ok(stats.regionsCount >= 5, 'Should redact email, phone, card, password, and face');
  assert.equal(stats.byKind[REGION_KIND.EMAIL], 1, 'Email masked');
  assert.equal(stats.byKind[REGION_KIND.PHONE], 1, 'Phone masked');
  assert.equal(stats.byKind[REGION_KIND.FINANCIAL], 1, 'Credit card masked');
  assert.equal(stats.byKind[REGION_KIND.PASSWORD], 1, 'Password field masked');
  assert.equal(stats.byKind[REGION_KIND.FACE], 1, 'Face avatar masked');

  console.log('--- Step 3: Outbound Privacy Airgap Verification ---');

  // Payload constructed for cloud VLM
  const outboundPayload = [
    {
      role: 'system',
      content: 'You are a vision-only browser agent. Page DOM: <form id="payForm"><input type="password" value="secret"/></form>',
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'User Instruction: Click the confirm button. Current page HTML: <button id="btn" ref="e99">Confirm</button>' },
        { type: 'image_url', image_url: { url: sanitizedDataUrl } },
      ],
    },
  ];

  const sanitized = sanitizeOutboundVlmPayload(outboundPayload);

  console.log(`-> Blocked ${sanitized.leaksBlockedCount} DOM/HTML leaks from outbound cloud payload`);
  assert.ok(sanitized.leaksBlockedCount >= 2, 'Airgap must block DOM leaks');

  // Assert that zero DOM tags remain in outgoing payload
  const cloudSystemPrompt = sanitized.sanitizedMessages[0].content;
  const cloudUserPrompt = sanitized.sanitizedMessages[1].content[0].text;
  
  assert.equal(containsDomLeaks(cloudSystemPrompt), false, 'Zero DOM in system prompt');
  assert.equal(containsDomLeaks(cloudUserPrompt), false, 'Zero DOM in user prompt');
  assert.ok(!cloudSystemPrompt.includes('<form'), 'Form tag stripped');
  assert.ok(!cloudUserPrompt.includes('<button'), 'Button tag stripped');
  assert.ok(!cloudUserPrompt.includes('ref='), 'ref attribute stripped');

  console.log('--- Step 4: Cloud VLM returns visual action coordinate (x, y) ---');
  
  // Cloud VLM sees the button at ~x=140px, y=300px on a 1280x800 screen
  // Normalized coordinate in [0, 1000] scale: x = 109, y = 375
  const cloudVisualAction = {
    tool: 'click_coordinate',
    args: { x: 109, y: 375 } // Normalized to 1000
  };

  console.log(`-> Cloud VLM predicted coordinates: x=${cloudVisualAction.args.x}, y=${cloudVisualAction.args.y}`);

  console.log('--- Step 5: Local agent grounds coordinates into viewport pixels ---');
  
  const mappedCoords = normalizeToViewportPx(cloudVisualAction.args.x, cloudVisualAction.args.y);
  console.log(`-> Mapped to CSS viewport pixels: (${mappedCoords.cssX}px, ${mappedCoords.cssY}px)`);

  // Expected button box is at x: 50..230, y: 280..325
  assert.ok(mappedCoords.cssX >= 50 && mappedCoords.cssX <= 230, 'Mapped X falls directly inside target button');
  assert.ok(mappedCoords.cssY >= 280 && mappedCoords.cssY <= 325, 'Mapped Y falls directly inside target button');

  console.log('\n✔ END-TO-END PIPELINE VALIDATED SUCCESSFULLY WITH ZERO DOM LEAKS & HIGH ACCURACY\n');
});
