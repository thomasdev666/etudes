import { describe, expect, it } from 'vitest'
import { hostOf, isVideoUrl, normalizeUrl, youtubeId } from './resources'

describe('ressources', () => {
  it('reconnaît les vidéos YouTube sous toutes leurs formes', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=abc123XYZ_-&t=30')).toBe('abc123XYZ_-')
    expect(youtubeId('https://youtu.be/abc123XYZ_-')).toBe('abc123XYZ_-')
    expect(youtubeId('https://youtube.com/shorts/abc123XYZ_-')).toBe('abc123XYZ_-')
    expect(youtubeId('https://example.com/watch?v=1')).toBeNull()
  })
  it('classe les liens vidéo', () => {
    expect(isVideoUrl('https://vimeo.com/12345')).toBe(true)
    expect(isVideoUrl('https://www.investopedia.com/terms/n/npv.asp')).toBe(false)
  })
  it('complète et vérifie un lien saisi', () => {
    expect(normalizeUrl('investopedia.com/terms')).toBe('https://investopedia.com/terms')
    expect(normalizeUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeUrl('pas un lien')).toBeNull()
    expect(hostOf('https://www.lemonde.fr/eco')).toBe('lemonde.fr')
  })
})
