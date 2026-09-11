import React, { useState } from 'react';
import { User, School, Sparkles, CheckCircle2, Trophy, X } from 'lucide-react';
import { UserProfile } from '../types';
import { DEFAULT_AVATARS, getLevelTitle } from '../utils/storage';

interface LoginModalProps {
  isOpen: boolean;
  currentUser: UserProfile | null;
  onClose?: () => void;
  onLogin: (profile: UserProfile) => void;
}

const PRESET_USERS = [
  { name: 'Nguyễn Văn An', org: 'Lớp 11A1 - THPT Chuyên', avatar: '🌱' },
  { name: 'Đội Xanh Sáng Tạo', org: 'CLB Nghiên Cứu STEM', avatar: '🤖' },
  { name: 'Khách Tham Quan', org: 'Gian hàng STEM Tech', avatar: '🌍' },
  { name: 'Thầy/Cô Ban Giám Khảo', org: 'Hội đồng Khoa học STEM', avatar: '🦉' },
];

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  currentUser,
  onClose,
  onLogin,
}) => {
  const [name, setName] = useState(currentUser?.name || '');
  const [organization, setOrganization] = useState(currentUser?.organization || 'Lớp 11A1 - CLB STEM');
  const [selectedAvatar, setSelectedAvatar] = useState(currentUser?.avatar || '🌱');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError('Vui lòng nhập họ tên hoặc tên đội thi của bạn.');
      return;
    }

    const profile: UserProfile = {
      id: currentUser?.id || 'user-' + Date.now(),
      name: cleanName,
      organization: organization.trim() || 'Thí sinh STEM',
      avatar: selectedAvatar,
      totalPoints: currentUser?.totalPoints || 0,
      organicCount: currentUser?.organicCount || 0,
      recyclableCount: currentUser?.recyclableCount || 0,
      inorganicCount: currentUser?.inorganicCount || 0,
      createdAt: currentUser?.createdAt || Date.now(),
    };

    onLogin(profile);
  };

  const handleSelectPreset = (preset: typeof PRESET_USERS[0]) => {
    setName(preset.name);
    setOrganization(preset.org);
    setSelectedAvatar(preset.avatar);
    setError('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        id="login-dialog"
        className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-6 overflow-hidden"
      >
        {/* Glow ambient accent */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-cyan-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Close button if user already exists */}
        {currentUser && onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 via-teal-500/20 to-cyan-500/20 border border-emerald-500/40 mb-3 shadow-lg shadow-emerald-500/10">
            <span className="text-2xl select-none">{selectedAvatar}</span>
          </div>
          <h2 className="text-xl font-extrabold text-slate-100 tracking-tight">
            {currentUser ? 'Cập Nhật Người Dùng / Đội Thi' : 'Đăng Nhập Điểm Danh STEM'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Lưu danh tính để ghi nhận điểm số vào <strong className="text-emerald-400">Bảng Xếp Hạng</strong>
          </p>
        </div>

        {/* Quick presets for live demonstration */}
        <div className="mb-5">
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Chọn nhanh hồ sơ mẫu (Trình chiếu Demo):
          </label>
          <div className="grid grid-cols-2 gap-2">
            {PRESET_USERS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className={`text-left p-2 rounded-xl border text-xs transition-all flex items-center gap-2 ${
                  name === preset.name
                    ? 'border-emerald-500 bg-emerald-950/40 text-emerald-200 font-semibold shadow-sm'
                    : 'border-slate-800 bg-slate-950/50 text-slate-300 hover:bg-slate-800/60 hover:border-slate-700'
                }`}
              >
                <span className="text-base select-none">{preset.avatar}</span>
                <div className="truncate">
                  <div className="truncate font-medium">{preset.name}</div>
                  <div className="text-[10px] text-slate-400 truncate">{preset.org}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-emerald-400" />
              Họ và tên thí sinh / Tên đội thi <span className="text-rose-400">*</span>
            </label>
            <input
              id="input-login-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              placeholder="VD: Trần Minh Khoa hoặc Đội STEM 11A"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
              autoFocus
            />
            {error && <p className="text-xs text-rose-400 mt-1">{error}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <School className="w-3.5 h-3.5 text-teal-400" />
              Lớp / Trường / Đơn vị tham dự
            </label>
            <input
              id="input-login-org"
              type="text"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              placeholder="VD: Lớp 11A1 - THPT Chuyên hoặc CLB STEM"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
            />
          </div>

          {/* Avatar selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              Chọn biểu tượng đại diện (Mascot):
            </label>
            <div className="flex flex-wrap gap-2 justify-center py-1 bg-slate-950/60 p-2 rounded-xl border border-slate-800">
              {DEFAULT_AVATARS.map((av) => (
                <button
                  key={av}
                  type="button"
                  onClick={() => setSelectedAvatar(av)}
                  className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${
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

          {/* Submit CTA */}
          <button
            id="btn-login-submit"
            type="submit"
            className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:via-teal-500 hover:to-cyan-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2 transition-all transform active:scale-[0.98]"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Vào Hệ Thống Phân Loại Rác</span>
          </button>
        </form>

        {/* Current status note */}
        {currentUser && (
          <div className="mt-4 pt-3 border-t border-slate-800/80 text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>Điểm hiện tại: <strong className="text-emerald-400">{currentUser.totalPoints} điểm</strong> ({getLevelTitle(currentUser.totalPoints)})</span>
          </div>
        )}
      </div>
    </div>
  );
};
