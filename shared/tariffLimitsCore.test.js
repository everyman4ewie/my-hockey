import { describe, it, expect } from 'vitest'
import {
  getTariffLimits,
  canPerform,
  getCurrentMonthKey,
  getLimitLabel
} from './tariffLimitsCore.js'

describe('getTariffLimits', () => {
  it('free tier has exercise cap', () => {
    const l = getTariffLimits('free')
    expect(l.maxExercisesPerPlan).toBe(3)
  })

  it('corporate pro maps to pro limits', () => {
    const l = getTariffLimits('corporate_pro')
    expect(l.maxPlansPerMonth).toBe(-1)
  })
})

describe('canPerform', () => {
  it('createPlan on free within monthly limit', () => {
    const mk = getCurrentMonthKey()
    expect(
      canPerform('free', 'createPlan', {
        plansMonthKey: mk,
        plansCreatedThisMonth: 2
      })
    ).toBe(true)
    expect(
      canPerform('free', 'createPlan', {
        plansMonthKey: mk,
        plansCreatedThisMonth: 3
      })
    ).toBe(false)
  })

  it('createPlan resets usage when month key mismatches', () => {
    expect(
      canPerform('free', 'createPlan', {
        plansMonthKey: '2000-01',
        plansCreatedThisMonth: 99
      })
    ).toBe(true)
  })

  it('downloadWord blocked on free', () => {
    expect(canPerform('free', 'downloadWord', {})).toBe(false)
  })
})

describe('getLimitLabel', () => {
  it('returns cap for free plan creation', () => {
    expect(getLimitLabel('free', 'createPlan')).toBe(3)
  })
})
