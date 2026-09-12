import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  UserProfile,
  LeaderboardEntry,
  WasteHistoryRecord,
  WasteClassificationResult,
  DuplicateAlertInfo,
} from './types';
import {
  loadUserProfile,
  saveUserProfile,
  clearUserProfile,
  loadHistory,
  saveHistory,
  clearHistory,
} from './utils/storage';
import { getIsMuted, toggleMute, playVictorySound, playPointSound } from './utils/audio';

import { Navbar } from './components/Navbar';
import { LoginModal } from './components/LoginModal';
import { WebcamScanner } from './components/WebcamScanner';
import { Leaderboard } from './components/Leaderboard';
import { ClassificationHistory } from './components/ClassificationHistory';
import { PointsNotification } from './components/PointsNotification';
import { DuplicateWarningToast } from './components/DuplicateWarningToast';
import { WasteGuideModal } from './components/WasteGuideModal';
import { StemPresentationView } from './components/StemPresentationView';
import { SupabaseSqlModal } from './components/SupabaseSqlModal';
import {
  isSupabaseConfigured,
  getSupabase,
  fetchPlayerProfile,
  fetchOnlineLeaderboard,
  subscribeToLeaderboardChanges,
  recordClassificationOnline,
} from './lib/supabase';
import { Database, Code, ShieldCheck, Sparkles } from 'lucide-react';

