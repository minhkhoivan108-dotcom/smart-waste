import React, { useState } from 'react';
import {
  User,
  School,
  Sparkles,
  CheckCircle2,
  Trophy,
  X,
  Mail,
  Lock,
  LogIn,
  UserPlus,
  LogOut,
  Database,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { UserProfile } from '../types';
import { DEFAULT_AVATARS, getLevelTitle } from '../utils/storage';
import {
  isSupabaseConfigured,
  signInWithSupabase,
  signUpWithSupabase,
  signOutSupabase
} from '../lib/supabase';
import { playClickSound } from '../utils/audio';

interface LoginModalProps {
  isOpen: boolean;
  currentUser: UserProfile | null;
  onClose?: () => void;
  onLogin: (profile: UserProfile) => void;
  onLogout?: () => void;
  onOpenSqlGuide?: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  currentUser,
  onClose,
  onLogin,
  onLogout,
  onOpenSqlGuide,
}) => {
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [organization, setOrganization] = useState('Lớp 11A1 - CLB STEM');
  const [selectedAvatar, setSelectedAvatar] = useState('🌱');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const supabaseReady = isSupabaseConfigured();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    playClickSound();

    if (!email.trim() || !email.includes('@')) {
      setError('Vui lòng nhập địa chỉ email hợp lệ.');
      return;
    }

    if (!password || password.length < 6) {
      setError('Mật khẩu cần tối thiểu 6 ký tự.');
      return;
    }

    if (authMode === 'signup' && !username.trim()) {
      setError('Vui lòng nhập tên người dùng / tên đội thi.');
      return;
    }

    setLoading(true);

    if (supabaseReady) {
      // 1. ONLINE AUTHENTICATION VIA SUPABASE
      if (authMode === 'signup') {
        const { user, error: authErr } = await signUpWithSupabase(
          email,
          password,
          username,
          organization,
          selectedAvatar
        );

        setLoading(false);

        if (authErr) {
          setError(authErr);
          return;
        }

        if (user) {
          setSuccessMsg('Đăng ký tài khoản thành công! Điểm khởi tạo: 0 điểm.');
          setTimeout(() => {
            onLogin(user);
          }, 800);
        }
      } else {
        const { user, error: authErr } = await signInWithSupabase(email, password);
        setLoading(false);

        if (authErr) {
          setError(authErr);
          return;
        }

        if (user) {
          setSuccessMsg(`Chào mừng trở lại, ${user.name}!`);
          setTimeout(() => {
            onLogin(user);
          }, 600);
        }
      }
    } else {
      // 2. FALLBACK MODE: When user has not yet put SUPABASE_URL in settings
      // Still maintains user profile with 0 points upon registration
      setTimeout(() => {
        setLoading(false);
        const nameToUse = authMode === 'signup' ? username.trim() : email.split('@')[0];
        const profile: UserProfile = {
          id: 'user-' + Date.now(),
          name: nameToUse,
          email: email.trim(),
          organization: organization.trim() || 'Khối Sáng Tạo STEM',
          avatar: selectedAvatar,
          totalPoints: 0, // Đăng ký mới luôn là 0 điểm
          correctCount: 0,
          organicCount: 0,
          recyclableCount: 0,
          inorganicCount: 0,
          createdAt: Date.now(),
        };
        onLogin(profile);
      }, 500);
    }
  };

  const handleSignOut = async () => {
    playClickSound();
    setLoading(true);
    if (supabaseReady) {
      await signOutSupabase();
    }
    setLoading(false);
    if (onLogout) {
      onLogout();
    }
    if (onClose) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        id="login-dialog"
        className="relative w-full max-w-md bg-slate-900 border-2 border-slate-700/80 rounded-2xl shadow-2xl p-6 overflow-hidden max-h-[90vh] overflow-y-auto"
      >
        {/* Glow ambient accent */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-teal-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Close button */}
        {onClose && (
          <button
            onClick={() => {
              playClickSound();
              onClose();
            }}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Header */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 via-teal-500/20 to-cyan-500/20 border-2 border-emerald-500/40 mb-3 shadow-lg shadow-emerald-500/10">
            <span className="text-2xl select-none">{currentUser ? currentUser.avatar : selectedAvatar}</span>
          </div>
          <h2 className="text-lg font-black text-slate-100 tracking-tight">
            {currentUser ? 'Hồ Sơ Người Chơi STEM' : 'Supabase Authentication'}
          </h2>
          <div className="flex items-center justify-center gap-2 mt-1.5 flex-wrap">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                supabaseReady
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              }`}
            >
              <Database className="w-3 h-3" />
              {supabaseReady ? 'Database Online: Đã kết nối Supabase' : 'Chưa cấu hình Supabase URL'}
            </span>

            {onOpenSqlGuide && (
              <button
                type="button"
                onClick={onOpenSqlGuide}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 underline font-semibold cursor-pointer"
              >
                Xem lệnh SQL
              </button>
            )}
          </div>
        </div>

        {/* Current user active card if logged in */}
        {currentUser ? (
          <div className="space-y-4">
            <div className="p-4 bg-slate-950/80 border-2 border-slate-800 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Tên tài khoản:</span>
                <span className="text-sm font-bold text-slate-100">{currentUser.name}</span>
              </div>
              {currentUser.email && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-medium">Email:</span>
                  <span className="text-xs font-mono text-slate-300">{currentUser.email}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Đơn vị:</span>
                <span className="text-xs text-slate-300">{currentUser.organization}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <span className="text-xs text-slate-400 font-medium">Tổng điểm tích lũy:</span>
                <span className="text-base font-black text-amber-400">{currentUser.totalPoints} điểm</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Số lần phân loại đúng:</span>
                <span className="text-sm font-bold text-emerald-400">{currentUser.correctCount || 0} lần</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSignOut}
                disabled={loading}
                className="flex-1 py-2.5 px-3 bg-rose-950/80 hover:bg-rose-900 border-2 border-rose-500/50 text-rose-300 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Đăng Xuất Tài Khoản</span>
              </button>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Đóng
                </button>
              )}
            </div>
          </div>
        ) : (
          <div>
            {/* Tab switch: Sign In vs Sign Up */}
            <div className="grid grid-cols-2 p-1 bg-slate-950 border border-slate-800 rounded-xl mb-4">
              <button
                type="button"
                onClick={() => {
                  playClickSound();
                  setAuthMode('signin');
                  setError(null);
                }}
                className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  authMode === 'signin'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <LogIn className="w-3.5 h-3.5 text-emerald-400" />
                <span>Đăng Nhập</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  playClickSound();
                  setAuthMode('signup');
                  setError(null);
                }}
                className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  authMode === 'signup'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5 text-teal-400" />
                <span>Đăng Ký Mới</span>
              </button>
            </div>

            {/* Error / Success alert */}
            {error && (
              <div className="p-3 mb-4 rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 mb-4 rounded-xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-400" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {authMode === 'signup' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-emerald-400" />
                    Tên người chơi / Đội thi <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="VD: Nguyễn Văn A hoặc STEM Team 11"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-teal-400" />
                  Email tài khoản <span className="text-rose-400">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="thi-sinh@gmail.com"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-cyan-400" />
                  Mật khẩu <span className="text-rose-400">*</span>
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tối thiểu 6 ký tự"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all"
                />
              </div>

              {authMode === 'signup' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                      <School className="w-3.5 h-3.5 text-amber-400" />
                      Lớp / Chi đội / Đơn vị tham gia
                    </label>
                    <input
                      type="text"
                      value={organization}
                      onChange={(e) => setOrganization(e.target.value)}
                      placeholder="VD: Lớp 10A2 - THPT Chuyên"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all"
                    />
                  </div>

                  {/* Mascot / Avatar selection */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      Chọn biểu tượng Mascot:
                    </label>
                    <div className="flex flex-wrap gap-1.5 justify-center py-1.5 bg-slate-950/80 p-2 rounded-xl border border-slate-800">
                      {DEFAULT_AVATARS.map((av) => (
                        <button
                          key={av}
                          type="button"
                          onClick={() => setSelectedAvatar(av)}
                          className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-all cursor-pointer ${
                            selectedAvatar === av
                              ? 'bg-emerald-500/30 border-2 border-emerald-400 scale-110 shadow-md'
                              : 'hover:bg-slate-800 border border-transparent'
                          }`}
                        >
                          <span className="select-none">{av}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-2.5 px-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:via-teal-500 hover:to-cyan-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition-all transform active:scale-98 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang kết nối cơ sở dữ liệu...</span>
                  </>
                ) : authMode === 'signup' ? (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>Đăng Ký & Khởi Tạo 0 Điểm</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Đăng Nhập Vào Hệ Thống</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-4 pt-3 border-t border-slate-800 text-center">
              <p className="text-[11px] text-slate-400">
                {authMode === 'signup'
                  ? 'Khi đăng ký, tài khoản sẽ được khởi tạo với chính xác 0 điểm trên Database online.'
                  : 'Chỉ nhận điểm thi đua khi quét phân loại rác thực tế bằng webcam.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
