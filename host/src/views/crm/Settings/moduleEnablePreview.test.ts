import { describe, expect, it } from 'vitest';
import {
  computeAutoEnabledModules,
  moduleEnablePreviewMessage,
} from './moduleEnablePreview';

describe('moduleEnablePreview (FR-PROJ-300)', () => {
  const registry = [
    { id: 'deals', name: 'Сделки', dependencies: [] },
    { id: 'orders', name: 'Заказы', dependencies: ['deals', 'products'] },
    { id: 'products', name: 'Товары', dependencies: [] },
  ];

  it('lists transitive dependencies not yet enabled', () => {
    const enabled = new Set(['products']);
    const auto = computeAutoEnabledModules('orders', enabled, registry);
    expect(auto.map((m) => m.id)).toEqual(['deals']);
  });

  it('builds a human-readable preview message', () => {
    const msg = moduleEnablePreviewMessage('Заказы', [
      { id: 'deals', name: 'Сделки', dependencies: [] },
    ]);
    expect(msg).toContain('Заказы');
    expect(msg).toContain('Сделки');
  });
});
