import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AnimeSummary } from '../types/anime.ts';
import { QuickViewProvider } from '../context/QuickViewContext.tsx';
import { HeroShowcase } from '../components/anime/HeroShowcase.tsx';
import { ExplorePage } from '../pages/Explore/ExplorePage.tsx';
import { SearchOverlay } from '../components/layout/SearchOverlay.tsx';
import { SchedulePage } from '../pages/Schedule/SchedulePage.tsx';
import { anilistService } from '../services/anilistService.ts';
import { universeService } from '../services/universeService.ts';
import { airingScheduleService } from '../services/airingScheduleService.ts';

vi.mock('../context/LibraryContext.tsx', () => ({
  useLibrary: () => ({
    watchlist: [],
    favorites: [],
    watchHistory: [],
    ratings: [],
    loading: false,
    isGuestMode: true,
    guestCount: 0,
    refreshLibrary: vi.fn().mockResolvedValue(undefined),
    syncGuestToAccount: vi.fn().mockResolvedValue(0),
    clearGuestLibrary: vi.fn(),
    upsertWatchlist: vi.fn().mockResolvedValue(undefined),
    removeWatchlist: vi.fn().mockResolvedValue(undefined),
    toggleFavorite: vi.fn().mockResolvedValue(true),
    recordHistory: vi.fn().mockResolvedValue(undefined),
    saveRating: vi.fn().mockResolvedValue(undefined),
    getWatchlistEntry: () => undefined,
    isFavorited: () => false,
  }),
}));

vi.mock('../hooks/usePlaybackCapabilities.ts', () => ({
  usePlaybackCapabilities: () => ['sub', 'dub'],
}));

const SAMPLE_ANIME: AnimeSummary[] = [
  {
    id: 154587,
    slug: '154587-sousou-no-frieren',
    title: {
      romaji: 'Sousou no Frieren',
      english: 'Frieren: Beyond Journey’s End',
      native: '葬送のフリーレン',
    },
    format: 'TV',
    status: 'FINISHED',
    seasonYear: 2023,
    episodes: 28,
    averageScore: 91,
    genres: ['Adventure', 'Drama', 'Fantasy'],
    coverImage: {
      large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587.jpg',
    },
    bannerImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/154587.jpg',
    trailer: { id: 'ZEkwVEDMU3c', site: 'youtube' },
  },
  {
    id: 101922,
    slug: '101922-kimetsu-no-yaiba',
    title: {
      romaji: 'Kimetsu no Yaiba',
      english: 'Demon Slayer',
      native: '鬼滅の刃',
    },
    format: 'TV',
    status: 'FINISHED',
    seasonYear: 2019,
    episodes: 26,
    averageScore: 84,
    genres: ['Action', 'Adventure', 'Fantasy'],
    coverImage: {
      large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx101922.jpg',
    },
  },
];

describe('AniVerve UI & UX Upgrades', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('HeroShowcase shows first-visit value line, metadata, and toggles carousel pause', () => {
    render(
      <MemoryRouter>
        <HeroShowcase items={SAMPLE_ANIME} />
      </MemoryRouter>
    );

    expect(
      screen.getByText(/Stream HD anime instantly with live airing schedules/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /Frieren: Beyond Journey’s End/i
    );
    expect(screen.getByRole('link', { name: /Watch Now/i })).toBeInTheDocument();

    const pauseBtn = screen.getByRole('button', { name: /Pause spotlight carousel/i });
    expect(pauseBtn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(pauseBtn);
    expect(screen.getByRole('button', { name: /Resume spotlight carousel/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('ExplorePage parses URL filter params, renders removable chips, and clears individual chips', async () => {
    vi.spyOn(anilistService, 'explore').mockResolvedValue({
      media: SAMPLE_ANIME,
      pageInfo: {
        total: 2,
        currentPage: 1,
        lastPage: 1,
        hasNextPage: false,
        perPage: 24,
      },
    });
    vi.spyOn(anilistService, 'quickSearch').mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/explore?genre=Action&year=2024']}>
        <QuickViewProvider>
          <ExplorePage mode="explore" />
        </QuickViewProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Genre: Action')).toBeInTheDocument();
      expect(screen.getByText('Year: 2024')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Genre: Action/i }));

    await waitFor(() => {
      expect(screen.queryByText('Genre: Action')).not.toBeInTheDocument();
      expect(screen.getByText('Year: 2024')).toBeInTheDocument();
    });
  });

  it('SearchOverlay shows quick jumps, Ask AI toggle, and typo suggestions', async () => {
    vi.spyOn(universeService, 'universalSearch').mockResolvedValue({
      query: 'Acton',
      anime: [],
      characters: [],
      studios: [],
      genres: [],
      collections: [],
    });

    render(
      <MemoryRouter>
        <SearchOverlay open onClose={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.getByText('Browse Full Catalog')).toBeInTheDocument();
    expect(screen.getByText('Airing Schedule')).toBeInTheDocument();

    const aiBtn = screen.getByRole('button', { name: /Ask AI/i });
    expect(aiBtn).toHaveAttribute('aria-pressed', 'false');

    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'Acton' } });

    await waitFor(() => {
      expect(screen.getByText('Action')).toBeInTheDocument();
    });

    fireEvent.click(aiBtn);
    expect(aiBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('SchedulePage renders timezone controls and Export .ics action', async () => {
    const futureSec = Math.floor(Date.now() / 1000) + 3600;
    vi.spyOn(airingScheduleService, 'getSchedule').mockResolvedValue({
      schedules: [
        {
          id: 9001,
          episode: 12,
          airingAt: futureSec,
          timeUntilAiring: 3600,
          media: SAMPLE_ANIME[0],
        },
      ],
      pageInfo: {
        total: 1,
        currentPage: 1,
        lastPage: 1,
        hasNextPage: false,
        perPage: 50,
      },
    });

    render(
      <MemoryRouter>
        <SchedulePage />
      </MemoryRouter>
    );

    const exportBtn = await screen.findByRole('button', { name: /Export \.ics/i });
    await waitFor(() => expect(exportBtn).not.toBeDisabled());
    expect(screen.getByLabelText(/Schedule timezone/i)).toBeInTheDocument();
  });
});
