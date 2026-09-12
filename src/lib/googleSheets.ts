import { LeaderboardEntry, UserProfile, WasteCategory, WasteHistoryRecord } from '../types';
import { getLevelTitle } from '../utils/storage';

// Local storage key for custom Google Script URL
const GS_STORAGE_KEY = 'ecosort_google_sheets_url';

// Check environment variables safely
const metaEnv = (import.meta as unknown as { env?: Record<string, string> }).env || {};
const ENV_SHEETS_URL = metaEnv.VITE_GOOGLE_SHEETS_SCRIPT_URL || '';

export function getGoogleSheetsUrl(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(GS_STORAGE_KEY);
    if (saved && saved.trim()) return saved.trim();
  }
  return ENV_SHEETS_URL.trim();
}

export function setGoogleSheetsUrl(url: string): void {
  if (typeof window !== 'undefined') {
    if (!url || !url.trim()) {
      localStorage.removeItem(GS_STORAGE_KEY);
    } else {
      localStorage.setItem(GS_STORAGE_KEY, url.trim());
    }
  }
}

export function isGoogleSheetsConfigured(): boolean {
  const url = getGoogleSheetsUrl();
  return Boolean(url && url.startsWith('http') && url.includes('script.google.com'));
}

export interface GoogleSheetsResponse {
  status: 'success' | 'error';
  message?: string;
  sheetTitle?: string;
  sheetId?: string;
  players?: Array<{
    id: string;
    name: string;
    organization: string;
    avatar: string;
    totalPoints: number;
    correctCount: number;
    organicCount?: number;
    recyclableCount?: number;
    inorganicCount?: number;
    lastActive?: number;
  }>;
  history?: Array<{
    id: string;
    timestamp: number;
    userName: string;
    itemName: string;
    category: WasteCategory;
    points: number;
    source: string;
    confidence: number;
  }>;
  player?: any;
  leaderboard?: any[];
  awardedPoints?: number;
}

/**
 * Fetch latest leaderboard and classification history from Google Sheets
 */
