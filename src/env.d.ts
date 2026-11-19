declare namespace App {
  interface Locals {
    vault: import('./lib/vault').VaultIndex;
    shareImage?: ReturnType<typeof import('./lib/share-images').readShareImages>;
    piece?: import('./lib/vault').Piece;
    detail?: import('./lib/vault').VaultDetail;
    vaultProblem?: 'missing' | 'unavailable';
  }
}
