export function publicAddress(path: string) {
  return new URL(path, import.meta.env.PUBLIC_SITE_URL || 'http://localhost:4321').href;
}

export function pieceAddress(slug: string) {
  return publicAddress(`/p/${slug}`);
}
