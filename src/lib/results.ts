import { scores, scoreMetrics } from './scores';
import { pieces } from './pieces';

type Reading = { value: number | string | null; source: string };
type Analysis = {
  moduleLines: number;
  moduleCharacters: number;
  replyCharacters: number;
  drawingMethods: string[];
  audioNodeCallSites: Record<string, number>;
  integratedLoudnessLufs: number;
  truePeakDbfs: number;
  silentFraction: number;
  distinctVideoFrames: number;
};

const runs: ReadonlyMap<string, Record<string, Reading>> = new Map();
const analyses: ReadonlyMap<string, Analysis> = new Map();

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

export const results = pieces.map((piece) => {
  const run = runs.get(piece.slug) ?? {};
  const analysis = analyses.get(piece.slug);
  const score = scores.get(piece.slug);
  return {
    ...piece,
    score,
    run,
    analysis,
    values: {
      complexity: score?.complexity ?? null,
      sync: score?.sync ?? null,
      uniqueness: score?.uniqueness ?? null,
      balance: score?.balance ?? null,
      costUsd: score?.costUsd ?? null,
      wall: (typeof run.wallSeconds?.value === 'number' ? run.wallSeconds.value : null),
      lines: analysis?.moduleLines,
      characters: analysis?.moduleCharacters,
      reply: analysis?.replyCharacters,
      nodes:
        analysis?.audioNodeCallSites &&
        Object.values(analysis?.audioNodeCallSites).reduce(
          (sum, n) => sum + n,
          0,
        ),
      loudness: analysis?.integratedLoudnessLufs,
      peak: analysis?.truePeakDbfs,
      silence:
        analysis?.silentFraction == null ? null : analysis?.silentFraction * 100,
      frames: analysis?.distinctVideoFrames,
    },
  };
});

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
