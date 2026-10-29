// Liens et vidéos de la bibliothèque de ressources

// Identifiant d'une vidéo YouTube (lien classique, court, Shorts ou intégré)
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\.|^m\./, '')
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.searchParams.get('v')) return u.searchParams.get('v')
      const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/)
      return m?.[1] ?? null
    }
  } catch {
    /* lien invalide */
  }
  return null
}

const VIDEO_HOSTS = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|dai\.ly|twitch\.tv|loom\.com|ted\.com)$/

export function isVideoUrl(url: string) {
  try {
    return VIDEO_HOSTS.test(new URL(url).hostname)
  } catch {
    return false
  }
}

// Ajoute https:// si besoin ; renvoie null si ce n'est pas un lien web
export function normalizeUrl(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(t) ? t : `https://${t}`)
    if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.')) return null
    return u.toString()
  } catch {
    return null
  }
}

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
