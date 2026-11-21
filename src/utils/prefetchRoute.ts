const prefetchedRoutes = new Set<string>();

export function prefetchRoute(path: string): void {
  if (typeof window === 'undefined' || prefetchedRoutes.has(path)) return;
  prefetchedRoutes.add(path);

  if (path.startsWith('/explore') || path.startsWith('/genres') || path.startsWith('/movies') || path.startsWith('/popular')) {
    void import('../pages/Explore/ExplorePage.tsx');
  } else if (path.startsWith('/schedule')) {
    void import('../pages/Schedule/SchedulePage.tsx');
  } else if (path.startsWith('/anime/')) {
    void import('../pages/AnimeDetails/AnimeDetailsPage.tsx');
  } else if (path.startsWith('/watch/')) {
    void import('../pages/Watch/WatchPage.tsx');
  } else if (path.startsWith('/watchlist')) {
    void import('../pages/Watchlist/WatchlistPage.tsx');
  } else if (path.startsWith('/profile')) {
    void import('../pages/Profile/ProfilePage.tsx');
  }
}
