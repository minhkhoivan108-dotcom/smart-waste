import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

export interface StoredPlayer {
  id: string;
  name: string;
  email: string;
  organization: string;
  avatar: string;
  totalPoints: number;
  correctCount: number;
  organicCount: number;
  recyclableCount: number;
  inorganicCount: number;
  lastActive: number;
  createdAt: number;
}

export interface StoredHistoryItem {
  id: string;
  userId: string;
  userName: string;
  itemName: string;
  category: 'organic' | 'recyclable' | 'inorganic';
  points: number;
  confidence: number;
  source: string;
  timestamp: number;
}

export interface StoredWasteReport {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorOrg?: string;
  location: string;
  description: string;
  imageUrl: string;
  wasteTypeDetected: string;
  severityLevel: 'low' | 'medium' | 'high' | 'urgent';
  moderationStatus: 'approved' | 'rejected';
  moderationDetails: {
    approved: boolean;
    imageCheckPassed: boolean;
    textCheckPassed: boolean;
    isAIGenerated?: boolean;
    aiAuthenticityPassed?: boolean;
    rejectionReason?: string;
    wasteTypeDetected?: string;
    severityLevel?: 'low' | 'medium' | 'high' | 'urgent';
    summary?: string;
    checkedAt: number;
    moderatedBy: string;
  };
  status: 'reported' | 'investigating' | 'resolved';
  createdAt: number;
  upvotes: number;
  resolutionNote?: string;
}

interface StoreData {
  players: StoredPlayer[];
  history: StoredHistoryItem[];
  reports: StoredWasteReport[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'stem_data.json');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://qzoxbcsxnjzdsodfxhfl.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6b3hiY3N4bmp6ZHNvZGZ4aGZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxNzI3NDQsImV4cCI6MjEwNDc0ODc0NH0.SgYQni5-lFySUzjg1Y1RMBnnfJG-5QFIQBIQkg7nFnc';

let cachedData: StoreData = {
  players: [],
  history: [],
  reports: [],
};

const INITIAL_VERIFIED_REPORTS: StoredWasteReport[] = [];

const listeners = new Set<(event: { type: string; leaderboard?: StoredPlayer[]; item?: StoredHistoryItem; report?: StoredWasteReport }) => void>();

function ensureDirExists() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function saveDataToDisk() {
  try {
    ensureDirExists();
    fs.writeFileSync(DATA_FILE, JSON.stringify(cachedData, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save stem_data.json:', err);
  }
}

function loadDataFromDisk(): boolean {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.players)) {
        cachedData = {
          players: parsed.players,
          history: Array.isArray(parsed.history) ? parsed.history : [],
          reports: Array.isArray(parsed.reports) ? parsed.reports : [],
        };
        return true;
      }
    }
  } catch (err) {
    console.warn('Notice loading stem_data.json:', err);
  }
  cachedData.reports = [];
  return false;
}

export function getLevelTitle(points: number): string {
  if (points >= 100) return 'Đại Sứ Hành Tinh Xanh';
  if (points >= 60) return 'Chuyên Gia Tái Chế STEM';
  if (points >= 30) return 'Hiệp Sĩ Môi Trường';
  if (points >= 15) return 'Chiến Binh Phân Loại';
  if (points >= 5) return 'Tập Sự Phân Loại';
  return 'Thành Viên Mới';
}

export function getLeaderboard(): (StoredPlayer & { levelTitle: string })[] {
  const sorted = [...cachedData.players].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
    return b.lastActive - a.lastActive;
  });

  return sorted.map((p) => ({
    ...p,
    levelTitle: getLevelTitle(p.totalPoints),
  }));
}

