import { describe, expect, it } from 'vitest'
import AutomationList from './AutomationList'
import moduleDefault from './index'

describe('index — federation entry re-export', () => {
    it('default export указывает на AutomationList', () => {
        expect(moduleDefault).toBe(AutomationList)
    })
})
