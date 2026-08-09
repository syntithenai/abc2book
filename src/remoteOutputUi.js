/**
 * Chromecast / Snapcast UI and auto-routing are temporarily disabled for production.
 * Set REACT_APP_REMOTE_OUTPUT_UI=true when developing casting features.
 */
export function isRemoteOutputUiEnabled() {
  return process.env.REACT_APP_REMOTE_OUTPUT_UI === 'true';
}
