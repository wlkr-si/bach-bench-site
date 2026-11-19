declare namespace App {
  interface Locals {
    vault: import('./lib/vault').VaultIndex;
    piece?: import('./lib/vault').Piece;
    detail?: import('./lib/vault').VaultDetail;
    vaultProblem?: 'missing' | 'unavailable';
  }
}
