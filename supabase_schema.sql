-- ==============================================================================
-- ECOSORT AI - SUPABASE DATABASE SCHEMA & BẢO MẬT ROW LEVEL SECURITY (RLS)
-- Dự án: Hệ Thống Phân Loại Rác Thông Minh Tích Điểm STEM
-- ==============================================================================
-- Hướng dẫn:
-- 1. Đăng nhập vào https://supabase.com và vào mục SQL Editor trong dự án của bạn.
-- 2. Dán toàn bộ nội dung script này và nhấn "Run".
-- 3. Bảng 'players' và 'classification_logs' cùng cơ chế bảo mật chống gian lận
--    sẽ được tự động tạo và kích hoạt.
-- ==============================================================================

-- 1. TẠO BẢNG LƯU THÔNG TIN NGƯỜI CHƠI (public.players)
CREATE TABLE IF NOT EXISTS public.players (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  total_points INTEGER NOT NULL DEFAULT 0 CHECK (total_points >= 0),
  correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  organic_count INTEGER NOT NULL DEFAULT 0 CHECK (organic_count >= 0),
  recyclable_count INTEGER NOT NULL DEFAULT 0 CHECK (recyclable_count >= 0),
  inorganic_count INTEGER NOT NULL DEFAULT 0 CHECK (inorganic_count >= 0),
  avatar TEXT NOT NULL DEFAULT '🌱',
  organization TEXT NOT NULL DEFAULT 'Khối Sáng Tạo STEM',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index để tối ưu tốc độ truy vấn Bảng Xếp Hạng theo tổng điểm giảm dần
CREATE INDEX IF NOT EXISTS idx_players_leaderboard 
  ON public.players (total_points DESC, correct_count DESC);

-- 2. TẠO BẢNG NHẬT KÝ PHÂN LOẠI (public.classification_logs)
CREATE TABLE IF NOT EXISTS public.classification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('organic', 'recyclable', 'inorganic')),
  points_awarded INTEGER NOT NULL CHECK (points_awarded IN (1, 2, 3)),
  source TEXT NOT NULL DEFAULT 'webcam',
  confidence NUMERIC(4, 2) DEFAULT 0.95,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_user 
  ON public.classification_logs (user_id, created_at DESC);

-- ==============================================================================
-- 3. KÍCH HOẠT BẢO MẬT ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classification_logs ENABLE ROW LEVEL SECURITY;

-- Policy 1: Cho phép tất cả mọi người (kể cả chưa đăng nhập) ĐỌC bảng xếp hạng online
DROP POLICY IF EXISTS "Public can view players leaderboard" ON public.players;
CREATE POLICY "Public can view players leaderboard" 
  ON public.players 
  FOR SELECT 
  USING (true);

-- Policy 2: Người dùng chỉ được sửa thông tin hiển thị (tên, avatar, đơn vị)
-- TUYỆT ĐỐI KHÔNG CHO PHÉP sửa điểm hay số lần phân loại bằng lệnh UPDATE từ client!
DROP POLICY IF EXISTS "Users can only update display info" ON public.players;
CREATE POLICY "Users can only update display info" 
  ON public.players 
  FOR UPDATE 
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id 
    AND total_points = (SELECT p.total_points FROM public.players p WHERE p.id = auth.uid())
    AND correct_count = (SELECT p.correct_count FROM public.players p WHERE p.id = auth.uid())
  );

-- Policy 3: Nhật ký phân loại - ai cũng có thể xem nhật ký chung hoặc cá nhân
DROP POLICY IF EXISTS "Public can view classification logs" ON public.classification_logs;
CREATE POLICY "Public can view classification logs" 
  ON public.classification_logs 
  FOR SELECT 
  USING (true);

