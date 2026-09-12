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
  loadLeaderboard,
  saveLeaderboard,
  getLevelTitle,
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
import { GoogleSheetsModal } from './components/GoogleSheetsModal';
import {
  isSupabaseConfigured,
  getSupabase,
  fetchPlayerProfile,
  fetchOnlineLeaderboard,
  subscribeToLeaderboardChanges,
  recordClassificationOnline,
} from './lib/supabase';
import {
  isGoogleSheetsConfigured,
  fetchGoogleSheetsData,
  recordWasteToGoogleSheets,
  registerPlayerToGoogleSheets,
} from './lib/googleSheets';
import { Database, Code, ShieldCheck, Sparkles, FileSpreadsheet, RefreshCw } from 'lucide-react';

export default function App() {
  // User Profile
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    return loadUserProfile();
  });
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  // Leaderboard & History
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>(() => {
    return loadLeaderboard(loadUserProfile());
  });
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
  const [isGoogleSheetsModalOpen, setIsGoogleSheetsModalOpen] = useState(false);
  const [isGoogleSheetsActive, setIsGoogleSheetsActive] = useState<boolean>(() => isGoogleSheetsConfigured());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(getIsMuted);

  const isSupabaseLive = isSupabaseConfigured();
  const currentUserRef = useRef<UserProfile | null>(currentUser);
  currentUserRef.current = currentUser;

  // Synchronization with Google Sheets (Primary Multi-device Online Database)
  const syncWithGoogleSheets = useCallback(async (showLoading = false) => {
    if (!isGoogleSheetsConfigured()) return;
    if (showLoading) setIsLoadingLeaderboard(true);
    try {
      const res = await fetchGoogleSheetsData();
      if (res.success && res.players) {
        setIsGoogleSheetsActive(true);
        // Sort descending by totalPoints, then correctCount
        const sorted = [...res.players].sort((a, b) => {
          if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
          return (b.correctCount || 0) - (a.correctCount || 0);
        });

        const mapped = sorted.map((p) => ({
          ...p,
          isCurrentUser: Boolean(
            currentUserRef.current &&
              (p.id === currentUserRef.current.id ||
                p.name.trim().toLowerCase() === currentUserRef.current.name.trim().toLowerCase())
          ),
        }));

        setLeaderboardEntries(mapped);

        // Synchronize current user's points if changed on Google Sheets
        if (currentUserRef.current) {
          const matched = sorted.find(
            (p) =>
              p.id === currentUserRef.current?.id ||
              p.name.trim().toLowerCase() === currentUserRef.current?.name.trim().toLowerCase()
          );
          if (matched) {
            setCurrentUser((prev) => {
              if (!prev) return prev;
              if (prev.totalPoints !== matched.totalPoints || prev.correctCount !== matched.correctCount) {
                const updated = {
                  ...prev,
                  totalPoints: matched.totalPoints,
                  correctCount: matched.correctCount || prev.correctCount,
                };
                saveUserProfile(updated);
                return updated;
              }
              return prev;
            });
          }
        }

        if (res.history && res.history.length > 0) {
          setHistory(res.history);
          saveHistory(res.history);
        }
      }
    } catch (err) {
      console.error('Google Sheets sync notice:', err);
    } finally {
      if (showLoading) setIsLoadingLeaderboard(false);
    }
  }, []);

  // Refresh online leaderboard from Supabase
  const refreshLeaderboardOnline = useCallback(async () => {
    // If Google Sheets is configured, prioritize Google Sheets
    if (isGoogleSheetsConfigured()) {
      await syncWithGoogleSheets(true);
      return;
    }

    setIsLoadingLeaderboard(true);
    try {
      if (isSupabaseConfigured()) {
        const res = await fetchOnlineLeaderboard(currentUserRef.current?.id);
        if (res.entries && res.entries.length > 0) {
          let list = [...res.entries];
          if (currentUserRef.current) {
            const cur = currentUserRef.current;
            const idx = list.findIndex(
              (e) => e.id === cur.id || e.name.trim().toLowerCase() === cur.name.trim().toLowerCase()
            );
            if (idx >= 0) {
              list[idx].isCurrentUser = true;
              if (cur.totalPoints > list[idx].totalPoints) {
                list[idx].totalPoints = cur.totalPoints;
                list[idx].correctCount = cur.correctCount;
              }
            } else {
              list.push({
                id: cur.id,
                name: cur.name,
                email: cur.email,
                organization: cur.organization || 'Khối Sáng Tạo STEM',
                totalPoints: cur.totalPoints,
                correctCount: cur.correctCount || 0,
                avatar: cur.avatar || '🌱',
                levelTitle: getLevelTitle(cur.totalPoints),
                lastActive: Date.now(),
                isCurrentUser: true,
              });
            }
            list.sort((a, b) => {
              if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
              return (b.correctCount || 0) - (a.correctCount || 0);
            });
          }
          setLeaderboardEntries(list);
          saveLeaderboard(list);
          return;
        }
      }

      // If Supabase returned empty or error, fallback to local storage
      const local = loadLeaderboard(currentUserRef.current);
      setLeaderboardEntries(local);
    } catch (e) {
      console.error('Failed to fetch online leaderboard', e);
      const local = loadLeaderboard(currentUserRef.current);
      setLeaderboardEntries(local);
    } finally {
      setIsLoadingLeaderboard(false);
    }
  }, [syncWithGoogleSheets]);

  // Periodic polling for real-time Google Sheets updates across multiple devices
  useEffect(() => {
    // Initial sync
    if (isGoogleSheetsConfigured()) {
      syncWithGoogleSheets(false);
    }

    // Auto-poll Google Sheets every 6 seconds so all devices see live changes
    const pollInterval = setInterval(() => {
      if (isGoogleSheetsConfigured()) {
        syncWithGoogleSheets(false);
      }
    }, 6000);

    return () => clearInterval(pollInterval);
  }, [syncWithGoogleSheets]);

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
      // 1. Verification: Award points for both live camera scanning and file uploads (unless reference only)
      const isValidScan = (result.source === 'webcam' || result.source === 'file_upload' || !result.source) && !result.isReferenceOnly;

      // Calculate points strictly according to STEM specification:
      // Hữu cơ -> +1, Tái chế -> +2, Vô cơ -> +3
      let pointsToAward = 0;
      if (isValidScan) {
        if (result.category === 'organic') pointsToAward = 1;
        else if (result.category === 'recyclable') pointsToAward = 2;
        else if (result.category === 'inorganic') pointsToAward = 3;
        else pointsToAward = result.points || 1;
      }

      // Display floating notification
      const displayResult: WasteClassificationResult = {
        ...result,
        points: pointsToAward,
      };
      setActiveNotification(displayResult);

      if (pointsToAward > 0) {
        setRecentPointChange(pointsToAward);
        playPointSound(pointsToAward);
        setTimeout(() => setRecentPointChange(null), 3000);
      }

      if (!isValidScan || pointsToAward <= 0) {
        return;
      }

      // 2. IMMEDIATE OPTIMISTIC LOCAL STATE UPDATE (Ensures points NEVER fail to register)
      let activeUser = currentUser;
      if (!activeUser) {
        activeUser = {
          id: 'user-' + Date.now(),
          name: 'Thí sinh STEM',
          organization: 'Khối Sáng Tạo STEM',
          avatar: '🌱',
          totalPoints: 0,
          correctCount: 0,
          organicCount: 0,
          recyclableCount: 0,
          inorganicCount: 0,
          createdAt: Date.now(),
        };
      }

      const wasPoints = activeUser.totalPoints;
      const newPoints = wasPoints + pointsToAward;
      const newCount = (activeUser.correctCount || 0) + 1;

      const updatedUser: UserProfile = {
        ...activeUser,
        totalPoints: newPoints,
        correctCount: newCount,
        organicCount: (activeUser.organicCount || 0) + (result.category === 'organic' ? 1 : 0),
        recyclableCount: (activeUser.recyclableCount || 0) + (result.category === 'recyclable' ? 1 : 0),
        inorganicCount: (activeUser.inorganicCount || 0) + (result.category === 'inorganic' ? 1 : 0),
      };

      // Update current user in memory and localStorage
      setCurrentUser(updatedUser);
      saveUserProfile(updatedUser);

      if (newPoints >= 20 && wasPoints < 20) {
        playVictorySound();
      }

      // Record to local classification history
      const newRecord: WasteHistoryRecord = {
        ...result,
        points: pointsToAward,
        id: 'record-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        timestamp: Date.now(),
        userName: updatedUser.name,
      };
      setHistory((prev) => {
        const next = [newRecord, ...prev];
        saveHistory(next);
        return next;
      });

      // Update Leaderboard immediately on screen so ranking changes in real-time
      setLeaderboardEntries((prev) => {
        let list = [...prev];
        const existingIdx = list.findIndex(
          (e) => e.id === updatedUser.id || e.name.trim().toLowerCase() === updatedUser.name.trim().toLowerCase()
        );
        const newEntry: LeaderboardEntry = {
          id: updatedUser.id,
          name: updatedUser.name,
          email: updatedUser.email,
          organization: updatedUser.organization || 'Khối Sáng Tạo STEM',
          totalPoints: updatedUser.totalPoints,
          correctCount: updatedUser.correctCount || 0,
          avatar: updatedUser.avatar || '🌱',
          levelTitle: getLevelTitle(updatedUser.totalPoints),
          lastActive: Date.now(),
          isCurrentUser: true,
        };

        if (existingIdx >= 0) {
          list[existingIdx] = newEntry;
        } else {
          list.push(newEntry);
        }

        list.sort((a, b) => {
          if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
          if ((b.correctCount || 0) !== (a.correctCount || 0)) return (b.correctCount || 0) - (a.correctCount || 0);
          return b.lastActive - a.lastActive;
        });

        saveLeaderboard(list);
        return list;
      });

      // 3. BACKGROUND ONLINE SYNC (Google Sheets & Supabase)
      // Google Sheets sync
      if (isGoogleSheetsConfigured()) {
        try {
          const sheetRes = await recordWasteToGoogleSheets({
            playerName: updatedUser.name,
            organization: updatedUser.organization || 'Khối Sáng Tạo STEM',
            avatar: updatedUser.avatar || '🌱',
            itemName: result.itemName,
            category: result.category,
            confidence: result.confidence,
          });

          if (sheetRes.success) {
            setIsGoogleSheetsActive(true);
            syncWithGoogleSheets(false);
          }
        } catch (e) {
          console.warn('Google Sheets background sync notice:', e);
        }
      }

      // Supabase sync
      if (isSupabaseLive) {
        try {
          const onlineRes = await recordClassificationOnline({
            itemName: result.itemName,
            category: result.category,
            points: pointsToAward,
            source: result.source || 'webcam',
            confidence: result.confidence,
            userId: updatedUser.id,
            userName: updatedUser.name,
            organization: updatedUser.organization,
            avatar: updatedUser.avatar,
          });

          if (onlineRes.success && onlineRes.totalPoints !== undefined && onlineRes.totalPoints > newPoints) {
            const confirmedUser: UserProfile = {
              ...updatedUser,
              totalPoints: onlineRes.totalPoints,
              correctCount: onlineRes.correctCount ?? updatedUser.correctCount,
            };
            setCurrentUser(confirmedUser);
            saveUserProfile(confirmedUser);
            refreshLeaderboardOnline();
          }
        } catch (err) {
          console.warn('Supabase background sync notice:', err);
        }
      }
    },
    [currentUser, isSupabaseLive, refreshLeaderboardOnline, syncWithGoogleSheets]
  );

  // Handle user login / switch
  const handleLogin = (profile: UserProfile) => {
    setCurrentUser(profile);
    saveUserProfile(profile);
    setIsLoginModalOpen(false);
    setLeaderboardEntries(loadLeaderboard(profile));
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
        onOpenGoogleSheets={() => setIsGoogleSheetsModalOpen(true)}
        isGoogleSheetsActive={isGoogleSheetsActive || isGoogleSheetsConfigured()}
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
        onOpenGoogleSheets={() => setIsGoogleSheetsModalOpen(true)}
      />

      {/* Google Sheets Setup & Live Database Modal */}
      <GoogleSheetsModal
        isOpen={isGoogleSheetsModalOpen}
        onClose={() => setIsGoogleSheetsModalOpen(false)}
        onConnected={() => {
          setIsGoogleSheetsActive(true);
          syncWithGoogleSheets(true);
        }}
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
          onOpenGoogleSheets={() => setIsGoogleSheetsModalOpen(true)}
          isGoogleSheetsActive={isGoogleSheetsActive || isGoogleSheetsConfigured()}
        />
      )}

      {/* Main Content Dashboard */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Database Online Sync Status Banner */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-slate-900/95 border border-slate-800 shadow-xl text-xs flex-wrap">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-3 w-3 relative ${
                isGoogleSheetsActive || isGoogleSheetsConfigured()
                  ? 'text-emerald-400'
                  : isSupabaseLive
                  ? 'text-cyan-400'
                  : 'text-amber-400'
              }`}
            >
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isGoogleSheetsActive || isGoogleSheetsConfigured()
                    ? 'bg-emerald-400'
                    : isSupabaseLive
                    ? 'bg-cyan-400'
                    : 'bg-amber-400'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-3 w-3 ${
                  isGoogleSheetsActive || isGoogleSheetsConfigured()
                    ? 'bg-emerald-500'
                    : isSupabaseLive
                    ? 'bg-cyan-500'
                    : 'bg-amber-500'
                }`}
              />
            </span>
            <div>
              <div className="font-black text-slate-100 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>
                  {isGoogleSheetsActive || isGoogleSheetsConfigured()
                    ? 'Google Sheets Online Database: Đang lưu điểm & Lịch sử thật'
                    : 'Google Sheets: Chưa kết nối URL Web App Apps Script'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {isGoogleSheetsActive || isGoogleSheetsConfigured()
                  ? 'Dữ liệu được cập nhật tự động giữa nhiều thiết bị, điện thoại và máy tính.'
                  : 'Kết nối Google Sheets để nhiều người chơi cùng chung bảng xếp hạng online.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsGoogleSheetsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/90 hover:bg-emerald-900 border-2 border-emerald-500/60 text-emerald-300 hover:text-white font-black transition-all shadow-md shadow-emerald-950/40 hover:scale-105 active:scale-95 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Cấu Hình Google Sheets</span>
            </button>

            {isGoogleSheetsConfigured() && (
              <button
                onClick={() => syncWithGoogleSheets(true)}
                title="Đồng bộ ngay từ Google Sheets"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white font-bold transition-all cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLeaderboard ? 'animate-spin text-emerald-400' : ''}`} />
                <span className="hidden sm:inline">Đồng bộ</span>
              </button>
            )}

            <button
              onClick={() => setIsSqlModalOpen(true)}
              title="Xem cấu hình SQL Supabase dự phòng"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-slate-200 font-medium transition-all cursor-pointer"
            >
              <Code className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Mã SQL</span>
            </button>

            <button
              onClick={() => setIsLoginModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 hover:text-white font-bold transition-all cursor-pointer"
            >
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span>{currentUser ? currentUser.name : 'Đăng Ký Thí Sinh'}</span>
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
                DỰ ÁN CÔNG NGHỆ MÔI TRƯỜNG &bull; CUỘC THI STEM 2026
              </div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-100 tracking-tight">
                Hệ Thống Phân Loại Rác Thông Minh & Tích Điểm Thưởng
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 max-w-2xl mt-1 leading-relaxed">
                Ứng dụng AI nhận diện rác trực tiếp qua Webcam, lưu điểm trực tiếp vào <strong className="text-emerald-300">Google Sheets Online</strong>. Quy tắc điểm STEM: <span className="text-emerald-400 font-bold">Hữu cơ +1đ</span>, <span className="text-amber-400 font-bold">Tái chế +2đ</span>, <span className="text-orange-400 font-bold">Vô cơ +3đ</span>. Bảng xếp hạng tự động cập nhật từ cao xuống thấp.
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
              onOpenGoogleSheets={() => setIsGoogleSheetsModalOpen(true)}
              isGoogleSheetsActive={isGoogleSheetsActive || isGoogleSheetsConfigured()}
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
