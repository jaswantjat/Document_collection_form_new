import { describe, expect, it } from 'vitest';
import { getDeliveryStatusViewModels } from '@/lib/deliveryStatus';

describe('deliveryStatus view models', () => {
  it('shows idle channels when no delivery status exists yet', () => {
    const items = getDeliveryStatusViewModels(undefined);

    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      key: 'formNotifications',
      state: 'Sin intentos',
      tone: 'gray',
    });
  });

  it('maps delivered and failed channels to clear UI states', () => {
    const items = getDeliveryStatusViewModels({
      formNotifications: {
        configured: true,
        state: 'delivered',
        lastEventType: 'form_submitted',
        lastAttemptAt: '2026-04-22T12:00:00.000Z',
        lastSuccessAt: '2026-04-22T12:00:00.000Z',
        lastStatusCode: 200,
        lastError: null,
        recentAttempts: [],
      },
      docflowNewOrder: {
        configured: true,
        state: 'failed',
        lastEventType: 'new_order',
        lastAttemptAt: '2026-04-22T12:05:00.000Z',
        lastSuccessAt: null,
        lastStatusCode: 502,
        lastError: 'bad gateway',
        recentAttempts: [],
      },
    });

    expect(items[0]).toMatchObject({
      key: 'formNotifications',
      state: 'Entregado',
      tone: 'emerald',
      lastStatusCode: 200,
    });
    expect(items[1]).toMatchObject({
      key: 'docflowNewOrder',
      state: 'Fallido',
      tone: 'red',
      lastError: 'bad gateway',
    });
  });
});
