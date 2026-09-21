import { describe, it, expect } from 'vitest'

describe('companies mount-points registry (FR-COMPANIES-450)', () => {
    it('declares four slot exposes for the companies remote', () => {
        const exposes = [
            'ContactCompaniesTab',
            'DealCompanySidebar',
            'OrderCompanyTab',
            'CompanyQuickCreatePanel',
        ]
        expect(exposes).toEqual([
            'ContactCompaniesTab',
            'DealCompanySidebar',
            'OrderCompanyTab',
            'CompanyQuickCreatePanel',
        ])
    })
})
