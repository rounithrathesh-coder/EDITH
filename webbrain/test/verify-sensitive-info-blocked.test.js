import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REGION_KIND,
  selectRedactionRegions,
} from '../src/chrome/src/agent/screenshot-redaction.js';

import {
  sanitizeScreenshotOnDevice,
} from '../src/chrome/src/agent/vision-redaction-engine.js';

import {
  sanitizeOutboundVlmPayload,
  containsDomLeaks,
} from '../src/chrome/src/agent/privacy-airgap.js';

test('Sensitive Data Blocking Test 1: Multi-Category PII & Credential Masking', async (t) => {
  const sensitiveElements = [
    // 1. Password input
    { kind: 'input', type: 'password', rect: { x: 10, y: 10, w: 150, h: 30 } },
    
    // 2. Credit Card
    { kind: 'text', text: 'Visa: 4532 8901 2345 6789 (CVV: 123)', rect: { x: 10, y: 50, w: 250, h: 25 } },
    
    // 3. Secret API Key / Token
    { kind: 'text', text: 'OpenAI Key: sk-proj-9876543210abcdefghijklmnop', rect: { x: 10, y: 85, w: 300, h: 25 } },
    
    // 4. Personal Email
    { kind: 'text', text: 'Contact: john.doe.private@securemail.com', rect: { x: 10, y: 120, w: 280, h: 25 } },
    
    // 5. Phone Number
    { kind: 'text', text: 'Direct: +1 (555) 987-6543', rect: { x: 10, y: 155, w: 200, h: 25 } },
    
    // 6. Government ID / SSN
    { kind: 'text', text: 'SSN: 123-45-6789', rect: { x: 10, y: 190, w: 180, h: 25 } },
    
    // 7. Face / Profile picture
    { kind: 'face', rect: { x: 350, y: 20, w: 100, h: 100 } },
  ];

  const dummyUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const result = await sanitizeScreenshotOnDevice(dummyUrl, sensitiveElements, {
    imageWidth: 1280,
    imageHeight: 800,
  });

  // Verify all 7 categories are detected and blocked
  assert.equal(result.stats.regionsCount, 7, 'All 7 sensitive items must be blocked');
  assert.equal(result.stats.byKind[REGION_KIND.PASSWORD], 1, 'Password blocked');
  assert.equal(result.stats.byKind[REGION_KIND.FINANCIAL], 1, 'Financial credit card blocked');
  assert.equal(result.stats.byKind[REGION_KIND.SECRET_KEY], 1, 'API secret key blocked');
  assert.equal(result.stats.byKind[REGION_KIND.EMAIL], 1, 'Email blocked');
  assert.equal(result.stats.byKind[REGION_KIND.PHONE], 1, 'Phone number blocked');
  assert.equal(result.stats.byKind[REGION_KIND.ID_CARD], 1, 'Government ID blocked');
  assert.equal(result.stats.byKind[REGION_KIND.FACE], 1, 'Face avatar blocked');
});

test('Sensitive Data Blocking Test 2: Zero DOM & Zero HTML Outbound Leakage', (t) => {
  const payloadWithLeaks = [
    {
      role: 'system',
      content: 'Current DOM context: <input type="password" name="pwd" ref="e12" value="Secret123!"/> <div class="ssn">SSN: 123-45-6789</div>',
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Click button <button id="pay" ref="e99">Pay Now</button>' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,SANITIZED' } },
      ],
    },
  ];

  const { sanitizedMessages, leaksBlockedCount } = sanitizeOutboundVlmPayload(payloadWithLeaks);

  // Assert all leaks blocked
  assert.ok(leaksBlockedCount >= 2, 'Must block outbound leaks');

  const systemText = sanitizedMessages[0].content;
  const userText = sanitizedMessages[1].content[0].text;

  // Zero DOM/HTML assertions
  assert.equal(containsDomLeaks(systemText), false, 'System text clean of DOM leaks');
  assert.equal(containsDomLeaks(userText), false, 'User text clean of DOM leaks');
  assert.ok(!systemText.includes('<input'), '<input tag removed');
  assert.ok(!systemText.includes('ref='), 'ref attribute removed');
  assert.ok(!userText.includes('<button'), '<button tag removed');
});
