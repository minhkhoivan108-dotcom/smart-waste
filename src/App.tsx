import React, { useState, useEffect, useCallback } from 'react';
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
  loadLeaderboard,
  saveLeaderboard,
  resetLeaderboardToDefaults,
  loadHistory,
  saveHistory,
  clearHistory,
} from './utils/storage';
import { getIsMuted, toggleMute, playVictorySound } from './utils/audio';

import { Navbar } from './components/Navbar';
import { LoginModal } from './components/LoginModal';
import { WebcamScanner } from './components/WebcamScanner';
import { Leaderboard } from './components/Leaderboard';
import { ClassificationHistory } from './components/ClassificationHistory';
import { PointsNotification } from './components/PointsNotification';
import { DuplicateWarningToast } from './components/DuplicateWarningToast';
import { WasteGuideModal } from './components/WasteGuideModal';
import { StemPresentationView } from './components/StemPresentationView';

export default function App() {
  // User Profile
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    return loadUserProfile();
  });
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  // Leaderboard & History
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);
  const [history, setHistory] = useState<WasteHistoryRecord[]>([]);

  // Processing & Notifications
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeNotification, setActiveNotification] = useState<WasteClassificationResult | null>(null);
  const [duplicateAlert, setDuplicateAlert] = useState<DuplicateAlertInfo | null>(null);
  const [recentPointChange, setRecentPointChange] = useState<number | null>(null);


  // Modals & UI States
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(getIsMuted);

  // Initialize data on mount
  useEffect(() => {
    const loadedHistory = loadHistory();
    setHistory(loadedHistory);

    const savedUser = loadUserProfile();
    if (!savedUser) {
      // First turn prompt login or provide default user if user prefers
      setIsLoginModalOpen(true);
    }
    const initialLeaderboard = loadLeaderboard(savedUser);
    setLeaderboardEntries(initialLeaderboard);
  }, []);

  // Update leaderboard whenever currentUser changes
  useEffect(() => {
    if (currentUser) {
      const updated = loadLeaderboard(currentUser);
      setLeaderboardEntries(updated);
    }
  }, [currentUser]);

  // Handle classification result from WebcamScanner
  const handleClassified = useCallback(
    (result: WasteClassificationResult) => {
      // 1. Strict verification: ONLY award points if source is webcam scanning
      const isWebcamScan = result.source === 'webcam' && !result.isReferenceOnly;
      const pointsToAward = isWebcamScan ? result.points : 0;

      // Set active notification toast (with 0 points if reference view)
      const displayResult: WasteClassificationResult = {
        ...result,
        points: pointsToAward,
      };
      setActiveNotification(displayResult);

      if (pointsToAward > 0) {
        setRecentPointChange(pointsToAward);
        setTimeout(() => setRecentPointChange(null), 3000);
      }

      // 2. Only update user score & counts if scanned via webcam
      let updatedUser: UserProfile;
      if (currentUser) {
        const wasPoints = currentUser.totalPoints;
        const newPoints = wasPoints + pointsToAward;

        updatedUser = {
          ...currentUser,
          totalPoints: newPoints,
          organicCount: currentUser.organicCount + (isWebcamScan && result.category === 'organic' ? 1 : 0),
          recyclableCount: currentUser.recyclableCount + (isWebcamScan && result.category === 'recyclable' ? 1 : 0),
          inorganicCount: currentUser.inorganicCount + (isWebcamScan && result.category === 'inorganic' ? 1 : 0),
        };

        // Check if user reached new high milestone
        if (isWebcamScan) {
          if (newPoints >= 20 && wasPoints < 20) {
            playVictorySound();
          } else if (newPoints >= 35 && wasPoints < 35) {
            playVictorySound();
          } else if (newPoints >= 50 && wasPoints < 50) {
            playVictorySound();
          }
        }
      } else {
        // Fallback user if not yet registered
        updatedUser = {
          id: 'user-guest-' + Date.now(),
          name: 'Thí sinh Khách',
          organization: 'Khối Sáng Tạo STEM',
          avatar: '🌱',
          totalPoints: pointsToAward,
          organicCount: isWebcamScan && result.category === 'organic' ? 1 : 0,
          recyclableCount: isWebcamScan && result.category === 'recyclable' ? 1 : 0,
          inorganicCount: isWebcamScan && result.category === 'inorganic' ? 1 : 0,
          createdAt: Date.now(),
        };
      }

      if (isWebcamScan) {
        setCurrentUser(updatedUser);
        saveUserProfile(updatedUser);

        // 3. Update leaderboard ONLY when webcam scan awards points
        const updatedLeaderboard = loadLeaderboard(updatedUser);
        setLeaderboardEntries(updatedLeaderboard);
        saveLeaderboard(updatedLeaderboard);

        // 4. Add to history
        const newRecord: WasteHistoryRecord = {
          ...result,
          points: pointsToAward,
          id: 'record-' + Date.now(),
          timestamp: Date.now(),
          userName: updatedUser.name,
        };

        setHistory((prev) => {
          const next = [newRecord, ...prev];
          saveHistory(next);
          return next;
        });
      }
    },
    [currentUser]
  );

  // Handle user login / switch
  const handleLogin = (profile: UserProfile) => {
    setCurrentUser(profile);
    saveUserProfile(profile);
    const updatedLeaderboard = loadLeaderboard(profile);
    setLeaderboardEntries(updatedLeaderboard);
    saveLeaderboard(updatedLeaderboard);
    setIsLoginModalOpen(false);
  };

  // Reset leaderboard
  const handleResetLeaderboard = () => {
    if (window.confirm('Bạn có chắc chắn muốn đặt lại bảng xếp hạng về danh sách mặc định?')) {
      const reset = resetLeaderboardToDefaults(currentUser);
      setLeaderboardEntries(reset);
    }
  };

  // Clear history
  const handleClearHistory = () => {
    if (window.confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử phân loại rác?')) {
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

      {/* Login / Switch User Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        currentUser={currentUser}
        onClose={currentUser ? () => setIsLoginModalOpen(false) : undefined}
        onLogin={handleLogin}
      />

      {/* STEM Waste Guide Modal */}
      <WasteGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
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
          onResetLeaderboard={handleResetLeaderboard}
          onAddNewUser={() => setIsLoginModalOpen(true)}
          onExitFullscreen={() => setIsFullscreen(false)}
          onDuplicateDetected={handleDuplicateDetected}
          onOpenGuide={() => setIsGuideOpen(true)}
        />
      )}

      {/* Main Content Dashboard */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
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
                Ứng dụng thị giác máy tính AI phân loại tự động 3 dòng rác: <strong className="text-emerald-400">Hữu cơ (+1đ)</strong>, <strong className="text-amber-400">Tái chế (+2đ)</strong>, và <strong className="text-orange-400">Vô cơ (+3đ)</strong> để tích lũy điểm vào Bảng Xếp Hạng.
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
                    {currentUser.name} ({currentUser.organization})
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
              onResetLeaderboard={handleResetLeaderboard}
              onAddNewUser={() => setIsLoginModalOpen(true)}
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
            <strong className="text-slate-400">EcoSort AI STEM</strong> &bull; Giải pháp Công nghệ xanh cho Trường học thông minh
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Rác Hữu cơ: +1đ</span>
            <span>&bull;</span>
            <span>Rác Tái chế: +2đ</span>
            <span>&bull;</span>
            <span>Rác Vô cơ: +3đ</span>
          </div>
          <div>
            Bản quyền nghiên cứu cuộc thi STEM 2026
          </div>
        </div>
      </footer>
    </div>
  );
}
