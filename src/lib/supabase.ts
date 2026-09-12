import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { LeaderboardEntry, UserProfile, WasteCategory } from '../types';
import { getLevelTitle } from '../utils/storage';

// Read public environment variables for Supabase safely with provided project credentials
const metaEnv = (import.meta as unknown as { env?: Record<string, string> }).env || {};

export const DEFAULT_SUPABASE_URL = 'https://qzoxbcsxnjzdsodfxhfl.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6b3hiY3N4bmp6ZHNvZGZ4aGZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxNzI3NDQsImV4cCI6MjEwNDc0ODc0NH0.SgYQni5-lFySUzjg1Y1RMBnnfJG-5QFIQBIQkg7nFnc';

export function getEffectiveSupabaseConfig() {
  const url =
    metaEnv.VITE_SUPABASE_URL ||
    (typeof window !== 'undefined' ? localStorage.getItem('STEM_SUPABASE_URL') : null) ||
    DEFAULT_SUPABASE_URL;

  const anonKey =
    metaEnv.VITE_SUPABASE_ANON_KEY ||
    (typeof window !== 'undefined' ? localStorage.getItem('STEM_SUPABASE_ANON_KEY') : null) ||
    DEFAULT_SUPABASE_ANON_KEY;

  return { url, anonKey };
}

export const isSupabaseConfigured = (): boolean => {
  const { url, anonKey } = getEffectiveSupabaseConfig();
  return Boolean(
    url &&
    anonKey &&
    url.startsWith('http') &&
    !url.includes('placeholder')
  );
};

// Lazy initialization of Supabase client
let supabaseInstance: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient | null => {
  if (!isSupabaseConfigured()) {
    return null;
  }
  const { url, anonKey } = getEffectiveSupabaseConfig();
  if (!supabaseInstance) {
    supabaseInstance = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return supabaseInstance;
};

// Mapping database row from public.players to UserProfile
export interface PlayerRow {
  id: string;
  username: string;
  email: string;
  total_points: number;
  correct_count: number;
  organic_count: number;
  recyclable_count: number;
  inorganic_count: number;
  avatar: string;
  organization: string;
  created_at: string;
  updated_at: string;
}

export function playerRowToUserProfile(row: PlayerRow): UserProfile {
  return {
    id: row.id,
    name: row.username || 'Thí sinh STEM',
    email: row.email,
    organization: row.organization || 'Khối Sáng Tạo STEM',
    avatar: row.avatar || '🌱',
    totalPoints: Number(row.total_points) || 0,
    correctCount: Number(row.correct_count) || 0,
    organicCount: Number(row.organic_count) || 0,
    recyclableCount: Number(row.recyclable_count) || 0,
    inorganicCount: Number(row.inorganic_count) || 0,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export function playerRowToLeaderboardEntry(row: PlayerRow, currentUserId?: string): LeaderboardEntry {
  const points = Number(row.total_points) || 0;
  return {
    id: row.id,
    name: row.username || 'Thí sinh STEM',
    email: row.email,
    organization: row.organization || 'Khối Sáng Tạo STEM',
    totalPoints: points,
    correctCount: Number(row.correct_count) || 0,
    organicCount: Number(row.organic_count) || 0,
    recyclableCount: Number(row.recyclable_count) || 0,
    inorganicCount: Number(row.inorganic_count) || 0,
    avatar: row.avatar || '🌱',
    levelTitle: getLevelTitle(points),
    lastActive: new Date(row.updated_at || row.created_at).getTime(),
    isCurrentUser: currentUserId ? row.id === currentUserId : false,
  };
}

// 1. SUPABASE AUTHENTICATION: SIGN UP
export async function signUpWithSupabase(
  email: string,
  password: string,
  username: string,
  organization: string,
  avatar: string
): Promise<{ user: UserProfile | null; error: string | null }> {
  const client = getSupabase();
  if (!client) {
    return {
      user: null,
      error: 'Chưa cấu hình Supabase URL và API Anon Key. Vui lòng kiểm tra cài đặt biến môi trường.',
    };
  }

  try {
    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password: password,
      options: {
        data: {
          username: username.trim(),
          organization: organization.trim() || 'Khối Sáng Tạo STEM',
          avatar: avatar || '🌱',
        },
      },
    });

    if (error) {
      return { user: null, error: error.message };
    }

    if (!data.user) {
      return { user: null, error: 'Không thể tạo tài khoản người dùng.' };
    }

    // Retrieve or wait for player record created by trigger
    // Small retry delay in case trigger takes a moment
    let profile = await fetchPlayerProfile(data.user.id);
    if (!profile) {
      // Manual fallback insert if trigger wasn't run yet
      const { data: inserted, error: insertError } = await client
        .from('players')
        .upsert({
          id: data.user.id,
          username: username.trim(),
          email: email.trim(),
          total_points: 0,
          correct_count: 0,
          organic_count: 0,
          recyclable_count: 0,
          inorganic_count: 0,
          avatar: avatar || '🌱',
          organization: organization.trim() || 'Khối Sáng Tạo STEM',
        })
        .select()
        .single();

      if (!insertError && inserted) {
        profile = playerRowToUserProfile(inserted as PlayerRow);
      } else {
        profile = {
          id: data.user.id,
          name: username.trim(),
          email: email.trim(),
          organization: organization.trim() || 'Khối Sáng Tạo STEM',
          avatar: avatar || '🌱',
          totalPoints: 0,
          correctCount: 0,
          organicCount: 0,
          recyclableCount: 0,
          inorganicCount: 0,
          createdAt: Date.now(),
        };
      }
    }

    return { user: profile, error: null };
  } catch (err: unknown) {
    return {
      user: null,
      error: err instanceof Error ? err.message : 'Đã xảy ra lỗi khi đăng ký.',
    };
  }
}

// 2. SUPABASE AUTHENTICATION: SIGN IN
export async function signInWithSupabase(
  email: string,
  password: string
): Promise<{ user: UserProfile | null; error: string | null }> {
  const client = getSupabase();
  if (!client) {
    return {
      user: null,
      error: 'Chưa cấu hình Supabase URL và API Anon Key.',
    };
  }

  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      return { user: null, error: error.message };
    }

    if (!data.user) {
      return { user: null, error: 'Không tìm thấy thông tin tài khoản.' };
    }

    const profile = await fetchPlayerProfile(data.user.id);
    if (!profile) {
      // Create record if missing
      const fallback: UserProfile = {
        id: data.user.id,
        name: data.user.user_metadata?.username || email.split('@')[0],
        email: data.user.email || email,
        organization: data.user.user_metadata?.organization || 'Khối Sáng Tạo STEM',
        avatar: data.user.user_metadata?.avatar || '🌱',
        totalPoints: 0,
        correctCount: 0,
        organicCount: 0,
        recyclableCount: 0,
        inorganicCount: 0,
        createdAt: Date.now(),
      };
      return { user: fallback, error: null };
    }

    return { user: profile, error: null };
  } catch (err: unknown) {
    return {
      user: null,
      error: err instanceof Error ? err.message : 'Đã xảy ra lỗi khi đăng nhập.',
    };
  }
}