export function subscribeToStoreUpdates(listener: (event: any) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners(type: string, item?: StoredHistoryItem) {
  const leaderboard = getLeaderboard();
  for (const listener of listeners) {
    try {
      listener({ type, leaderboard, item });
    } catch (e) {
      console.warn('Listener notification notice:', e);
    }
  }
}

export function upsertPlayer(profile: {
  id?: string;
  name: string;
  email?: string;
  organization?: string;
  avatar?: string;
  totalPoints?: number;
}): StoredPlayer {
  const cleanName = profile.name.trim();
  const cleanEmail = (profile.email || '').trim().toLowerCase();

  let existing = cachedData.players.find(
    (p) =>
      (profile.id && p.id === profile.id) ||
      p.name.trim().toLowerCase() === cleanName.toLowerCase() ||
      (cleanEmail && p.email.trim().toLowerCase() === cleanEmail)
  );

  if (existing) {
    if (profile.id && !existing.id) existing.id = profile.id;
    if (profile.organization) existing.organization = profile.organization;
    if (profile.avatar) existing.avatar = profile.avatar;
    if (profile.email && !existing.email) existing.email = profile.email;
    if (profile.totalPoints !== undefined && profile.totalPoints > existing.totalPoints) {
      existing.totalPoints = profile.totalPoints;
    }
    existing.lastActive = Date.now();
    saveDataToDisk();
    notifyListeners('player_updated');
    return existing;
  }

  const newPlayer: StoredPlayer = {
    id: profile.id || 'user-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
    name: cleanName || 'Thí sinh STEM',
    email: profile.email || `${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '')}@ecosort.stem`,
    organization: profile.organization || 'Lớp 11A1 - CLB STEM',
    avatar: profile.avatar || '🌱',
    totalPoints: profile.totalPoints || 0,
    correctCount: 0,
    organicCount: 0,
    recyclableCount: 0,
    inorganicCount: 0,
    lastActive: Date.now(),
    createdAt: Date.now(),
  };

  cachedData.players.push(newPlayer);
  saveDataToDisk();
  notifyListeners('player_registered');
  return newPlayer;
}

export function recordClassification(params: {
  userId?: string;
  userName: string;
  email?: string;
  organization?: string;
  avatar?: string;
  itemName: string;
  category: 'organic' | 'recyclable' | 'inorganic';
  points: number;
  confidence?: number;
  source?: string;
}): { player: StoredPlayer; leaderboard: (StoredPlayer & { levelTitle: string })[] } {
  // Ensure valid points (Hữu cơ: 1, Tái chế: 2, Vô cơ: 3)
  let pts = params.points;
  if (params.category === 'organic') pts = 1;
  else if (params.category === 'recyclable') pts = 2;
  else if (params.category === 'inorganic') pts = 3;

  const player = upsertPlayer({
    id: params.userId,
    name: params.userName,
    email: params.email,
    organization: params.organization,
    avatar: params.avatar,
  });

  player.totalPoints += pts;
  player.correctCount += 1;
  if (params.category === 'organic') player.organicCount += 1;
  else if (params.category === 'recyclable') player.recyclableCount += 1;
  else if (params.category === 'inorganic') player.inorganicCount += 1;
  player.lastActive = Date.now();

  const historyItem: StoredHistoryItem = {
    id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
    userId: player.id,
    userName: player.name,
    itemName: params.itemName,
    category: params.category,
    points: pts,
    confidence: params.confidence || 0.95,
    source: params.source || 'webcam',
    timestamp: Date.now(),
  };

  cachedData.history.unshift(historyItem);
  // Keep last 300 logs
  if (cachedData.history.length > 300) {
    cachedData.history = cachedData.history.slice(0, 300);
  }

  saveDataToDisk();
  notifyListeners('points_awarded', historyItem);

  // Background sync to Supabase players table
  syncToSupabase(player, historyItem).catch((e) => {
    console.warn('Background Supabase sync notice:', e);
  });

  return {
    player,
    leaderboard: getLeaderboard(),
  };
}

export function getHistory(limit = 50): StoredHistoryItem[] {
  return cachedData.history.slice(0, limit);
}

// Waste Reports methods
export function getWasteReports(options: { onlyApproved?: boolean; status?: string } = {}): StoredWasteReport[] {
  const { onlyApproved = true, status } = options;
  let list = cachedData.reports || [];
  
  if (onlyApproved) {
    list = list.filter((r) => r.moderationStatus === 'approved');
  }

  if (status && status !== 'all') {
    list = list.filter((r) => r.status === status);
  }

  // Sort newest first
  return [...list].sort((a, b) => b.createdAt - a.createdAt);
}

export function addWasteReport(report: StoredWasteReport): StoredWasteReport {
  if (!cachedData.reports) {
    cachedData.reports = [];
  }
  cachedData.reports.unshift(report);
  saveDataToDisk();
  
  // Notify connected clients via SSE
  for (const listener of listeners) {
    try {
      listener({ type: 'waste_report_added', report });
    } catch (e) {
      console.warn('Listener notice on waste report:', e);
    }
  }

  return report;
}

export function deleteWasteReport(id: string): boolean {
  if (!cachedData.reports) return false;
  const initialLen = cachedData.reports.length;
  cachedData.reports = cachedData.reports.filter((r) => r.id !== id);
  if (cachedData.reports.length !== initialLen) {
    saveDataToDisk();
    for (const listener of listeners) {
      try {
        listener({ type: 'waste_report_deleted', report: { id } as any });
      } catch (e) {
        console.warn('Listener notice on waste report delete:', e);
      }
    }
    return true;
  }
  return false;
}

export function clearAllWasteReports(): void {
  cachedData.reports = [];
  saveDataToDisk();
  for (const listener of listeners) {
    try {
      listener({ type: 'waste_reports_cleared' });
    } catch (e) {
      console.warn('Listener notice on waste reports clear:', e);
    }
  }
}

export function updateWasteReportStatus(
  id: string,
  status: 'reported' | 'investigating' | 'resolved',
  resolutionNote?: string
): StoredWasteReport | null {
  const report = (cachedData.reports || []).find((r) => r.id === id);
  if (!report) return null;

  report.status = status;
  if (resolutionNote !== undefined) {
    report.resolutionNote = resolutionNote;
  }
  saveDataToDisk();

  for (const listener of listeners) {
    try {
      listener({ type: 'waste_report_updated', report });
    } catch (e) {
      console.warn('Listener notice on waste report update:', e);
    }
  }

  return report;
}

export function upvoteWasteReport(id: string): StoredWasteReport | null {
  const report = (cachedData.reports || []).find((r) => r.id === id);
  if (!report) return null;

  report.upvotes = (report.upvotes || 0) + 1;
  saveDataToDisk();

  for (const listener of listeners) {
    try {
      listener({ type: 'waste_report_upvoted', report });
    } catch (e) {
      console.warn('Listener notice on waste report upvote:', e);
    }
  }

  return report;
}


// Background sync to Supabase if accessible
async function syncToSupabase(player: StoredPlayer, historyItem: StoredHistoryItem) {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    // 1. Try RPC with user id
    const { error: rpcErr } = await supabase.rpc('record_waste_classification', {
      p_item_name: historyItem.itemName,
      p_category: historyItem.category,
      p_points: historyItem.points,
      p_source: historyItem.source,
      p_confidence: historyItem.confidence,
      p_user_id: player.id,
    });

    if (rpcErr) {
      // 2. Direct upsert into players
      await supabase.from('players').upsert({
        id: player.id,
        username: player.name,
        email: player.email,
        total_points: player.totalPoints,
        correct_count: player.correctCount,
        organic_count: player.organicCount,
        recyclable_count: player.recyclableCount,
        inorganic_count: player.inorganicCount,
        avatar: player.avatar,
        organization: player.organization,
        updated_at: new Date().toISOString(),
      });
    }
  } catch (e) {
    // Non-fatal, local server store is authoritative for all devices
  }
}

