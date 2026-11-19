type Piece = {
  slug: string;
  model: string;
  modelName: string;
  effort?: string;
  title: string;
  clip: string;
  poster: string;
};

// The Vault index will supply the catalogue when it is connected.
export const pieces: readonly Piece[] = [];
