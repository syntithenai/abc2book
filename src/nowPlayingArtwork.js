/**
 * Artwork URL for the now-playing UI (YouTube thumb, tag image, etc.).
 */

function youtubeIdFromUrl(url) {
  if (!url || typeof url !== 'string') return null
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})/)
  return match ? match[1] : null
}

function firstYoutubeLink(tune, tunebook) {
  if (!tune || !Array.isArray(tune.links)) return null
  for (let i = 0; i < tune.links.length; i++) {
    const link = tune.links[i]
    if (!link || !link.url) continue
    const isYoutube = tunebook && tunebook.utils && tunebook.utils.isYoutubeLink
      ? tunebook.utils.isYoutubeLink(link.url)
      : /youtube\.com|youtu\.be/.test(link.url)
    if (isYoutube) return link
  }
  return null
}

export function getTuneArtworkUrl(tune, tunebook, options) {
  const opts = options || {}
  if (!tune) return null

  const linkIndex = typeof opts.linkIndex === 'number' ? opts.linkIndex : null
  if (linkIndex != null && tune.links && tune.links[linkIndex] && tune.links[linkIndex].url) {
    const ytId = youtubeIdFromUrl(tune.links[linkIndex].url)
    if (ytId) return 'https://i.ytimg.com/vi/' + ytId + '/hqdefault.jpg'
  }

  const ytLink = firstYoutubeLink(tune, tunebook)
  if (ytLink && ytLink.url) {
    const ytId = youtubeIdFromUrl(ytLink.url)
    if (ytId) return 'https://i.ytimg.com/vi/' + ytId + '/hqdefault.jpg'
  }

  return null
}
