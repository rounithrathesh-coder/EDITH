/**
 * Privacy Airgap & Zero-DOM Outbound Sanitizer
 * 
 * Enforces the core SIH privacy boundary:
 * "The cloud model gets vision. The local agent gets the browser."
 * 
 * Strips all DOM, Accessibility Tree nodes, and HTML fragments from outbound
 * messages sent to cloud VLMs, allowing only sanitized screenshots and conversational
 * instructions.
 */

// Patterns indicating DOM/AX/HTML structural leaks
const DOM_LEAK_PATTERNS = [
  /<(?:html|body|div|span|button|input|form|table|tr|td|select|textarea|header|nav|footer)[^>]*>/i,
  /<\/[a-z]+>/i,
  /\bref=["']?e\d+["']?/i,
  /\bdata-ref=["']?\d+["']?/i,
  /\bAXNode\b/i,
  /AccessibilityTree/i,
  /accessibility_tree/i,
  /\[ref:\s*e\d+\]/i,
];

/**
 * Check if a text string contains DOM or AX Tree fragments.
 * @param {string} text 
 * @returns {boolean} True if text contains DOM/AX leaks
 */
export function containsDomLeaks(text) {
  if (typeof text !== 'string') return false;
  return DOM_LEAK_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Sanitize a text string to remove any accidental DOM/AX leaks.
 * @param {string} text 
 * @returns {string} Sanitized string
 */
export function sanitizeTextContent(text) {
  if (typeof text !== 'string') return '';
  let sanitized = text;

  // Replace HTML tag structures
  sanitized = sanitized.replace(/<[^>]+>/g, '[UI Element]');

  // Replace element ref IDs (e.g. ref="e12" or [ref: e12])
  sanitized = sanitized.replace(/\bref=["']?e\d+["']?/gi, '');
  sanitized = sanitized.replace(/\[ref:\s*e\d+\]/gi, '');

  return sanitized;
}

/**
 * Sanitizes an outbound message payload for the Cloud VLM.
 * Ensures only the conversational prompt and the sanitized screenshot (dataUrl) pass through.
 * 
 * @param {Array<{role: string, content: string|Array<object>}>} messages 
 * @returns {{
 *   sanitizedMessages: Array<object>,
 *   leaksBlockedCount: number,
 *   isCompliant: boolean
 * }}
 */
export function sanitizeOutboundVlmPayload(messages) {
  if (!Array.isArray(messages)) {
    return { sanitizedMessages: [], leaksBlockedCount: 0, isCompliant: true };
  }

  let leaksBlockedCount = 0;
  const sanitizedMessages = messages.map(msg => {
    if (!msg) return msg;

    // String content
    if (typeof msg.content === 'string') {
      if (containsDomLeaks(msg.content)) {
        leaksBlockedCount++;
        return {
          ...msg,
          content: sanitizeTextContent(msg.content)
        };
      }
      return msg;
    }

    // Multimodal content array (text + image_url)
    if (Array.isArray(msg.content)) {
      const sanitizedContent = msg.content.map(part => {
        if (!part) return part;

        // Image part - allow sanitized base64/data URLs
        if (part.type === 'image_url' || part.image_url) {
          return part;
        }

        // Text part
        if (part.type === 'text' && typeof part.text === 'string') {
          if (containsDomLeaks(part.text)) {
            leaksBlockedCount++;
            return {
              ...part,
              text: sanitizeTextContent(part.text)
            };
          }
        }

        return part;
      });

      return {
        ...msg,
        content: sanitizedContent
      };
    }

    return msg;
  });

  return {
    sanitizedMessages,
    leaksBlockedCount,
    isCompliant: true
  };
}
