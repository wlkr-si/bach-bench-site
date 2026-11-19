export const vaultOrigin = 'https://vault.bach.wlkr.si';

export type Reading = { value: number | string | null; source: string };

type Values = Record<
  'wall' | 'lines' | 'characters' | 'reply' | 'nodes' | 'loudness' | 'peak' | 'silence' | 'frames',
  number | null
>;
type Scores = Record<'complexity' | 'sync' | 'uniqueness' | 'balance' | 'costUsd', number | null>;

export type Piece = {
  slug: string;
  title: string;
  model: string;
  modelName: string;
  lab: string | null;
  effort: string | null;
  clipUrl: string;
  posterUrl: string;
  detailUrl: string;
  withdrawn: boolean;
  measurements: Values;
  scores: Scores;
  map: { x: number; y: number };
};

export type VaultIndex = {
  schemaVersion: 1;
  revision: string;
  pieces: Piece[];
  titleWordCounts: Record<string, number>;
};

export type Timeline = {
  env: number[];
  notes: [number, number][];
  heat: string[];
  colors: [number, string][];
};

export type VaultDetail = {
  schemaVersion: 1;
  revision: string;
  slug: string;
  measurements: Record<string, Reading>;
  analysis: {
    drawingMethods: string[];
    audioNodeCallSites: Record<string, number>;
  };
  scores: Scores & {
    musicComplexity: number;
    pictureComplexity: number;
    syncMeasures: { event: { score: number }; continuous: { score: number }; lagMs: number };
    releaseDate: string | null;
    thinkingTokens: number | null;
    outputTokens: number | null;
    linesOfCode: number | null;
  };
  timeline: Timeline;
  moduleUrl: string;
  replyUrl: string;
};

async function readVault<T>(url: string): Promise<T> {
  if (new URL(url).origin !== vaultOrigin) throw new Error('Unexpected Vault address');
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Vault returned ${response.status}`);
  return response.json();
}

export async function readIndex(staging: boolean) {
  const index = await readVault<VaultIndex>(
    vaultOrigin + (staging ? '/staging/site-96/index.json' : '/index.json'),
  );
  if (index.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(index.revision) ||
      !Array.isArray(index.pieces) || !index.titleWordCounts) {
    throw new Error('Unexpected Vault index format');
  }
  return { ...index, pieces: index.pieces.filter(({ withdrawn }) => withdrawn === false) };
}

export async function readDetail(piece: Pick<Piece, 'slug' | 'detailUrl'>, revision: string) {
  const detail = await readVault<VaultDetail>(piece.detailUrl);
  if (detail.schemaVersion !== 1 || detail.slug !== piece.slug || detail.revision !== revision ||
      !detail.measurements || !detail.analysis || !detail.scores || !detail.timeline) {
    throw new Error('Piece detail does not match the Vault index');
  }
  return detail;
}
