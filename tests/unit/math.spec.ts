import { describe, expect, it } from 'vitest'
import { add } from '../../app/utils/math'

describe('add', () => {
  it('additionne deux nombres', () => {
    expect(add(2, 3)).toBe(5)
  })
})
