-- 1. XÓA SẠCH DỮ LIỆU CŨ ĐỂ RESET CẤU TRÚC
TRUNCATE TABLE appointments, staff_leaves, staff_services, machines, services, staff, settings CASCADE;

-- 2. THÊM CỘT clinic_id VÀO CÁC BẢNG (Mặc định lấy từ Supabase Auth)
-- Bảng settings: vì khóa chính là key, nên cần drop rổi tạo lại
DROP TABLE IF EXISTS settings CASCADE;
CREATE TABLE settings (
  clinic_id UUID DEFAULT auth.uid() NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (clinic_id, key)
);

ALTER TABLE staff ADD COLUMN IF NOT EXISTS clinic_id UUID DEFAULT auth.uid() NOT NULL;
ALTER TABLE services ADD COLUMN IF NOT EXISTS clinic_id UUID DEFAULT auth.uid() NOT NULL;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS clinic_id UUID DEFAULT auth.uid() NOT NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS clinic_id UUID DEFAULT auth.uid() NOT NULL;
ALTER TABLE staff_leaves ADD COLUMN IF NOT EXISTS clinic_id UUID DEFAULT auth.uid() NOT NULL;

-- Với bảng staff_services, cần drop khóa chính cũ và tạo lại
ALTER TABLE staff_services ADD COLUMN IF NOT EXISTS clinic_id UUID DEFAULT auth.uid() NOT NULL;
ALTER TABLE staff_services DROP CONSTRAINT IF EXISTS staff_services_pkey;
ALTER TABLE staff_services ADD PRIMARY KEY (clinic_id, staff_id, service_id);

-- 3. KÍCH HOẠT ROW LEVEL SECURITY (RLS)
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_leaves ENABLE ROW LEVEL SECURITY;

-- 4. TẠO CÁC POLICY ĐỂ CHỈ CHO PHÉP TRUY CẬP DỮ LIỆU CỦA MÌNH
-- Hàm trợ giúp để kiểm tra quyền truy cập (bao gồm cả quyền bypass của Super Admin)
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
BEGIN
  -- Tài khoản anhkan sẽ có email ví dụ: anhkan@admin.com (chúng ta sẽ quy định lúc tạo)
  RETURN auth.jwt() ->> 'email' = 'anhkan@admin.com';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Settings
DROP POLICY IF EXISTS "Clinic isolation for settings" ON settings;
CREATE POLICY "Clinic isolation for settings" ON settings FOR ALL
USING (clinic_id = auth.uid() OR is_admin());

-- Staff
DROP POLICY IF EXISTS "Clinic isolation for staff" ON staff;
CREATE POLICY "Clinic isolation for staff" ON staff FOR ALL
USING (clinic_id = auth.uid() OR is_admin());

-- Services
DROP POLICY IF EXISTS "Clinic isolation for services" ON services;
CREATE POLICY "Clinic isolation for services" ON services FOR ALL
USING (clinic_id = auth.uid() OR is_admin());

-- Machines
DROP POLICY IF EXISTS "Clinic isolation for machines" ON machines;
CREATE POLICY "Clinic isolation for machines" ON machines FOR ALL
USING (clinic_id = auth.uid() OR is_admin());

-- Staff Services
DROP POLICY IF EXISTS "Clinic isolation for staff_services" ON staff_services;
CREATE POLICY "Clinic isolation for staff_services" ON staff_services FOR ALL
USING (clinic_id = auth.uid() OR is_admin());

-- Appointments
DROP POLICY IF EXISTS "Clinic isolation for appointments" ON appointments;
CREATE POLICY "Clinic isolation for appointments" ON appointments FOR ALL
USING (clinic_id = auth.uid() OR is_admin());

-- Staff Leaves
DROP POLICY IF EXISTS "Clinic isolation for staff_leaves" ON staff_leaves;
CREATE POLICY "Clinic isolation for staff_leaves" ON staff_leaves FOR ALL
USING (clinic_id = auth.uid() OR is_admin());

-- 5. CHÈN DATA SETTINGS MẶC ĐỊNH BẰNG TRIGGER SAU KHI TẠO USER (Tùy chọn, hoặc cho Frontend xử lý)
-- Tạo trigger chèn Settings khi có user mới
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.settings (clinic_id, key, value) VALUES
    (NEW.id, 'morning_start', '07:30'),
    (NEW.id, 'morning_end', '11:30'),
    (NEW.id, 'afternoon_start', '13:30'),
    (NEW.id, 'afternoon_end', '17:00'),
    (NEW.id, 'export_version', '0.0'),
    (NEW.id, 'last_export_date', '');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
