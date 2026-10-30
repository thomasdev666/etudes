import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { activeStatus, formEncode, verifySignature } from './stripe'

describe('stripe', () => {
  it('encode les paramètres imbriqués', () => {
    expect(formEncode({ mode: 'subscription', line_items: [{ price: 'price_1', quantity: 1 }], metadata: { user_id: 'a b' }, x: undefined })).toBe(
      'mode=subscription&line_items%5B0%5D%5Bprice%5D=price_1&line_items%5B0%5D%5Bquantity%5D=1&metadata%5Buser_id%5D=a%20b',
    )
  })

  it('vérifie la signature d’un webhook', () => {
    const secret = 'whsec_test'
    const body = '{"type":"x"}'
    const t = 1_800_000_000
    const sig = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')
    expect(verifySignature(body, `t=${t},v1=${sig}`, secret, t * 1000)).toBe(true)
    expect(verifySignature(body + ' ', `t=${t},v1=${sig}`, secret, t * 1000)).toBe(false)
    expect(verifySignature(body, `t=${t},v1=${sig}`, 'autre', t * 1000)).toBe(false)
    expect(verifySignature(body, `t=${t},v1=${sig}`, secret, (t + 3600) * 1000)).toBe(false)
  })

  it('donne Premium seulement aux abonnements actifs', () => {
    expect(activeStatus('active')).toBe(true)
    expect(activeStatus('canceled')).toBe(false)
    expect(activeStatus('incomplete')).toBe(false)
  })
})
