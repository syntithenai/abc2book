import { fetchViaMediaProxy } from './mediaProxyClient';

export function normalizeHelpQueryResponse(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Resolver returned an invalid help response');
  }
  if (body.error) {
    throw new Error(body.error);
  }

  return {
    question: typeof body.question === 'string' ? body.question.trim() : '',
    answer: typeof body.answer === 'string' ? body.answer.trim() : '',
    links: Array.isArray(body.links) ? body.links.filter(Boolean) : [],
    confidence: typeof body.confidence === 'number' ? body.confidence : 0,
    parseMethod: typeof body.parseMethod === 'string' ? body.parseMethod : 'none',
  };
}

async function parseHelpQueryResponse(response) {
  let body = null;
  try {
    body = await response.json();
  } catch (e) {
    throw new Error('Resolver returned an unreadable help response');
  }

  if (!response.ok) {
    throw new Error(body && body.error ? body.error : 'Help query failed');
  }

  return normalizeHelpQueryResponse(body);
}

export async function submitHelpQuery(options) {
  const { question, accessToken, signal, onProgress } = options || {};
  const cleanQuestion = String(question || '').trim();
  if (!cleanQuestion) {
    throw new Error('No help question provided');
  }

  if (typeof onProgress === 'function') {
    onProgress('Searching help...');
  }

  const response = await fetchViaMediaProxy('/help-query', accessToken, {
    method: 'POST',
    body: JSON.stringify({ question: cleanQuestion }),
    signal: signal,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  return parseHelpQueryResponse(response);
}
