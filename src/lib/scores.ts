export const scoreMetrics = [
  { key: 'complexity', label: 'Complexity', unit: '', say: 'How much is going on in the sound and picture, scored 0 to 100 by a fixed formula.' },
  { key: 'sync', label: 'Sync', unit: '', say: 'How closely the picture moves with the sound, scored 0 to 100 by a fixed formula.' },
  { key: 'uniqueness', label: 'Uniqueness', unit: '', say: 'How unlike every other published Piece this one is, scored 0 to 100. It shifts as Pieces are added.' },
  { key: 'balance', label: 'Balance', unit: '', say: 'The lowest of a Piece’s field standings on Complexity, Sync and Uniqueness.' },
  { key: 'costUsd', label: 'Cost', unit: 'USD', say: 'The reported charge for paid runs, or list price for subscription runs.' },
] as const;

export function formatCost(value: number | null | undefined) {
  return value == null ? '—' : '$' + value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  });
}
