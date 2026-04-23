function hasExplicitExtension(pathname) {
  const basename = pathname.split('/').pop() ?? '';
  return basename.includes('.') && !basename.startsWith('.');
}

function getSpaFallbackResponseKind(pathname) {
  if (!pathname || pathname === '/') return 'spa';

  if (pathname === '/api' || pathname.startsWith('/api/')) return 'api-404';
  if (
    pathname === '/uploads'
    || pathname.startsWith('/uploads/')
    || pathname === '/assets'
    || pathname.startsWith('/assets/')
    || hasExplicitExtension(pathname)
  ) {
    return 'asset-404';
  }

  return 'spa';
}

module.exports = {
  getSpaFallbackResponseKind,
  hasExplicitExtension,
};
