export function unwrapSearchResult(result) {
  if (result && result.multiple && Array.isArray(result.candidates) && result.candidates.length > 0) {
    const nonTitleOnly = result.candidates.find(function(candidate) {
      return !candidate.titleOnly;
    });
    return nonTitleOnly || result.candidates[0];
  }
  return result;
}
