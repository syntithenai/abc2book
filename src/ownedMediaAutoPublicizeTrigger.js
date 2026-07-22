export function triggerAutoPublicizeIfShared(opts, items) {
  const options = opts || {}
  const list = items || []
  if (!options.driveApi || !options.googleDocumentId || list.length === 0) return

  import('./shareOwnedMediaUtils').then(function(mod) {
    mod.queueAutoPublicizeMediaIfTunebookShared({
      driveApi: options.driveApi,
      googleDocumentId: options.googleDocumentId,
      items: list,
      onFailureToast: options.onAutoPublicizeFailure,
    })
  }).catch(function() {})
}