export async function fetchGoogleSheetsData(): Promise<{
  success: boolean;
  players: LeaderboardEntry[];
  history: WasteHistoryRecord[];
  error?: string;
  sheetTitle?: string;
}> {
  const scriptUrl = getGoogleSheetsUrl();

  // Try via backend proxy first to avoid any CORS/redirect issues
  try {
    const proxyRes = await fetch('/api/sheets/data');
    if (proxyRes.ok) {
      const data: GoogleSheetsResponse = await proxyRes.json();
      if (data.status === 'success' && data.players) {
        return processSheetsData(data);
      }
    }
  } catch {
    // If backend proxy didn't return, fallback to direct fetch
  }

  if (!scriptUrl) {
    return {
      success: false,
      players: [],
      history: [],
      error: 'Chưa cấu hình URL Google Apps Script Web App.',
    };
  }

  try {
    const res = await fetch(scriptUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Google Sheets HTTP Error: ${res.status}`);
    }

    const data: GoogleSheetsResponse = await res.json();
    if (data.status === 'success') {
      return processSheetsData(data);
    } else {
      return {
        success: false,
        players: [],
        history: [],
        error: data.message || 'Lỗi dữ liệu từ Google Sheets',
      };
    }
  } catch (err: any) {
    console.warn('Direct fetch from Google Sheets failed:', err);
    return {
      success: false,
      players: [],
      history: [],
      error: err.message || 'Không thể kết nối đến Google Sheets Web App',
    };
  }
}

function processSheetsData(data: GoogleSheetsResponse) {
  const rawPlayers = data.players || [];
  const rawHistory = data.history || [];

  const players: LeaderboardEntry[] = rawPlayers.map((p, idx) => ({
    id: p.id || `sheet-player-${idx}`,
    name: p.name,
    organization: p.organization || 'Khối Sáng Tạo STEM',
    avatar: p.avatar || '🌱',
    totalPoints: Number(p.totalPoints) || 0,
    correctCount: Number(p.correctCount) || 0,
    organicCount: Number(p.organicCount) || 0,
    recyclableCount: Number(p.recyclableCount) || 0,
    inorganicCount: Number(p.inorganicCount) || 0,
    levelTitle: getLevelTitle(Number(p.totalPoints) || 0),
    lastActive: p.lastActive || Date.now(),
  }));

  // Ensure sorted by total points descending, then correctCount descending
  players.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    return b.correctCount - a.correctCount;
  });

  const history: WasteHistoryRecord[] = rawHistory.map((h, idx) => ({
    id: h.id || `sheet-scan-${idx}`,
    timestamp: h.timestamp || Date.now(),
    userName: h.userName || 'Thí sinh',
    itemName: h.itemName,
    category: (h.category as WasteCategory) || 'organic',
    points: Number(h.points) || 1,
    source: (h.source as any) || 'webcam',
    confidence: Number(h.confidence) || 0.95,
    description: `Phân loại rác ${h.category}`,
    binColor: h.category === 'organic' ? 'green' : h.category === 'recyclable' ? 'yellow' : 'orange',
    recyclingTip: 'Bỏ rác đúng thùng quy định.',
  }));

  return {
    success: true,
    players,
    history,
    sheetTitle: data.sheetTitle,
  };
}

/**
 * Record a new waste classification to Google Sheets
 * STEM Point Rules:
 * Organic -> +1 point
 * Recyclable -> +2 points
 * Inorganic -> +3 points
 */
export async function recordWasteToGoogleSheets(payload: {
  playerName: string;
  organization: string;
  avatar: string;
  itemName: string;
  category: WasteCategory;
  confidence?: number;
}): Promise<{
  success: boolean;
  awardedPoints?: number;
  updatedPlayer?: UserProfile;
  leaderboard?: LeaderboardEntry[];
  error?: string;
}> {
  const points = payload.category === 'organic' ? 1 : payload.category === 'recyclable' ? 2 : 3;

  const bodyData = {
    action: 'recordWaste',
    playerName: payload.playerName,
    organization: payload.organization,
    avatar: payload.avatar,
    itemName: payload.itemName,
    category: payload.category,
    points: points,
    source: 'webcam',
    confidence: payload.confidence || 0.95,
  };

  // 1. Try server-side proxy route first
  try {
    const proxyRes = await fetch('/api/sheets/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyData),
    });

    if (proxyRes.ok) {
      const result = await proxyRes.json();
      if (result.status === 'success' || result.success) {
        return {
          success: true,
          awardedPoints: result.awardedPoints || points,
          updatedPlayer: result.player,
        };
      }
    }
  } catch {
    // If proxy failed, fall through to direct fetch
  }

  // 2. Direct fetch to Google Apps Script
  const scriptUrl = getGoogleSheetsUrl();
  if (!scriptUrl) {
    return {
      success: false,
      error: 'Chưa cấu hình Google Apps Script URL',
    };
  }

  try {
    const res = await fetch(scriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(bodyData),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data: GoogleSheetsResponse = await res.json();
    if (data.status === 'success') {
      return {
        success: true,
        awardedPoints: data.awardedPoints || points,
        updatedPlayer: data.player,
      };
    } else {
      return {
        success: false,
        error: data.message || 'Lỗi gửi điểm đến Google Sheets',
      };
    }
  } catch (err: any) {
    console.error('Error posting score to Google Sheets:', err);
    return {
      success: false,
      error: err.message || 'Không thể gửi dữ liệu lên Google Sheets',
    };
  }
}

/**
 * Register a new player into Google Sheets with 0 points
 */
export async function registerPlayerToGoogleSheets(payload: {
  playerName: string;
  organization: string;
  avatar: string;
}): Promise<{
  success: boolean;
  player?: UserProfile;
  error?: string;
}> {
  const bodyData = {
    action: 'registerPlayer',
    playerName: payload.playerName,
    organization: payload.organization,
    avatar: payload.avatar,
  };

  try {
    const proxyRes = await fetch('/api/sheets/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyData),
    });

    if (proxyRes.ok) {
      const result = await proxyRes.json();
      if (result.status === 'success' || result.success) {
        return {
          success: true,
          player: result.player,
        };
      }
    }
  } catch {
    // fall through
  }

  const scriptUrl = getGoogleSheetsUrl();
  if (!scriptUrl) {
    return { success: false, error: 'Chưa cấu hình URL' };
  }

  try {
    const res = await fetch(scriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(bodyData),
    });

    const data: GoogleSheetsResponse = await res.json();
    return {
      success: data.status === 'success',
      player: data.player,
      error: data.message,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Lỗi đăng ký người chơi vào Google Sheets',
    };
  }
}

/**
 * Test connection to Google Apps Script
 */
export async function testGoogleSheetsConnection(urlToTest?: string): Promise<{
  success: boolean;
  message: string;
  sheetTitle?: string;
  totalPlayers?: number;
}> {
  const targetUrl = urlToTest?.trim() || getGoogleSheetsUrl();
  if (!targetUrl) {
    return {
      success: false,
      message: 'Vui lòng nhập URL Web App của Google Apps Script!',
    };
  }

  if (!targetUrl.startsWith('https://script.google.com/')) {
    return {
      success: false,
      message: 'URL không hợp lệ! URL phải bắt đầu bằng https://script.google.com/macros/s/.../exec',
    };
  }

  try {
    // Test via backend proxy test endpoint
    const proxyRes = await fetch('/api/sheets/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl }),
    });

    if (proxyRes.ok) {
      const resData = await proxyRes.json();
      if (resData.success) {
        return {
          success: true,
          message: `Kết nối thành công tới trang tính: "${resData.sheetTitle || 'Google Sheets'}"!`,
          sheetTitle: resData.sheetTitle,
          totalPlayers: resData.totalPlayers,
        };
      } else {
        return {
          success: false,
          message: resData.error || 'Không nhận được dữ liệu hợp lệ từ Google Sheets.',
        };
      }
    }

    // Direct test fallback
    const directRes = await fetch(targetUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!directRes.ok) {
      return {
        success: false,
        message: `Google Sheets trả về lỗi HTTP ${directRes.status}. Vui lòng kiểm tra quyền "Ai có quyền truy cập: Bất kỳ ai" (Anyone).`,
      };
    }

    const data = await directRes.json();
    if (data.status === 'success') {
      return {
        success: true,
        message: `Kết nối thành công tới trang tính "${data.sheetTitle || 'Google Sheets'}"!`,
        sheetTitle: data.sheetTitle,
        totalPlayers: data.players ? data.players.length : 0,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Apps Script trả về lỗi.',
      };
    }
  } catch (err: any) {
    return {
      success: false,
      message: `Không thể kết nối (${err.message}). Hãy chắc chắn bạn đã chọn "Execute as: Me" và "Who has access: Anyone" khi Deploy Web App.`,
    };
  }
}
