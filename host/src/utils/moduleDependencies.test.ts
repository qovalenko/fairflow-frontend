import { describe, it, expect } from 'vitest'
import {
  previewWizardEnableCascade,
  resolveWizardModuleDependencies,
} from './moduleDependencies'

describe('moduleDependencies (wizard)', () => {
  it('resolveWizardModuleDependencies always includes locked deals', () => {
    expect(resolveWizardModuleDependencies(['contacts'])).toContain('deals')
  })

  it('previewWizardEnableCascade lists hard deps for orders and search (FR-PSET-420)', () => {
    expect(previewWizardEnableCascade('orders', ['contacts'])).toEqual([])
    expect(previewWizardEnableCascade('search', ['deals'])).toEqual(
      expect.arrayContaining(['contacts', 'companies']),
    )
    expect(previewWizardEnableCascade('products', ['deals'])).toEqual([])
  })
})