export default function App() {
  // User Profile
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    return loadUserProfile();
  });
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  // Leaderboard & History
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);
  const [history, setHistory] = useState<WasteHistoryRecord[]>([]);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);

  // Processing & Notifications
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeNotification, setActiveNotification] = useState<WasteClassificationResult | null>(null);
  const [duplicateAlert, setDuplicateAlert] = useState<DuplicateAlertInfo | null>(null);
  const [recentPointChange, setRecentPointChange] = useState<number | null>(null);

  // Modals & UI States
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(getIsMuted);

  const isSupabaseLive = isSupabaseConfigured();
  const currentUserRef = useRef<UserProfile | null>(currentUser);
  currentUserRef.current = currentUser;

  // Refresh online leaderboard from Supabase
  const refreshLeaderboardOnline = useCallback(async () => {
    setIsLoadingLeaderboard(true);
    try {
      const res = await fetchOnlineLeaderboard(currentUserRef.current?.id);
      if (res.entries) {
        setLeaderboardEntries(res.entries);
      }
    } catch (e) {
      console.error('Failed to fetch online leaderboard', e);
    } finally {
      setIsLoadingLeaderboard(false);
    }
  }, []);

  // Initialize data and Supabase Auth session on mount
  useEffect(() => {
    const loadedHistory = loadHistory();
    setHistory(loadedHistory);

    const client = getSupabase();
    if (client) {
      // 1. Check existing Supabase auth session
      client.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          fetchPlayerProfile(session.user.id).then((profile) => {
            if (profile) {
              setCurrentUser(profile);
              saveUserProfile(profile);
            }
          });
        }
      });

      // 2. Listen to Supabase auth changes
      const {
        data: { subscription },
      } = client.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          const profile = await fetchPlayerProfile(session.user.id);
          if (profile) {
            setCurrentUser(profile);
            saveUserProfile(profile);
          }
        }
      });

      // 3. Subscribe to Realtime Postgres changes on 'public.players'
      const channel = subscribeToLeaderboardChanges(() => {
        refreshLeaderboardOnline();
      });

      // 4. Initial fetch from online database
      refreshLeaderboardOnline();

      return () => {
        subscription.unsubscribe();
        if (channel) {
          client.removeChannel(channel);
        }
      };
    } else {
      // Offline fallback: load cached leaderboard without mock items
      const savedUser = loadUserProfile();
      if (!savedUser) {
        setIsLoginModalOpen(true);
      }
    }
  }, [refreshLeaderboardOnline]);

  // Handle classification result from WebcamScanner
  const handleClassified = useCallback(
    async (result: WasteClassificationResult) => {
      // 1. Strict verification: ONLY award points if source is webcam scanning
      const isWebcamScan = result.source === 'webcam' && !result.isReferenceOnly;
      const pointsToAward = isWebcamScan ? result.points : 0;

      // Set active notification toast
      const displayResult: WasteClassificationResult = {
        ...result,
        points: pointsToAward,
      };
      setActiveNotification(displayResult);

      if (pointsToAward > 0) {
        setRecentPointChange(pointsToAward);
        setTimeout(() => setRecentPointChange(null), 3000);
      }

      if (!isWebcamScan) {
        return;
      }

      // 2. If user is authenticated with Supabase: Save directly to online database via tamper-proof RPC
      if (isSupabaseLive && currentUser) {
        try {
          const onlineRes = await recordClassificationOnline({
            itemName: result.itemName,
            category: result.category,
            points: pointsToAward,
            source: 'webcam',
            confidence: result.confidence,
          });

          if (onlineRes.success) {
            const newTotalPoints = onlineRes.totalPoints ?? (currentUser.totalPoints + pointsToAward);
            const newCorrectCount = onlineRes.correctCount ?? (currentUser.correctCount + 1);

            const updatedUser: UserProfile = {
              ...currentUser,
              totalPoints: newTotalPoints,
              correctCount: newCorrectCount,
              organicCount: currentUser.organicCount + (result.category === 'organic' ? 1 : 0),
              recyclableCount: currentUser.recyclableCount + (result.category === 'recyclable' ? 1 : 0),
              inorganicCount: currentUser.inorganicCount + (result.category === 'inorganic' ? 1 : 0),
            };

            setCurrentUser(updatedUser);
            saveUserProfile(updatedUser);

            // Trigger sound milestone
            if (newTotalPoints >= 20 && currentUser.totalPoints < 20) {
              playVictorySound();
            } else if (newTotalPoints >= 35 && currentUser.totalPoints < 35) {
              playVictorySound();
            } else if (newTotalPoints >= 50 && currentUser.totalPoints < 50) {
              playVictorySound();
            }

            // Immediately update online leaderboard
            refreshLeaderboardOnline();
          } else {
            console.warn('Online RPC points failed, falling back to local sync:', onlineRes.error);
          }
        } catch (err) {
          console.error('Error saving classification to Supabase:', err);
        }
      } else {
        // Fallback or unauthenticated update
        let updatedUser: UserProfile;
        if (currentUser) {
          const wasPoints = currentUser.totalPoints;
          const newPoints = wasPoints + pointsToAward;

          updatedUser = {
            ...currentUser,
            totalPoints: newPoints,
            correctCount: (currentUser.correctCount || 0) + 1,
            organicCount: currentUser.organicCount + (result.category === 'organic' ? 1 : 0),
            recyclableCount: currentUser.recyclableCount + (result.category === 'recyclable' ? 1 : 0),
            inorganicCount: currentUser.inorganicCount + (result.category === 'inorganic' ? 1 : 0),
          };

          setCurrentUser(updatedUser);
          saveUserProfile(updatedUser);

          if (newPoints >= 20 && wasPoints < 20) {
            playVictorySound();
          }
        } else {
          // Guest user
          updatedUser = {
            id: 'user-guest-' + Date.now(),
            name: 'Thí sinh Khách',
            organization: 'Khối Sáng Tạo STEM',
            avatar: '🌱',
            totalPoints: pointsToAward,
            correctCount: 1,
            organicCount: result.category === 'organic' ? 1 : 0,
            recyclableCount: result.category === 'recyclable' ? 1 : 0,
            inorganicCount: result.category === 'inorganic' ? 1 : 0,
            createdAt: Date.now(),
          };
          setCurrentUser(updatedUser);
          saveUserProfile(updatedUser);
        }
      }

      // Add to local history log
      const newRecord: WasteHistoryRecord = {
        ...result,
        points: pointsToAward,
        id: 'record-' + Date.now(),
        timestamp: Date.now(),
        userName: currentUser ? currentUser.name : 'Thí sinh Khách',
      };

      setHistory((prev) => {
        const next = [newRecord, ...prev];
        saveHistory(next);
        return next;
      });
    },
    [currentUser, isSupabaseLive, refreshLeaderboardOnline]
  );

  // Handle user login / switch
  const handleLogin = (profile: UserProfile) => {
    setCurrentUser(profile);
    saveUserProfile(profile);
    setIsLoginModalOpen(false);
    refreshLeaderboardOnline();
  };

  // Handle sign out
  const handleLogout = () => {
    clearUserProfile();
    setCurrentUser(null);
    refreshLeaderboardOnline();
  };

  // Clear history
  const handleClearHistory = () => {
    if (window.confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử phân loại rác cục bộ?')) {
      clearHistory();
      setHistory([]);
    }
  };

  // Audio toggle
  const handleToggleMute = () => {
    const muted = toggleMute();
    setIsMuted(muted);
  };

  // Handle anti-cheat duplicate detected
  const handleDuplicateDetected = (alert: DuplicateAlertInfo) => {
    setDuplicateAlert(alert);
    setActiveNotification(null);
  };

  // Fullscreen presentation toggle
  const handleToggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-white">
      {/* Navbar */}
      <Navbar
        currentUser={currentUser}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        onOpenGuide={() => setIsGuideOpen(true)}
        onSwitchUser={() => setIsLoginModalOpen(true)}
        recentPointChange={recentPointChange}
      />

      {/* Floating Points Notification */}
      <PointsNotification
        result={activeNotification}
        onDismiss={() => setActiveNotification(null)}
      />

      {/* Anti-Cheat Duplicate Warning Toast */}
      <DuplicateWarningToast
        alert={duplicateAlert}
        onDismiss={() => setDuplicateAlert(null)}
        onConfirmDroppedInBin={() => setDuplicateAlert(null)}
        onOpenGuide={() => {
          setDuplicateAlert(null);
          setIsGuideOpen(true);
        }}
      />

      {/* Supabase Authentication / User Profile Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        currentUser={currentUser}
        onClose={currentUser ? () => setIsLoginModalOpen(false) : undefined}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onOpenSqlGuide={() => setIsSqlModalOpen(true)}
      />

      {/* STEM Waste Guide Modal */}
      <WasteGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
      />

      {/* Supabase SQL & Security Schema Guide Modal */}
      <SupabaseSqlModal
        isOpen={isSqlModalOpen}
        onClose={() => setIsSqlModalOpen(false)}
      />

      {/* Fullscreen Presentation View if activated */}
      {isFullscreen && (
        <StemPresentationView
          currentUser={currentUser}
          leaderboardEntries={leaderboardEntries}
          history={history}
          isProcessing={isProcessing}
          setIsProcessing={setIsProcessing}
          onClassified={handleClassified}
          onResetLeaderboard={refreshLeaderboardOnline}
          onAddNewUser={() => setIsLoginModalOpen(true)}
          onExitFullscreen={() => setIsFullscreen(false)}
          onDuplicateDetected={handleDuplicateDetected}
          onOpenGuide={() => setIsGuideOpen(true)}
          onOpenSqlGuide={() => setIsSqlModalOpen(true)}
        />
      )}

      {/* Main Content Dashboard */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Supabase Online Sync Banner */}
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg text-xs flex-wrap">
          <div className="flex items-center gap-2">
            <span
              className={`flex h-2.5 w-2.5 relative ${
                isSupabaseLive ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isSupabaseLive ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  isSupabaseLive ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
            </span>
            <span className="font-bold text-slate-200">
              {isSupabaseLive
                ? 'Supabase Database Online: Đang kết nối & Đồng bộ Realtime'
                : 'Chế độ Supabase: Sẵn sàng cấu hình biến môi trường VITE_SUPABASE_URL'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSqlModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 hover:text-cyan-200 font-bold transition-all cursor-pointer"
            >
              <Code className="w-3.5 h-3.5" />
              <span>Xem Lệnh SQL & Bảo Mật RLS</span>
            </button>
            <button
              onClick={() => setIsLoginModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 hover:text-emerald-200 font-bold transition-all cursor-pointer"
            >
              <Database className="w-3.5 h-3.5" />
              <span>{currentUser ? currentUser.name : 'Đăng Ký / Đăng Nhập'}</span>
            </button>
          </div>
        </div>

        {/* Project STEM Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-950/60 via-slate-900 to-cyan-950/40 border border-slate-800 p-5 sm:p-6 shadow-2xl">
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold mb-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                DỰ ÁN CÔNG NGHỆ MÔI TRƯỜNG &bull; CUỘC THI STEM
              </div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-100 tracking-tight">
                Hệ Thống Phân Loại Rác Thông Minh & Tích Điểm Thưởng
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 max-w-2xl mt-1 leading-relaxed">
                Ứng dụng AI nhận diện rác trực tiếp qua Webcam, lưu điểm trực tiếp vào cơ sở dữ liệu Supabase online. Sắp xếp bảng xếp hạng theo tổng điểm và số lần phân loại chính xác.
              </p>
            </div>

            {/* Current Active Contestant Quick Stats Pill */}
            {currentUser && (
              <div className="flex items-center gap-3 bg-slate-950/80 border border-slate-700/80 rounded-2xl p-3 shadow-lg">
                <span className="text-3xl select-none">{currentUser.avatar}</span>
                <div className="text-left">
                  <div className="text-xs text-slate-400">Điểm của bạn:</div>
                  <div className="text-2xl font-black font-mono text-amber-400 leading-none">
                    {currentUser.totalPoints} <span className="text-xs text-slate-300 font-normal">điểm</span>
                  </div>
                  <div className="text-[10px] text-emerald-400 mt-1 font-semibold">
                    {currentUser.name} ({currentUser.correctCount || 0} lần đúng)
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Primary Row: Webcam Scanner on Left, Leaderboard on Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Webcam AI Scanner (7 Columns) */}
          <div className="lg:col-span-7">
            <WebcamScanner
              onClassified={handleClassified}
              isProcessing={isProcessing}
              setIsProcessing={setIsProcessing}
              onDuplicateDetected={handleDuplicateDetected}
              onOpenGuide={() => setIsGuideOpen(true)}
            />
          </div>

          {/* Right: Leaderboard (5 Columns) */}
          <div className="lg:col-span-5 h-full">
            <Leaderboard
              entries={leaderboardEntries}
              currentUser={currentUser}
              onRefreshOnline={refreshLeaderboardOnline}
              onAddNewUser={() => setIsLoginModalOpen(true)}
              onOpenSqlGuide={() => setIsSqlModalOpen(true)}
              isLoading={isLoadingLeaderboard}
            />
          </div>
        </div>

        {/* Secondary Row: Classification History & Impact Metrics */}
        <ClassificationHistory
          history={history}
          onClearHistory={handleClearHistory}
        />
      </main>

      {/* STEM Footer */}
      <footer className="w-full border-t border-slate-800/80 bg-slate-950 py-6 px-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <strong className="text-slate-400">EcoSort AI STEM</strong> &bull; Supabase Database & Authentication Online
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Rác Hữu cơ: +1đ</span>
            <span>&bull;</span>
            <span>Rác Tái chế: +2đ</span>
            <span>&bull;</span>
            <span>Rác Vô cơ: +3đ</span>
          </div>
          <div>
            Hệ thống phân loại rác tích điểm chống gian lận
          </div>
        </div>
      </footer>
    </div>
  );
}
