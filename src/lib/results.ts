import { scoreMetrics } from './scores';
import type { Piece, Reading } from './vault';

export const metrics = [
  { key: 'wall', label: 'Time to make', unit: 's', say: 'Seconds from sending the Instruction to receiving the finished reply.' },
  { key: 'lines', label: 'Code lines', unit: '', say: 'Lines of code in the module the model wrote.' },
  { key: 'characters', label: 'Code characters', unit: '', say: 'Characters of code in the module the model wrote.' },
  { key: 'reply', label: 'Reply characters', unit: '', say: 'Characters in the model’s whole reply, including the code.' },
  { key: 'nodes', label: 'Audio node call sites', unit: '', say: 'Places in the code that create a sound building block, such as an oscillator, filter or effect.' },
  { key: 'loudness', label: 'Loudness', unit: 'LUFS', say: 'Average loudness of the Clip on the broadcast LUFS scale. Closer to 0 is louder.' },
  { key: 'peak', label: 'True peak', unit: 'dBTP', say: 'The loudest instant in the Clip. Above 0 the sound would distort.' },
  { key: 'silence', label: 'Silence', unit: '%', say: 'Share of the 15 seconds that is silent.' },
  { key: 'frames', label: 'Distinct frames', unit: '', say: 'Number of visibly different frames in the Clip’s picture.' },
  ...scoreMetrics,
] as const;

export function pieceValues(piece: Piece) {
  return { ...piece.measurements, ...piece.scores };
}

export function format(value: number | string | null | undefined) {
  return typeof value === 'number'
    ? value.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : (value ?? '—');
}

export function provenance(reading?: Reading) {
  return reading?.value != null && /log|recover/i.test(reading.source)
    ? ' (recovered from log)'
    : '';
}
