import React, { useState } from 'react';
import { Trophy, Medal, Crown, Star, Flame, Search, RotateCcw, UserPlus } from 'lucide-react';
import { LeaderboardEntry, UserProfile } from '../types';
import { playClickSound } from '../utils/audio';

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  currentUser: UserProfile | null;
  onResetLeaderboard: () => void;
  onAddNewUser: () => void;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({
  entries,
  currentUser,
  onResetLeaderboard,
  onAddNewUser,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredEntries = entries.filter(
    (e) =>
      e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.organization.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Find current user rank
  const currentUserRankIndex = entries.findIndex(
    (e) => e.isCurrentUser || (currentUser && e.id === currentUser.id)
  );

  const getRankBadge = (index: number) => {
    switch (index) {
      case 0:
        return (
          <div className="flex items-center justify-center w-7 h-7 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-600 text-slate-950 font-black shadow-md shadow-amber-500/20">
            <Crown className="w-4 h-4" />
          </div>
        );
      case 1:
        return (
          <div className="flex items-center justify-center w-7 h-7 rounded-xl bg-gradient-to-br from-slate-200 to-slate-400 text-slate-950 font-black shadow-md shadow-slate-300/20">
            <Medal className="w-4 h-4" />
          </div>
        );
      case 2:
        return (
          <div className="flex items-center justify-center w-7 h-7 rounded-xl bg-gradient-to-br from-amber-600 to-orange-700 text-white font-black shadow-md shadow-amber-700/20">
            <Medal className="w-4 h-4" />
          </div>
        );
      default:
        return (
          <div className="flex items-center justify-center w-7 h-7 rounded-xl bg-slate-800 text-slate-400 font-mono font-bold text-xs">
            #{index + 1}
          </div>
        );
    }
  };

  return (
    <div
      id="leaderboard-container"
      className="w-full flex flex-col h-full bg-slate-900/90 border-2 border-slate-800 rounded-2xl shadow-xl overflow-hidden"
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/60">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/20 border-2 border-amber-400/50 text-amber-300 shadow-md shadow-amber-500/20">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-sm text-slate-100 tracking-tight flex items-center gap-1.5">
                <span>BẢNG XẾP HẠNG STEM</span>
                <Flame className="w-4 h-4 text-amber-400 animate-pulse" />
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">Top phân loại rác tích điểm cao nhất</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                playClickSound();
                onAddNewUser();
              }}
              title="Thêm thí sinh mới"
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border-2 border-emerald-500/60 hover:border-emerald-400 text-emerald-300 hover:text-white font-black text-xs shadow-md shadow-emerald-950/50 hover:shadow-emerald-500/30 hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
              <span>Thêm Thí Sinh</span>
            </button>
            <button
              onClick={() => {
                playClickSound();
                onResetLeaderboard();
              }}
              title="Đặt lại bảng điểm mặc định"
              className="p-2 rounded-xl text-slate-400 hover:text-rose-300 hover:bg-rose-950/50 border border-slate-700/80 hover:border-rose-500/50 hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative mt-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm theo tên thí sinh hoặc lớp..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-all"
          />
        </div>
      </div>

      {/* Current User Standing Banner */}
      {currentUser && (
        <div className="px-4 py-2.5 bg-emerald-950/40 border-b border-emerald-500/30 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-base select-none">{currentUser.avatar}</span>
            <div>
              <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                <span>Bạn: {currentUser.name}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono font-bold">
                  HẠNG #{currentUserRankIndex >= 0 ? currentUserRankIndex + 1 : '—'}
                </span>
              </div>
              <div className="text-[10px] text-slate-400">{currentUser.organization}</div>
            </div>
          </div>
          <div className="font-mono font-extrabold text-sm text-emerald-400 bg-emerald-900/60 px-2.5 py-1 rounded-lg border border-emerald-500/40">
            {currentUser.totalPoints} đ
          </div>
        </div>
      )}

      {/* Ranking List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[480px]">
        {filteredEntries.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500">
            Không tìm thấy thí sinh nào phù hợp.
          </div>
        ) : (
          filteredEntries.map((entry, index) => {
            const isMe =
              entry.isCurrentUser || (currentUser && entry.id === currentUser.id);

            return (
              <div
                key={entry.id}
                className={`p-2.5 rounded-xl border transition-all flex items-center gap-3 ${
                  isMe
                    ? 'bg-emerald-950/50 border-emerald-500/60 shadow-md shadow-emerald-950/40 ring-1 ring-emerald-500/40'
                    : index < 3
                    ? 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    : 'bg-slate-950/40 border-slate-850 hover:border-slate-800'
                }`}
              >
                {/* Rank Badge */}
                <div className="flex-shrink-0">{getRankBadge(index)}</div>

                {/* Avatar */}
                <div className="text-xl select-none flex-shrink-0">{entry.avatar}</div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-bold truncate ${isMe ? 'text-emerald-200' : 'text-slate-200'}`}>
                      {entry.name}
                    </span>
                    {isMe && (
                      <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-emerald-500 text-slate-950">
                        BẠN
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 truncate mt-0.5">
                    <span className="truncate">{entry.organization}</span>
                    <span>•</span>
                    <span className="text-emerald-400/90 font-medium truncate">{entry.levelTitle}</span>
                  </div>
                </div>

                {/* Points */}
                <div className="flex-shrink-0 text-right">
                  <div className="font-mono font-extrabold text-sm text-amber-400">
                    {entry.totalPoints}
                  </div>
                  <div className="text-[9px] uppercase font-bold text-slate-500">điểm</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/50 text-[11px] text-slate-400 flex items-center justify-between">
        <span>Tổng thí sinh: <strong className="text-slate-200">{entries.length}</strong></span>
        <span className="text-emerald-400 font-medium">Tự động đồng bộ</span>
      </div>
    </div>
  );
};
