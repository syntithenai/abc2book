// jest-dom adds custom jest matchers for asserting on DOM nodes.
try {
  require('@testing-library/jest-dom')
} catch (e) {
  // Optional — playback logic tests do not need jest-dom.
}

const { TextDecoder, TextEncoder } = require('util');
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder;
  global.TextEncoder = TextEncoder;
}
