import React, { useState } from 'react';
import {
  Trophy,
  Medal,
  Crown,
  Flame,
  Search,
  RotateCcw,
  UserPlus,
  Database,
  CheckCircle2,
  Code
} from 'lucide-react';
import { LeaderboardEntry, UserProfile } from '../types';
import { playClickSound } from '../utils/audio';
import { isSupabaseConfigured } from '../lib/supabase';

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  currentUser: UserProfile | null;
  onRefreshOnline?: () => void;
  onAddNewUser: () => void;
  onOpenSqlGuide?: () => void;
  isLoading?: boolean;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({
  entries,
  currentUser,
  onRefreshOnline,
  onAddNewUser,
  onOpenSqlGuide,
  isLoading = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const isOnline = isSupabaseConfigured();

  const filteredEntries = entries.filter(
    (e) =>
      e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.organization && e.organization.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (e.email && e.email.toLowerCase().includes(searchQuery.toLowerCase()))
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
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-black text-sm text-slate-100 tracking-tight flex items-center gap-1.5">
                  <span>BẢNG XẾP HẠNG STEM</span>
                  <Flame className="w-4 h-4 text-amber-400 animate-pulse" />
                </h3>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.2 rounded-full border ${
                    isOnline
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  }`}
                >
                  <Database className="w-3 h-3" />
                  {isOnline ? 'Supabase Online' : 'Chưa gắn URL'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                Xếp hạng trực tiếp theo tổng điểm và số lần phân loại đúng
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-1.5">
            {onOpenSqlGuide && (
              <button
                onClick={() => {
                  playClickSound();
                  onOpenSqlGuide();
                }}
                title="Xem mã SQL Database"
                className="p-2 rounded-xl bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-300 hover:text-white transition-all cursor-pointer"
              >
                <Code className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={() => {
                playClickSound();
                onAddNewUser();
              }}
              title="Đăng ký hoặc đăng nhập tài khoản"
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border-2 border-emerald-500/60 hover:border-emerald-400 text-emerald-300 hover:text-white font-black text-xs shadow-md shadow-emerald-950/50 hover:shadow-emerald-500/30 hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
              <span>{currentUser ? 'Hồ Sơ' : 'Đăng Ký/Đăng Nhập'}</span>
            </button>

            {onRefreshOnline && (
              <button
                onClick={() => {
                  playClickSound();
                  onRefreshOnline();
                }}
                disabled={isLoading}
                title="Tải lại dữ liệu từ Database Online"
                className="p-2 rounded-xl text-slate-400 hover:text-emerald-300 hover:bg-slate-850 border border-slate-700/80 hover:border-emerald-500/50 hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
              </button>
            )}
          </div>
        </div>

        {/* Search Input */}
        <div className="relative mt-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm theo tên thí sinh, email hoặc lớp..."
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
              <div className="text-[10px] text-slate-400 flex items-center gap-2">
                <span>{currentUser.organization}</span>
                <span>•</span>
                <span>Đúng: <strong className="text-emerald-300">{currentUser.correctCount || 0} lần</strong></span>
              </div>
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
          <div className="py-12 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <Trophy className="w-6 h-6 text-slate-500" />
            </div>
            <p className="text-xs font-bold text-slate-300 mb-1">
              Chưa có người chơi nào trên Bảng Xếp Hạng
            </p>
            <p className="text-[11px] text-slate-500 max-w-xs mx-auto mb-4">
              Không sử dụng dữ liệu giả. Hãy bấm nút Đăng Ký Tài Khoản và quét rác qua Webcam để ghi tên vào bảng vàng!
            </p>
            <button
              onClick={() => {
                playClickSound();
                onAddNewUser();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Đăng Ký Tài Khoản Ngay (0 điểm)</span>
            </button>
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
                    <span className="text-emerald-400/90 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                      {entry.correctCount || 0} lần đúng
                    </span>
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
        <span className="text-emerald-400 font-medium flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          Realtime Database
        </span>
      </div>
    </div>
  );
};
