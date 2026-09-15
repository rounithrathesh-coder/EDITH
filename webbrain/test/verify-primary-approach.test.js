import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SYSTEM_PROMPT_ACT_MID,
  SYSTEM_PROMPT_ACT_COMPACT,
  AGENT_TOOLS,
} from '../src/chrome/src/agent/tools.js';

import {
  normalizeToViewportPx,
} from '../src/chrome/src/content/visual-grounding.js';

test('Verification 1: System Prompts Explicitly Enforce Screenshot-First / Vision-Primary', (t) => {
  // Test Act Mid prompt
  assert.ok(
    SYSTEM_PROMPT_ACT_MID.includes('SCREENSHOT-FIRST / VISION-PRIMARY'),
    'SYSTEM_PROMPT_ACT_MID must explicitly declare SCREENSHOT-FIRST / VISION-PRIMARY architecture'
  );
  assert.ok(
    SYSTEM_PROMPT_ACT_MID.includes('inspect_viewport'),
    'SYSTEM_PROMPT_ACT_MID must name inspect_viewport as primary'
  );
  assert.ok(
    SYSTEM_PROMPT_ACT_MID.includes('DOM is secondary') || SYSTEM_PROMPT_ACT_MID.includes('DOM / Accessibility Tree') || SYSTEM_PROMPT_ACT_MID.includes('SECONDARY FALLBACK'),
    'SYSTEM_PROMPT_ACT_MID must define DOM as secondary fallback'
  );

  // Test Act Compact prompt
  assert.ok(
    SYSTEM_PROMPT_ACT_COMPACT.includes('inspect_viewport (PRIMARY)'),
    'SYSTEM_PROMPT_ACT_COMPACT must mandate inspect_viewport as PRIMARY'
  );
  assert.ok(
    SYSTEM_PROMPT_ACT_COMPACT.includes('SECONDARY fallback'),
    'SYSTEM_PROMPT_ACT_COMPACT must designate DOM tools as SECONDARY fallback'
  );
});

test('Verification 2: Visual Coordinate Tools Registered and Model-Exposed', (t) => {
  const toolNames = AGENT_TOOLS.map(t => t.function.name);

  assert.ok(toolNames.includes('inspect_viewport'), 'inspect_viewport is available');
  assert.ok(toolNames.includes('click_coordinate'), 'click_coordinate is available');
  assert.ok(toolNames.includes('type_coordinate'), 'type_coordinate is available');
  assert.ok(toolNames.includes('scroll_page'), 'scroll_page is available');
});

test('Verification 3: Form Filling via Screenshot Coordinate Precision', (t) => {
  // Simulated webpage layout:
  // Viewport: 1280 x 800
  // "First Name" input field: centered at x: 200px, y: 150px
  // "Last Name" input field: centered at x: 200px, y: 220px
  // "Submit" button: centered at x: 200px, y: 300px

  // Model predicts normalized (0..1000) coordinates from visual screenshot
  const predictedFirstNameCoords = { x: 156, y: 188 }; // (156/1000 * 1280 = 200px, 188/1000 * 800 = 150px)
  const predictedLastNameCoords = { x: 156, y: 275 };  // (156/1000 * 1280 = 200px, 275/1000 * 800 = 220px)
  const predictedSubmitCoords = { x: 156, y: 375 };    // (156/1000 * 1280 = 200px, 375/1000 * 800 = 300px)

  const mappedFirstName = normalizeToViewportPx(predictedFirstNameCoords.x, predictedFirstNameCoords.y);
  const mappedLastName = normalizeToViewportPx(predictedLastNameCoords.x, predictedLastNameCoords.y);
  const mappedSubmit = normalizeToViewportPx(predictedSubmitCoords.x, predictedSubmitCoords.y);

  // Assert precise alignment with the visual elements
  assert.equal(mappedFirstName.cssX, 200, 'First Name X pixel aligns with target field');
  assert.equal(mappedFirstName.cssY, 150, 'First Name Y pixel aligns with target field');

  assert.equal(mappedLastName.cssX, 200, 'Last Name X pixel aligns with target field');
  assert.equal(mappedLastName.cssY, 220, 'Last Name Y pixel aligns with target field');

  assert.equal(mappedSubmit.cssX, 200, 'Submit Button X pixel aligns with target button');
  assert.equal(mappedSubmit.cssY, 300, 'Submit Button Y pixel aligns with target button');
});
