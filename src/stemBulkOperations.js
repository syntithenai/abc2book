/**
 * Bulk / automated stem separation is disabled by default to limit external API cost.
 * Per-tune Analyse in Media Controls still runs via analyseMediaStems().
 */
export function areStemBulkOperationsEnabled() {
  return false
}
