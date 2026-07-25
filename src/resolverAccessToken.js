export function resolveResolverAccessToken(token) {
  if (!token) return '';
  if (typeof token === 'string') return token;
  return token.access_token || '';
}
