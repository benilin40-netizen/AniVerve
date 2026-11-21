import React, { useMemo, useState } from 'react';
import type { UserProfile } from '../../../types/anime.ts';
import type { CatalogOverrideRecord } from './adminTypes.ts';

interface UsersTabProps {
  users: UserProfile[];
  onUpdateUser: (id: string, body: { role?: string; status?: string }) => Promise<void>;
  onDeleteUser: (user: UserProfile) => Promise<void>;
}

export function UsersTab({ users, onUpdateUser, onDeleteUser }: UsersTabProps) {
  const [userSearch, setUserSearch] = useState('');

  const filteredUsers = useMemo(
    () =>
      users.filter(
        (u) =>
          !userSearch.trim() ||
          u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
          u.username.toLowerCase().includes(userSearch.toLowerCase())
      ),
    [users, userSearch]
  );

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-[#F5F3FF]">
            User Management ({users.length})
          </h1>
          <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">
            Inspect member accounts, adjust operational status, or remove obsolete records.
          </p>
        </div>
        <input
          type="search"
          placeholder="Search email or username..."
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
          className="rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 text-xs w-64 focus:border-[#9B87FF] focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-white/[0.08] text-zinc-500 dark:text-[#A5A1B5]">
              <th className="pb-3 font-medium">Member</th>
              <th className="pb-3 font-medium">Role</th>
              <th className="pb-3 font-medium">Status</th>
              <th className="pb-3 font-medium">Joined</th>
              <th className="pb-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
            {filteredUsers.map((u) => (
              <tr key={u.id}>
                <td className="py-3">
                  <p className="font-medium text-zinc-900 dark:text-[#F5F3FF]">{u.username}</p>
                  <p className="text-zinc-500 dark:text-[#A5A1B5]">{u.email}</p>
                </td>
                <td className="py-3">
                  <select
                    value={u.role}
                    onChange={(e) => void onUpdateUser(u.id, { role: e.target.value })}
                    className="rounded border border-zinc-200 dark:border-white/[0.1] bg-transparent dark:bg-[#11111B] px-2 py-1 text-xs"
                  >
                    <option value="USER">USER</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                  </select>
                </td>
                <td className="py-3">
                  <span
                    className={`font-semibold ${
                      u.status === 'ACTIVE' ? 'text-emerald-500' : 'text-rose-500'
                    }`}
                  >
                    {u.status}
                  </span>
                </td>
                <td className="py-3 font-mono tabular-nums text-zinc-500 dark:text-[#A5A1B5]">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td className="py-3 text-right space-x-2">
                  <button
                    type="button"
                    onClick={() =>
                      void onUpdateUser(u.id, {
                        status: u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
                      })
                    }
                    className="rounded-lg border border-zinc-200 dark:border-white/[0.1] px-2.5 py-1 hover:bg-zinc-100 dark:hover:bg-[#20202D]"
                  >
                    {u.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDeleteUser(u)}
                    className="rounded-lg border border-rose-500/30 px-2.5 py-1 text-rose-500 hover:bg-rose-500/10"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface CatalogTabProps {
  overrides: CatalogOverrideRecord[];
  onAddOverride: (anilistId: number) => Promise<void>;
  onToggleFlag: (anilistId: number, patch: { featured?: boolean; hidden?: boolean }) => Promise<void>;
  onRefreshMetadata: (anilistId: number) => Promise<void>;
}

export function CatalogTab({
  overrides,
  onAddOverride,
  onToggleFlag,
  onRefreshMetadata,
}: CatalogTabProps) {
  const [catalogIdInput, setCatalogIdInput] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(catalogIdInput);
    if (!Number.isInteger(num) || num <= 0) return;
    await onAddOverride(num);
    setCatalogIdInput('');
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-5"
      >
        <div className="flex-1 min-w-[240px]">
          <h1 className="text-lg font-bold text-zinc-900 dark:text-[#F5F3FF]">
            Feature or Hide AniList Titles
          </h1>
          <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">
            Pin any AniList ID to the hero showcase or hide an entry from the catalog.
          </p>
        </div>
        <input
          type="number"
          placeholder="AniList ID (e.g. 154587)"
          value={catalogIdInput}
          onChange={(e) => setCatalogIdInput(e.target.value)}
          required
          className="rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 text-sm w-48 focus:border-[#9B87FF] focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-4 py-2 text-xs font-semibold text-white"
        >
          Add Catalog Override
        </button>
      </form>

      <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-4">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-[#F5F3FF]">
          Active Catalog Overrides ({overrides.length})
        </h2>
        {overrides.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">No catalog overrides defined yet.</p>
        ) : (
          <div className="space-y-3">
            {overrides.map((ov) => (
              <div
                key={ov.id}
                className="flex flex-wrap items-center justify-between gap-4 p-3.5 rounded-xl border border-zinc-200 dark:border-white/[0.08] text-xs"
              >
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                    AniList #{ov.anilistId}{' '}
                    {ov.anime?.title?.romaji ? `— ${ov.anime.title.romaji}` : ''}
                  </p>
                  <p className="text-zinc-500 dark:text-[#A5A1B5]">
                    Featured: {ov.featured ? 'Yes' : 'No'} · Hidden: {ov.hidden ? 'Yes' : 'No'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void onRefreshMetadata(ov.anilistId)}
                    className="rounded-lg border border-zinc-200 dark:border-white/[0.1] px-3 py-1.5 hover:border-[#9B87FF]"
                  >
                    Refresh Meta
                  </button>
                  <button
                    type="button"
                    onClick={() => void onToggleFlag(ov.anilistId, { featured: !ov.featured })}
                    className="rounded-lg border border-zinc-200 dark:border-white/[0.1] px-3 py-1.5 hover:border-[#9B87FF]"
                  >
                    {ov.featured ? 'Unfeature' : 'Feature'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onToggleFlag(ov.anilistId, { hidden: !ov.hidden })}
                    className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-rose-500 hover:bg-rose-500/10"
                  >
                    {ov.hidden ? 'Restore Visible' : 'Hide Title'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
