import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('FR-COMPANIES-330 CompanyDetails audit block', () => {
  it('рендерит createdBy вместе с updatedBy', () => {
    const src = readFileSync(
      join(__dirname, 'CompanyDetails.tsx'),
      'utf8',
    );
    expect(src).toContain('Создал:');
    expect(src).toMatch(/company\.createdBy[\s\S]*company\.updatedBy/);
  });
});

describe('FR-COMPANIES-460 companies route requires', () => {
  it('маршруты компаний объявляют meta.requires companies:read', () => {
    const src = readFileSync(
      join(__dirname, '../../../../../../host/src/configs/routes.config/routes.config.ts'),
      'utf8',
    );
    const block = src.slice(src.indexOf("key: 'portfolio.companies'"));
    expect(block).toContain("requires: 'companies:read'");
    expect((block.match(/requires: 'companies:read'/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });
});

describe('FR-COMPANIES-415 EntityCreateDrawer dedup', () => {
  it('использует apiFindCompanyDuplicates и восстанавливает корзинный дубль', () => {
    const src = readFileSync(
      join(__dirname, '../../../../../../host/src/components/template/EntityCreateDrawer.tsx'),
      'utf8',
    );
    expect(src).toContain('apiFindCompanyDuplicates');
    expect(src).not.toMatch(
      /entityType === 'company'[\s\S]*companiesData\?\.list\?\.find/,
    );
    expect(src).toContain("createCompanyReal('restore')");
  });
});

describe('FR-COMPANIES-100 CompanyList create trash collision', () => {
  it('create-path списка предлагает restore при TRASH_COLLISION', () => {
    const src = readFileSync(join(__dirname, 'CompanyList.tsx'), 'utf8');
    expect(src).toContain('TRASH_COLLISION');
    expect(src).toContain("trashCollisionResolution: 'restore'");
  });
});
