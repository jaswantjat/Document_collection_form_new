import type {
  DeliveryChannelKey,
  DeliveryChannelStatus,
  DeliveryStatusMap,
} from '@/types';

const CHANNEL_DEFINITIONS: Array<{
  key: DeliveryChannelKey;
  label: string;
  idleLabel: string;
}> = [
  {
    key: 'formNotifications',
    label: 'Teams / formulario',
    idleLabel: 'Sin intentos',
  },
  {
    key: 'docflowNewOrder',
    label: 'DocFlow new_order',
    idleLabel: 'Sin intentos',
  },
  {
    key: 'docflowDocUpdate',
    label: 'DocFlow doc_update',
    idleLabel: 'Sin intentos',
  },
];

export interface DeliveryStatusViewModel {
  key: DeliveryChannelKey;
  label: string;
  state: string;
  tone: 'emerald' | 'amber' | 'red' | 'gray';
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastEventType: string | null;
  lastStatusCode: number | null;
  lastError: string | null;
}

function describeChannelState(
  channel: DeliveryChannelStatus | undefined,
  idleLabel: string
): Pick<DeliveryStatusViewModel, 'state' | 'tone'> {
  if (!channel) {
    return { state: idleLabel, tone: 'gray' };
  }

  if (!channel.configured && !channel.lastAttemptAt) {
    return { state: 'No configurado', tone: 'gray' };
  }

  switch (channel.state) {
    case 'delivered':
      return { state: 'Entregado', tone: 'emerald' };
    case 'skipped':
      return { state: 'Duplicado omitido', tone: 'amber' };
    case 'failed':
      return { state: 'Fallido', tone: 'red' };
    case 'disabled':
      return { state: 'No configurado', tone: 'gray' };
    case 'configured':
      return { state: 'Configurado', tone: 'amber' };
    default:
      return { state: idleLabel, tone: 'gray' };
  }
}

export function getDeliveryStatusViewModels(
  deliveryStatus: DeliveryStatusMap | undefined
): DeliveryStatusViewModel[] {
  return CHANNEL_DEFINITIONS.map(({ key, label, idleLabel }) => {
    const channel = deliveryStatus?.[key];
    const state = describeChannelState(channel, idleLabel);

    return {
      key,
      label,
      state: state.state,
      tone: state.tone,
      lastAttemptAt: channel?.lastAttemptAt ?? null,
      lastSuccessAt: channel?.lastSuccessAt ?? null,
      lastEventType: channel?.lastEventType ?? null,
      lastStatusCode: channel?.lastStatusCode ?? null,
      lastError: channel?.lastError ?? null,
    };
  });
}
