/**
 * User-facing issue text for bulk check list items.
 * Fix actions are shown as buttons in each group header — no inline hints.
 */
export function formatBulkCheckIssueMessage(issue) {
  if (!issue) return ''
  return issue.message || ''
}
