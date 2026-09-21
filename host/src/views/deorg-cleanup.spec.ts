import * as fs from 'node:fs';
import * as path from 'node:path';

/** TODO-105: org-surface views removed from host — settings live under account/System. */
describe('DEORG cleanup — host views', () => {
  const accountViews = path.resolve(__dirname, 'account');

  it('does not keep views/account/Organization', () => {
    expect(fs.existsSync(path.join(accountViews, 'Organization'))).toBe(false);
  });

  it('keeps system settings screens under views/account/System', () => {
    const systemDir = path.join(accountViews, 'System');
    expect(fs.existsSync(path.join(systemDir, 'SystemProfile.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(systemDir, 'SystemSettingsLayout.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(systemDir, 'AccessUnitsEditor.tsx'))).toBe(true);
  });
});
