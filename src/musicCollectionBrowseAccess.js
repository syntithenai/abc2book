import { getMusicCollectionStatusFromHealth, isMusicCollectionSettingsAvailable } from './musicCollectionAdminClient';
import { getResolverLoginWarning, normalizeAccessToken } from './mediaProxyClient';

function candidateHasMusicCollectionHost(status) {
  const candidates = (status && status.candidates) || [];
  return candidates.some(function(candidate) {
    const features = candidate && candidate.features;
    return candidate.reachable && features && features.musicCollection === true;
  });
}

/**
 * Gate Library browse: music collection uses its own auth list and home resolver,
 * not the generic "available" flag (often the cloud resolver after login).
 */
export function getMusicCollectionBrowseAccess(context) {
  const opts = context || {};
  const status = opts.resolverStatus || null;
  const accessToken = normalizeAccessToken(opts.accessToken);
  const browseVerified = opts.browseVerified === true;
  const loginWarning = getResolverLoginWarning(status, accessToken);
  const collectionAccess = isMusicCollectionSettingsAvailable(status);
  const collectionDetails = getMusicCollectionStatusFromHealth(status);
  const homeHasCollection = candidateHasMusicCollectionHost(status);

  const needsLogin = !accessToken && (
    (loginWarning && loginWarning.showLoginButton)
    || (homeHasCollection && !collectionAccess)
    || !!(status && status.requireAuth && !status.available)
  );

  const canBrowse = collectionAccess || browseVerified;

  let blockedMessage = '';
  if (!accessToken && !homeHasCollection && !collectionAccess) {
    blockedMessage = 'Music collection browsing needs your home local resolver with an indexed library. '
      + 'The cloud resolver does not host your files. Open Settings → Music collection to configure and rebuild the index.';
  }

  return {
    accessToken: accessToken,
    loginWarning: loginWarning,
    collectionAccess: collectionAccess,
    collectionDetails: collectionDetails,
    homeHasCollection: homeHasCollection,
    needsLogin: needsLogin,
    blockedMessage: blockedMessage,
    canBrowse: canBrowse,
    resolverBase: collectionDetails.resolverBase || (status && status.musicCollectionBase) || '',
  };
}

export function formatMusicCollectionBrowseError(error) {
  const message = error && error.message ? String(error.message) : '';
  if (!message) return 'Could not load music collection';
  if (message.indexOf('Media proxy error 401') === 0) {
    return 'Sign in to browse your music collection.';
  }
  if (message.indexOf('Media proxy error 403') === 0) {
    return 'Your account is not authorized for music collection on this resolver.';
  }
  if (message.indexOf('Media proxy error 404') === 0) {
    return 'Music collection browse API was not found on your home resolver. '
      + 'Rebuild and restart the local-resolver container so it includes the latest server code.';
  }
  return message;
}

export function isMusicCollectionAuthorizationError(error) {
  const message = formatMusicCollectionBrowseError(error);
  return message.indexOf('not authorized') >= 0 || message.indexOf('Sign in to browse') >= 0;
}

export const MUSIC_COLLECTION_AUTH_DENIED_MESSAGE =
  'Your Google account is not authorized for music collection on the home resolver. '
  + 'Ask the resolver admin to add your email to MUSIC_COLLECTION_EMAILS, or check Settings → Music collection.';
