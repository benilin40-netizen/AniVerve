import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Swords, Trophy } from 'lucide-react';
import type { FaceOffMatchup } from '../../types/anime.ts';
import { universeService } from '../../services/universeService.ts';
import { useToast } from '../../context/ToastContext.tsx';
import { getPrimaryTitle } from '../../utils/slug.ts';
import { formatFormat, formatMalScore, formatScore } from '../../utils/formatters.ts';
import { SafeImage } from '../common/SafeImage.tsx';

interface AnimeFaceOffProps {
  matchup: FaceOffMatchup | null;
  onUpdated: (next: FaceOffMatchup) => void;
}

export function AnimeFaceOff({ matchup, onUpdated }: AnimeFaceOffProps) {
  const { showToast } = useToast();
  const [submittingId, setSubmittingId] = useState<number | null>(null);

  if (!matchup) return null;

  const { animeA, animeB, votesA, votesB, totalVotes, userVoteAnilistId } = matchup;
  const pctA = totalVotes > 0 ? Math.round((votesA / totalVotes) * 100) : 0;
  const pctB = totalVotes > 0 ? Math.round((votesB / totalVotes) * 100) : 0;

  const handleVote = async (winnerId: number) => {
    if (userVoteAnilistId) return;
    setSubmittingId(winnerId);
    try {
      const updated = await universeService.voteFaceOff(matchup.id, winnerId);
      onUpdated(updated);
      showToast('Your Face-Off vote has been recorded.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to submit vote.', 'error');
    } finally {
      setSubmittingId(null);
    }
  };

  const renderContender = (
    anime: FaceOffMatchup['animeA'],
    votes: number,
    pct: number,
    isUserChoice: boolean
  ) => {
    const title = getPrimaryTitle(anime.title);
    return (
      <div
        className={`flex flex-col justify-between rounded-2xl border p-4 sm:p-5 transition-colors ${
          isUserChoice
            ? 'border-[#9B87FF] bg-[#7C5CFF]/10'
            : 'border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722]'
        }`}
      >
        <div className="flex gap-4">
          <Link
            to={`/anime/${anime.slug}`}
            className="w-24 sm:w-28 aspect-[3/4] shrink-0 overflow-hidden rounded-xl bg-[#11111B]"
          >
            <SafeImage
              src={anime.coverImage?.extraLarge || anime.coverImage?.large}
              alt={title}
              className="h-full w-full object-cover hover:scale-105 transition-transform duration-300"
            />
          </Link>

          <div className="min-w-0 flex-1 space-y-2">
            <Link
              to={`/anime/${anime.slug}`}
              className="text-base sm:text-lg font-bold text-zinc-900 dark:text-[#F5F3FF] hover:text-[#9B87FF] line-clamp-2"
            >
              {title}
            </Link>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums">
              <div>
                <span className="text-zinc-500 dark:text-[#A5A1B5]">AniList: </span>
                <span className="font-mono font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                  {formatScore(anime.averageScore)}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 dark:text-[#A5A1B5]">MAL: </span>
                <span className="font-mono font-semibold text-emerald-500">
                  {typeof anime.malScore === 'number' ? formatMalScore(anime.malScore) : '—'}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 dark:text-[#A5A1B5]">Format: </span>
                <span className="font-medium text-zinc-900 dark:text-[#F5F3FF]">
                  {formatFormat(anime.format)}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 dark:text-[#A5A1B5]">Year: </span>
                <span className="font-mono text-zinc-900 dark:text-[#F5F3FF]">
                  {anime.seasonYear || 'TBD'}
                </span>
              </div>
            </div>
            {anime.genres && anime.genres.length > 0 && (
              <p className="text-[11px] text-[#7C5CFF] dark:text-[#9B87FF] truncate">
                {anime.genres.slice(0, 3).join(' · ')}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-zinc-200 dark:border-white/[0.08] space-y-2.5">
          {userVoteAnilistId !== null && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                <span className="text-zinc-600 dark:text-[#A5A1B5]">
                  {votes} verified {votes === 1 ? 'vote' : 'votes'}
                </span>
                <span className="font-semibold text-[#9B87FF]">{pct}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-[#20202D]">
                <div
                  className="h-full bg-[#7C5CFF] transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={userVoteAnilistId !== null || submittingId !== null}
            onClick={() => handleVote(anime.id)}
            className={`w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold transition-colors ${
              isUserChoice
                ? 'bg-[#7C5CFF] text-white'
                : userVoteAnilistId !== null
                  ? 'border border-zinc-200 dark:border-white/[0.08] text-zinc-400 cursor-not-allowed'
                  : 'border border-[#9B87FF]/40 bg-[#9B87FF]/10 text-[#7C5CFF] dark:text-[#9B87FF] hover:bg-[#7C5CFF] hover:text-white'
            }`}
          >
            {isUserChoice ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Voted for {title}
              </>
            ) : userVoteAnilistId !== null ? (
              'Vote Locked'
            ) : submittingId === anime.id ? (
              'Recording Vote...'
            ) : (
              <>
                <Trophy className="h-3.5 w-3.5" />
                Vote {title}
              </>
            )}
          </button>
        </div>
      </div>
    );
  };

  return (
    <section aria-labelledby="faceoff-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-[#7C5CFF] dark:text-[#9B87FF]">
            <Swords className="h-3.5 w-3.5" />
            Weekly Matchup · {matchup.weekKey}
          </p>
          <h2
            id="faceoff-heading"
            className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-[#F5F3FF]"
          >
            Anime Face-Off
          </h2>
        </div>

        <span className="font-mono text-xs text-zinc-500 dark:text-[#A5A1B5] tabular-nums">
          {totalVotes} authenticated {totalVotes === 1 ? 'vote' : 'votes'} recorded
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {renderContender(animeA, votesA, pctA, userVoteAnilistId === animeA.id)}
        {renderContender(animeB, votesB, pctB, userVoteAnilistId === animeB.id)}
      </div>
    </section>
  );
}