// 3. SIGN OUT
export async function signOutSupabase(): Promise<void> {
  const client = getSupabase();
  if (client) {
    await client.auth.signOut();
  }
}

// 4. FETCH CURRENT PLAYER PROFILE
export async function fetchPlayerProfile(userId: string): Promise<UserProfile | null> {
  const client = getSupabase();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('players')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return playerRowToUserProfile(data as PlayerRow);
  } catch {
    return null;
  }
}

// 5. FETCH ONLINE LEADERBOARD (SORTED BY TOTAL_POINTS DESC, THEN CORRECT_COUNT DESC)
export async function fetchOnlineLeaderboard(currentUserId?: string): Promise<{
  entries: LeaderboardEntry[];
  error: string | null;
}> {
  const client = getSupabase();
  if (!client) {
    return { entries: [], error: 'not_configured' };
  }

  try {
    const { data, error } = await client
      .from('players')
      .select('*')
      .order('total_points', { ascending: false })
      .order('correct_count', { ascending: false })
      .limit(100);

    if (error) {
      return { entries: [], error: error.message };
    }

    const rows = (data || []) as PlayerRow[];
    const entries = rows.map((row) => playerRowToLeaderboardEntry(row, currentUserId));
    return { entries, error: null };
  } catch (err: unknown) {
    return {
      entries: [],
      error: err instanceof Error ? err.message : 'Lỗi truy vấn cơ sở dữ liệu',
    };
  }
}

// 6. RECORD WASTE CLASSIFICATION (SECURITY DEFINER RPC CALL)
// Strict server-side verification: Player cannot manipulate points from browser console
export async function recordClassificationOnline(params: {
  itemName: string;
  category: WasteCategory;
  points: number;
  source: string;
  confidence?: number;
}): Promise<{
  success: boolean;
  totalPoints?: number;
  correctCount?: number;
  error?: string | null;
}> {
  const client = getSupabase();
  if (!client) {
    return { success: false, error: 'Chưa kết nối Supabase' };
  }

  try {
    const { data, error } = await client.rpc('record_waste_classification', {
      p_item_name: params.itemName,
      p_category: params.category,
      p_points: params.points,
      p_source: params.source,
      p_confidence: params.confidence || 0.95,
    });

    if (error) {
      // Fallback: If RPC not yet created in Supabase, we report clear instructions
      return { success: false, error: error.message };
    }

    return {
      success: true,
      totalPoints: data?.total_points,
      correctCount: data?.correct_count,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Không thể ghi nhận điểm trực tuyến',
    };
  }
}

// 7. REALTIME LEADERBOARD SUBSCRIPTION
export function subscribeToLeaderboardChanges(
  onTableChange: () => void
): RealtimeChannel | null {
  const client = getSupabase();
  if (!client) return null;

  try {
    const channel = client
      .channel('realtime:public:players')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players' },
        () => {
          onTableChange();
        }
      )
      .subscribe();

    return channel;
  } catch (err) {
    console.error('Failed to subscribe to Supabase Realtime', err);
    return null;
  }
}
