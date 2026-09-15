import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Upload,
  Camera,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  FileText,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Trash2,
  Info,
  ChevronRight,
  Eye,
} from 'lucide-react';
import { UserProfile, WasteReport } from '../types';
import { submitWasteReport } from '../lib/wasteReportApi';
import { playClickSound, playPointSound } from '../utils/audio';

interface CreateReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onReportCreated: (report: WasteReport) => void;
}

export const CreateReportModal: React.FC<CreateReportModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onReportCreated,
}) => {
  const [imagePreview, setImagePreview] = useState<string>('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [authorName, setAuthorName] = useState(currentUser?.name || 'Người dân cộng đồng');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [moderationError, setModerationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Camera state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (currentUser?.name) {
      setAuthorName(currentUser.name);
    }
  }, [currentUser]);

  // Clean up camera stream when closing
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setModerationError(null);
      setSuccessMessage(null);
    }
  }, [isOpen]);

  const startCamera = async () => {
    setModerationError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      setIsCameraActive(true);
    } catch (err: any) {
      alert('Không thể mở camera thiết bị: ' + (err.message || 'Vui lòng cấp quyền truy cập camera'));
    }
  };

  // Ensure stream is bound to video when camera becomes active
  useEffect(() => {
    if (isCameraActive && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch((err) => console.warn('Video play notice:', err));
    }
  }, [isCameraActive]);

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    if (!video.videoWidth || !video.videoHeight) {
      setModerationError('Camera đang khởi động, vui lòng đợi 1 giây rồi nhấn "Chụp ảnh ngay".');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Check average brightness to prevent black/covered photos
      try {
        const sampleW = Math.min(canvas.width, 160);
        const sampleH = Math.min(canvas.height, 120);
        const sampleCanvas = document.createElement('canvas');
        sampleCanvas.width = sampleW;
        sampleCanvas.height = sampleH;
        const sCtx = sampleCanvas.getContext('2d');
        if (sCtx) {
          sCtx.drawImage(canvas, 0, 0, sampleW, sampleH);
          const imgData = sCtx.getImageData(0, 0, sampleW, sampleH);
          let totalLuma = 0;
          const pixelCount = imgData.data.length / 4;
          for (let i = 0; i < imgData.data.length; i += 4) {
            totalLuma += 0.299 * imgData.data[i] + 0.587 * imgData.data[i + 1] + 0.114 * imgData.data[i + 2];
          }
          const avgLuma = totalLuma / (pixelCount || 1);

          // If average brightness is < 12 (pitch dark)
          if (avgLuma < 12) {
            setModerationError(
              '⚠️ Ảnh chụp bị tối đen hoàn toàn (ống kính bị che hoặc môi trường thiếu sáng). Vui lòng kiểm tra lại camera để chụp rõ bãi rác.'
            );
            return;
          }
        }
      } catch (checkErr) {
        console.warn('Luma check notice:', checkErr);
      }

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setImagePreview(dataUrl);
      stopCamera();
      playClickSound();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn tệp định dạng hình ảnh (JPG, PNG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setImagePreview(result);
      setModerationError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert('Trình duyệt của bạn không hỗ trợ định vị GPS.');
      return;
    }
    setIsLocating(true);
    playClickSound();
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
            { headers: { 'Accept-Language': 'vi' } }
          );
          if (res.ok) {
            const data = await res.json();
            if (data && data.display_name) {
              setLocation(data.display_name);
              setIsLocating(false);
              return;
            }
          }
        } catch (e) {
          console.warn('Reverse geocode error:', e);
        }
        setLocation(`Tọa độ GPS: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        setIsLocating(false);
      },
      (err) => {
        setIsLocating(false);
        alert('Không thể lấy vị trí GPS: ' + (err.message || 'Vui lòng cho phép quyền truy cập vị trí trên trình duyệt/thiết bị.'));
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModerationError(null);
    setSuccessMessage(null);

    if (!imagePreview) {
      setModerationError('Vui lòng cung cấp hình ảnh chụp thực tế tình trạng rác thải.');
      return;
    }

    if (!location.trim()) {
      setModerationError('Vui lòng nhập vị trí / khu vực cụ thể xảy ra tình trạng rác.');
      return;
    }

    const words = description.trim().split(/\s+/).filter(Boolean);
    if (words.length < 15) {
      setModerationError(
        `Nội dung mô tả chưa đạt độ dài yêu cầu (${words.length}/15 từ). Quy định yêu cầu bài phản ánh phải có trên 15 từ để tránh bài đăng rác và spam.`
      );
      return;
    }

    setIsSubmitting(true);
    playClickSound();

    try {
      const result = await submitWasteReport({
        image: imagePreview,
        location: location.trim(),
        description: description.trim(),
        authorName: authorName.trim() || 'Người dân cộng đồng',
        authorAvatar: currentUser?.avatar || '🌱',
        authorOrg: currentUser?.organization || 'Cộng đồng EcoSort',
        authorId: currentUser?.id || 'citizen-' + Date.now(),
      });

      if (!result.approved || !result.success) {
        // Rejected by moderation
        setModerationError(
          result.rejectionReason ||
            result.error ||
            'Bài đăng không đạt kiểm duyệt do hình ảnh không có rác hoặc nội dung vi phạm chuẩn mực văn minh.'
        );
      } else if (result.report) {
        // Approved and published!
        playPointSound(3);
        setSuccessMessage('Bài phản ánh đã vượt qua kiểm duyệt AI xuất sắc và đã được hiển thị công khai!');
        onReportCreated(result.report);
        setTimeout(() => {
          onClose();
        }, 1800);
      }
    } catch (err: any) {
      setModerationError('Lỗi kết nối kiểm duyệt: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
      <div
        id="modal-create-waste-report"
        className="relative w-full max-w-2xl my-8 bg-slate-900 border-2 border-emerald-500/40 rounded-3xl shadow-2xl shadow-emerald-950/60 overflow-hidden text-slate-100 flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 shadow-md">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-100 flex items-center gap-2">
                Đăng Bài Phản Ánh Rác Thải
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  Kiểm Duyệt AI
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Chỉ những bài có ảnh rác thải thật và nội dung văn minh mới được duyệt công khai.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              playClickSound();
              onClose();
            }}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {/* AI Moderation Policy Banner */}
          <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-200 flex items-start gap-3 shadow-inner">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed space-y-1.5 w-full">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <p className="font-bold text-emerald-300 flex items-center gap-1.5">
                  Quy chuẩn kiểm duyệt tự động & Chống tin giả mạo (AI Guard):
                </p>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Gemini 3.8 Flash Vision
                </span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-slate-300 text-[11px] sm:text-xs">
                <li>
                  <strong className="text-emerald-300">Nhận diện & Chống ảnh AI giả mạo:</strong> Bắt buộc là ảnh chụp thực tế bằng camera. Hệ thống tự động quét và từ chối ảnh do AI tạo ra (Midjourney, DALL-E, Deepfake, CGI) để chống tin giả.
                </li>
                <li>
                  <strong className="text-emerald-300">Nội dung mô tả trên 15 từ:</strong> Phải mô tả chi tiết trên 15 từ về tình trạng, loại rác, mức độ ô nhiễm để ngăn chặn bài đăng rác/spam vô nghĩa.
                </li>
                <li>
                  <strong className="text-emerald-300">Chuẩn mực cộng đồng:</strong> Tự động từ chối từ ngữ thô tục, chửi thề, vu khống hoặc mang tính bôi nhọ.
                </li>
              </ul>
            </div>
          </div>

          {/* 1. Image Upload / Camera */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-emerald-400" />
                1. Hình ảnh chụp thực tế bãi rác <span className="text-rose-400">*</span>
              </label>
              <span className="text-[10px] font-semibold text-emerald-400/90 flex items-center gap-1 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                <ShieldCheck className="w-3 h-3" />
                Quét phát hiện ảnh AI (Chống tin giả)
              </span>
            </div>

            {/* Camera Viewfinder if active */}
            {isCameraActive ? (
              <div className="relative rounded-2xl overflow-hidden bg-black border-2 border-emerald-400 aspect-video flex flex-col items-center justify-center">
                <video
                  ref={(el) => {
                    videoRef.current = el;
                    if (el && streamRef.current && el.srcObject !== streamRef.current) {
                      el.srcObject = streamRef.current;
                      el.play().catch((e) => console.warn('Camera play error:', e));
                    }
                  }}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {/* Viewfinder crosshairs */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-24 h-24 border border-emerald-400/40 rounded-xl" />
                </div>
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-slate-950/80 border border-emerald-500/50 text-[10px] font-bold text-emerald-300 flex items-center gap-1.5 backdrop-blur-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Camera đang hoạt động
                </div>
                <div className="absolute bottom-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={capturePhoto}
                    className="px-5 py-2.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg flex items-center gap-2 active:scale-95"
                  >
                    <Camera className="w-4 h-4" />
                    Chụp ảnh ngay
                  </button>
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="px-4 py-2.5 rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-200 font-bold text-xs"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            ) : imagePreview ? (
              <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-500/50 bg-slate-950 group">
                <img
                  src={imagePreview}
                  alt="Ảnh rác thải phản ánh"
                  className="w-full max-h-64 object-cover rounded-xl"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute top-2 right-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setImagePreview('')}
                    className="p-2 rounded-xl bg-slate-950/80 hover:bg-rose-950 text-slate-300 hover:text-rose-400 border border-slate-700 transition-all shadow-md"
                    title="Xóa và chọn ảnh khác"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-2.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between text-xs text-slate-300">
                  <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Đã tải ảnh lên thành công
                  </span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-slate-400 hover:text-white underline text-[11px]"
                  >
                    Chọn ảnh khác
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={startCamera}
                  className="p-5 rounded-2xl border-2 border-dashed border-slate-700 hover:border-emerald-400/80 bg-slate-950/60 hover:bg-slate-850 text-slate-300 hover:text-white flex flex-col items-center justify-center gap-2 transition-all active:scale-[0.98]"
                >
                  <div className="p-3 rounded-full bg-emerald-500/10 text-emerald-400">
                    <Camera className="w-6 h-6" />
                  </div>
                  <span className="font-bold text-xs">Chụp ảnh từ Camera</span>
                  <span className="text-[11px] text-slate-400">Chụp thực tế tại hiện trường</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-5 rounded-2xl border-2 border-dashed border-slate-700 hover:border-teal-400/80 bg-slate-950/60 hover:bg-slate-850 text-slate-300 hover:text-white flex flex-col items-center justify-center gap-2 transition-all active:scale-[0.98]"
                >
                  <div className="p-3 rounded-full bg-teal-500/10 text-teal-400">
                    <Upload className="w-6 h-6" />
                  </div>
                  <span className="font-bold text-xs">Tải ảnh từ máy tính / điện thoại</span>
                  <span className="text-[11px] text-slate-400">Hỗ trợ JPG, PNG, WebP</span>
                </button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* 2. Location Input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-amber-400" />
                2. Khu vực xảy ra tình trạng rác thải <span className="text-rose-400">*</span>
              </label>
              <button
                type="button"
                onClick={handleGetLocation}
                disabled={isLocating}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold transition-all active:scale-95 disabled:opacity-50"
                title="Lấy vị trí GPS thực tế hiện tại"
              >
                {isLocating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    <span>Đang định vị...</span>
                  </>
                ) : (
                  <>
                    <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                    <span>📍 Lấy vị trí thực tế (GPS)</span>
                  </>
                )}
              </button>
            </div>
            <input
              type="text"
              required
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Ví dụ: Hẻm 45 Lê Văn Sỹ, Phường 13, Quận Phú Nhuận, TP.HCM"
              className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 text-slate-100 text-xs sm:text-sm outline-none transition-all placeholder:text-slate-500"
            />
            {/* Quick area suggestions */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-[11px] text-slate-400 self-center">Gợi ý nhanh:</span>
              {['Vỉa hè khu dân cư', 'Cổng trường học', 'Bờ kênh / Sông', 'Bãi đất trống', 'Gần chợ dân sinh'].map(
                (chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setLocation((prev) => (prev ? `${prev}, ${chip}` : chip))}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all"
                  >
                    +{chip}
                  </button>
                )
              )}
            </div>
          </div>

          {/* 3. Description Input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-cyan-400" />
                3. Nội dung mô tả chi tiết <span className="text-rose-400">*</span>
              </label>
              {(() => {
                const wordCount = description.trim() ? description.trim().split(/\s+/).filter(Boolean).length : 0;
                return (
                  <span
                    className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-lg border transition-all ${
                      wordCount >= 15
                        ? 'text-emerald-300 bg-emerald-950/80 border-emerald-500/50'
                        : 'text-amber-300 bg-amber-950/80 border-amber-500/50'
                    }`}
                  >
                    {wordCount}/15 từ {wordCount >= 15 ? '✓ Đạt chuẩn' : '(cần trên 15 từ)'}
                  </span>
                );
              })()}
            </div>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mô tả cụ thể: Rác thải gì? Tồn đọng bao lâu? Có mùi hôi, gây cản trở giao thông hoặc ô nhiễm nguồn nước không?..."
              className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 text-slate-100 text-xs sm:text-sm outline-none transition-all placeholder:text-slate-500 resize-none leading-relaxed"
            />
            {/* Dynamic word count helper */}
            {(() => {
              const wordCount = description.trim() ? description.trim().split(/\s+/).filter(Boolean).length : 0;
              if (wordCount === 0) {
                return (
                  <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
                    <span className="text-amber-400">ℹ️</span> Yêu cầu trên 15 từ để tránh bài đăng rác/spam và giúp lực lượng chức năng nắm rõ tình trạng hiện trường.
                  </p>
                );
              }
              if (wordCount < 15) {
                return (
                  <p className="text-[11px] text-amber-300/90 mt-1.5 flex items-center gap-1 font-medium">
                    <span>⚠️</span> Còn thiếu {15 - wordCount} từ nữa để đạt quy chuẩn bài phản ánh chất lượng.
                  </p>
                );
              }
              return (
                <p className="text-[11px] text-emerald-400 mt-1.5 flex items-center gap-1 font-medium">
                  <span>✓</span> Độ dài bài viết đạt chuẩn ({wordCount} từ) - Đủ điều kiện gửi phản ánh.
                </p>
              );
            })()}
          </div>

          {/* 4. Reporter Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5">Họ tên người phản ánh:</label>
              <input
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-200"
                placeholder="Tên công dân hoặc Thí sinh STEM"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5">Đơn vị / Chi đội / Lớp:</label>
              <input
                type="text"
                disabled
                value={currentUser?.organization || 'Cộng đồng Xanh EcoSort'}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 cursor-not-allowed"
              />
            </div>
          </div>

          {/* Rejection / Failure Banner */}
          {moderationError && (
            <div className="p-4 rounded-2xl bg-rose-950/70 border-2 border-rose-500 text-rose-200 text-xs space-y-2 animate-shake shadow-lg shadow-rose-950/50">
              <div className="flex items-center gap-2 font-black text-rose-300 text-sm">
                <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
                KHÔNG ĐẠT KIỂM DUYỆT - BÀI VIẾT BỊ TỪ CHỐI
              </div>
              <div className="bg-slate-950/60 p-3 rounded-xl border border-rose-500/30 text-slate-200 font-medium leading-relaxed">
                {moderationError}
              </div>
              <p className="text-[11px] text-rose-300/90">
                💡 <strong>Gợi ý khắc phục:</strong> Vui lòng đổi sang ảnh chụp bãi rác thực tế hoặc sửa lại nội dung văn bản cho lịch sự, văn minh rồi bấm gửi lại.
              </p>
            </div>
          )}

          {/* Success Banner */}
          {successMessage && (
            <div className="p-4 rounded-2xl bg-emerald-950/80 border-2 border-emerald-400 text-emerald-200 text-xs space-y-1.5 shadow-lg shadow-emerald-950/50">
              <div className="flex items-center gap-2 font-black text-emerald-300 text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                KIỂM DUYỆT THÀNH CÔNG!
              </div>
              <p className="text-slate-200 font-medium">{successMessage}</p>
            </div>
          )}

          {/* Footer Submit Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                playClickSound();
                onClose();
              }}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            >
              Hủy bỏ
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-6 py-3 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition-all shadow-lg active:scale-95 ${
                isSubmitting
                  ? 'bg-slate-800 text-slate-400 cursor-wait'
                  : 'bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 shadow-emerald-500/25 hover:shadow-emerald-500/40'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>AI đang kiểm duyệt hình ảnh & ngôn từ...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 text-slate-950" />
                  <span>Gửi Phản Ánh & Kiểm Duyệt AI</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
