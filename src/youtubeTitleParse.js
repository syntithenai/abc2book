/**
 * Best-effort split of a YouTube video title into song title + artist.
 * Falls back to channel name as artist when the title has no separator.
 */
export function parseTitleArtistFromYouTubeLabel(label, authorName) {
  let text = String(label || '').trim()
  const channel = String(authorName || '').trim()
  if (!text) {
    return { title: '', artist: channel }
  }

  text = text
    .replace(/\s*[\(\[][^\)\]]*(official|audio|video|lyrics|hd|4k|mv|music\s*video)[^\)\]]*[\)\]]/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  const byMatch = text.match(/^(.+?)\s+by\s+(.+)$/i)
  if (byMatch) {
    return { title: byMatch[1].trim(), artist: byMatch[2].trim() }
  }

  const dash = text.match(/^(.+?)\s*[—–\-]\s*(.+)$/)
  if (dash) {
    const left = dash[1].trim()
    const right = dash[2].trim()
    // Prefer "Artist - Title" when the left side looks like a short name.
    if (left.split(/\s+/).length <= 4 && right.length >= left.length) {
      return { title: right, artist: left }
    }
    return { title: left, artist: right }
  }

  const pipe = text.match(/^(.+?)\s*\|\s*(.+)$/)
  if (pipe) {
    return { title: pipe[1].trim(), artist: pipe[2].trim() }
  }

  return { title: text, artist: channel }
}
