import { describe, it, expect } from 'vitest'
import { normalizeTariffId, getLimitsLookupKey } from './tariffNormalize.js'

describe('normalizeTariffId', () => {
  it('maps common variants', () => {
    expect(normalizeTariffId(null)).toBe('free')
    expect(normalizeTariffId('ПРО')).toBe('pro')
    expect(normalizeTariffId('pro-plus')).toBe('pro_plus')
    expect(normalizeTariffId('ultima')).toBe('admin')
  })

  it('maps corporate aliases', () => {
    expect(normalizeTariffId('корпоративный про')).toBe('corporate_pro')
    expect(normalizeTariffId('corp_pro_plus')).toBe('corporate_pro_plus')
  })
})

describe('getLimitsLookupKey', () => {
  it('maps corporate to pro tiers', () => {
    expect(getLimitsLookupKey('corporate_pro')).toBe('pro')
    expect(getLimitsLookupKey('corporate_pro_plus')).toBe('pro_plus')
    expect(getLimitsLookupKey('free')).toBe('free')
  })
})
