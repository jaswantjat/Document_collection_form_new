import type { AIExtraction } from '@/types';

export type DniExtractionFailureReason =
  | 'unreadable'
  | 'wrong-document'
  | 'wrong-side'
  | 'temporary-error';

export interface SingleDniExtractionResponse {
  success: boolean;
  side?: 'front' | 'back';
  extraction?: AIExtraction;
  needsManualReview?: boolean;
  isWrongDocument?: boolean;
  isUnreadable?: boolean;
  reason?: DniExtractionFailureReason;
  message?: string;
}

export interface DniExtractionResult {
  side?: 'front' | 'back' | null;
  extraction?: AIExtraction;
  needsManualReview?: boolean;
  isWrongDocument?: boolean;
  isUnreadable?: boolean;
  reason?: DniExtractionFailureReason;
  message?: string;
}

export interface DniBatchLikeResponse {
  success: boolean;
  results?: DniExtractionResult[];
  message?: string;
}

export function normalizeSingleDniExtractionResponse(
  response: SingleDniExtractionResponse,
): DniBatchLikeResponse {
  if (!response.success || !response.extraction) {
    return {
      success: false,
      message: response.message,
    };
  }

  return {
    success: true,
    results: [{
      side: response.side ?? null,
      extraction: response.extraction,
      needsManualReview: response.needsManualReview,
      isWrongDocument: response.isWrongDocument,
      isUnreadable: response.isUnreadable,
      reason: response.reason,
      message: response.message,
    }],
  };
}
