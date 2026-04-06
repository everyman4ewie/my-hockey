import { describe, it, expect } from 'vitest'
import {
  getEffectiveTariffId,
  isOrgSubscriptionActive,
  isPersonalTariffPeriodActive,
  processExpiredPersonalTariffDowngrades
} from './effectiveTariff.js'

const futureIso = () => new Date(Date.now() + 864e5 * 365).toISOString()
const pastIso = () => new Date(Date.now() - 864e5 * 2).toISOString()

describe('getEffectiveTariffId', () => {
  it('returns free for pro when tariffExpiresAt is in the past', () => {
    const user = { tariff: 'pro', tariffExpiresAt: pastIso() }
    expect(getEffectiveTariffId(user, { organizations: [] })).toBe('free')
  })

  it('returns pro when tariffExpiresAt is empty (no date limit)', () => {
    const user = { tariff: 'pro', tariffExpiresAt: null }
    expect(getEffectiveTariffId(user, { organizations: [] })).toBe('pro')
  })

  it('returns pro_plus when pro_plus and period still active', () => {
    const user = { tariff: 'pro_plus', tariffExpiresAt: futureIso() }
    expect(getEffectiveTariffId(user, { organizations: [] })).toBe('pro_plus')
  })

  it('uses active organization tier before personal expiry', () => {
    const user = {
      tariff: 'pro',
      tariffExpiresAt: pastIso(),
      organizationId: 'org1'
    }
    const data = {
      organizations: [
        {
          id: 'org1',
          tier: 'corporate_pro',
          tierExpiresAt: futureIso()
        }
      ]
    }
    expect(getEffectiveTariffId(user, data)).toBe('pro')
  })

  it('returns free for corporate_pro stored on user when period expired', () => {
    const user = { tariff: 'corporate_pro', tariffExpiresAt: pastIso() }
    expect(getEffectiveTariffId(user, { organizations: [] })).toBe('free')
  })
})

describe('isPersonalTariffPeriodActive', () => {
  it('treats missing expiry as active', () => {
    expect(isPersonalTariffPeriodActive({})).toBe(true)
    expect(isPersonalTariffPeriodActive({ tariffExpiresAt: '' })).toBe(true)
  })

  it('false when date is in the past', () => {
    expect(isPersonalTariffPeriodActive({ tariffExpiresAt: pastIso() })).toBe(false)
  })
})

describe('processExpiredPersonalTariffDowngrades', () => {
  it('sets user to free and clears payment fields when period ended', () => {
    const user = {
      tariff: 'pro',
      tariffExpiresAt: pastIso(),
      yookassaPaymentMethodId: 'pm_1',
      subscriptionNextChargeAt: pastIso()
    }
    const data = { users: [user] }
    expect(processExpiredPersonalTariffDowngrades(data)).toBe(true)
    expect(user.tariff).toBe('free')
    expect(user.tariffExpiresAt).toBe(null)
    expect(user.yookassaPaymentMethodId).toBe(null)
    expect(user.subscriptionNextChargeAt).toBe(null)
  })

  it('returns false when nothing to do', () => {
    const data = {
      users: [{ tariff: 'pro', tariffExpiresAt: futureIso() }]
    }
    expect(processExpiredPersonalTariffDowngrades(data)).toBe(false)
  })
})

describe('isOrgSubscriptionActive', () => {
  it('true when tierExpiresAt empty', () => {
    expect(isOrgSubscriptionActive({ tier: 'corporate_pro', tierExpiresAt: '' })).toBe(true)
  })
})