-- ==============================================================================
-- 4. TỰ ĐỘNG KHỞI TẠO HỒ SƠ 0 ĐIỂM KHI NGƯỜI CHƠI ĐĂNG KÝ TÀI KHOẢN (TRIGGER)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.players (
    id,
    username,
    email,
    total_points,
    correct_count,
    organic_count,
    recyclable_count,
    inorganic_count,
    avatar,
    organization
  ) VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'username', ''), split_part(NEW.email, '@', 1)),
    NEW.email,
    0, -- Luôn bắt đầu chính xác với 0 điểm
    0, -- 0 lần phân loại đúng
    0,
    0,
    0,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'avatar', ''), '🌱'),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'organization', ''), 'Khối Sáng Tạo STEM')
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Gắn Trigger vào bảng auth.users của Supabase
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 5. HÀM TÍCH ĐIỂM BẢO MẬT (STORED PROCEDURE / RPC)
-- Ngăn chặn người chơi can thiệp điểm từ DevTools/Console trình duyệt.
-- Điểm chỉ được cộng khi hàm thực thi trên máy chủ Supabase và xác thực nguồn webcam.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.record_waste_classification(
  p_item_name TEXT,
  p_category TEXT,
  p_points INT,
  p_source TEXT DEFAULT 'webcam',
  p_confidence NUMERIC DEFAULT 0.95
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_allowed_points INT;
  v_updated_user RECORD;
BEGIN
  -- 1. Xác thực người dùng đang đăng nhập
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Vui lòng đăng nhập để được tích điểm thi đua!';
  END IF;

  -- 2. Kiểm tra nguồn quét: BẮT BUỘC là webcam thực tế
  IF p_source <> 'webcam' THEN
    RAISE EXCEPTION 'Chỉ nhận điểm từ quét phân loại rác trên webcam!';
  END IF;

  -- 3. Kiểm tra quy tắc điểm hợp lệ theo từng loại rác
  IF p_category = 'organic' THEN
    v_allowed_points := 1;
  ELSIF p_category = 'recyclable' THEN
    v_allowed_points := 2;
  ELSIF p_category = 'inorganic' THEN
    v_allowed_points := 3;
  ELSE
    RAISE EXCEPTION 'Loại rác % không hợp lệ!', p_category;
  END IF;

  -- Đảm bảo điểm cộng chính xác theo quy chuẩn
  p_points := v_allowed_points;

  -- 4. Cập nhật trực tiếp điểm và số lần phân loại đúng vào database
  UPDATE public.players
  SET
    total_points = total_points + p_points,
    correct_count = correct_count + 1,
    organic_count = organic_count + CASE WHEN p_category = 'organic' THEN 1 ELSE 0 END,
    recyclable_count = recyclable_count + CASE WHEN p_category = 'recyclable' THEN 1 ELSE 0 END,
    inorganic_count = inorganic_count + CASE WHEN p_category = 'inorganic' THEN 1 ELSE 0 END,
    updated_at = NOW()
  WHERE id = v_user_id
  RETURNING * INTO v_updated_user;

  -- Nếu chưa có bản ghi player (trường hợp user tạo trước trigger), tạo mới
  IF NOT FOUND THEN
    INSERT INTO public.players (
      id,
      username,
      email,
      total_points,
      correct_count,
      organic_count,
      recyclable_count,
      inorganic_count
    ) VALUES (
      v_user_id,
      'Thí sinh STEM',
      'user@ecosort.local',
      p_points,
      1,
      CASE WHEN p_category = 'organic' THEN 1 ELSE 0 END,
      CASE WHEN p_category = 'recyclable' THEN 1 ELSE 0 END,
      CASE WHEN p_category = 'inorganic' THEN 1 ELSE 0 END
    )
    RETURNING * INTO v_updated_user;
  END IF;

  -- 5. Ghi vào nhật ký phân loại (audit log)
  INSERT INTO public.classification_logs (
    user_id,
    item_name,
    category,
    points_awarded,
    source,
    confidence
  ) VALUES (
    v_user_id,
    p_item_name,
    p_category,
    p_points,
    p_source,
    p_confidence
  );

  -- 6. Trả về kết quả mới nhất cho client
  RETURN jsonb_build_object(
    'success', true,
    'awarded_points', p_points,
    'total_points', v_updated_user.total_points,
    'correct_count', v_updated_user.correct_count,
    'username', v_updated_user.username
  );
END;
$$;

-- ==============================================================================
-- 6. KÍCH HOẠT SUPABASE REALTIME ĐỂ BẢNG XẾP HẠNG TỰ CẬP NHẬT TỨC THÌ
-- ==============================================================================
DO $$
BEGIN
  -- Thêm bảng players vào danh sách xuất bản Realtime
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'players'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'classification_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.classification_logs;
  END IF;
END;
$$;