// Preload existing Supabase players into memory on startup
export async function initStore(): Promise<void> {
  const loaded = loadDataFromDisk();

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: dbPlayers, error } = await supabase.from('players').select('*');

    if (!error && Array.isArray(dbPlayers)) {
      for (const row of dbPlayers) {
        const existing = cachedData.players.find(
          (p) => p.id === row.id || p.name.trim().toLowerCase() === (row.username || '').trim().toLowerCase()
        );

        if (!existing) {
          cachedData.players.push({
            id: row.id,
            name: row.username || 'Thí sinh STEM',
            email: row.email || `${row.username || 'player'}@ecosort.stem`,
            organization: row.organization || 'Lớp 11A1 - CLB STEM',
            avatar: row.avatar || '🌱',
            totalPoints: row.total_points || 0,
            correctCount: row.correct_count || 0,
            organicCount: row.organic_count || 0,
            recyclableCount: row.recyclable_count || 0,
            inorganicCount: row.inorganic_count || 0,
            lastActive: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
            createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
          });
        } else {
          // If the DB has higher points or if disk was empty, merge safely
          if (row.total_points > existing.totalPoints) {
            existing.totalPoints = row.total_points;
            existing.correctCount = row.correct_count || existing.correctCount;
          }
        }
      }
      saveDataToDisk();
      console.log(`[EcoSort Store] Initialized with ${cachedData.players.length} players from Supabase/Disk.`);
    }
  } catch (e) {
    console.warn('[EcoSort Store] Preload from Supabase notice:', e);
  }
}
