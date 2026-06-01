-- Chạy toàn bộ Script này trong mục SQL Editor của Supabase

-- Bảng Cài đặt
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Bảng Nhân sự
CREATE TABLE IF NOT EXISTS staff (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL -- 'Doctor', 'Physician', 'Nurse'
);

-- Bảng Dịch vụ Kỹ thuật
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  total_time INTEGER NOT NULL DEFAULT 0,
  non_overlap_time INTEGER NOT NULL DEFAULT 0,
  bed_occupancy_time INTEGER NOT NULL,
  required_role TEXT,
  requires_machine BOOLEAN DEFAULT FALSE,
  machine_capacity INTEGER DEFAULT 1,
  is_exclusive_staff BOOLEAN DEFAULT FALSE,
  no_patient_overlap BOOLEAN DEFAULT FALSE,
  allow_idle_overlap_with TEXT DEFAULT '',
  deny_idle_overlap_with TEXT DEFAULT ''
);

-- Bảng Máy móc
CREATE TABLE IF NOT EXISTS machines (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  service_id TEXT REFERENCES services(id) ON DELETE SET NULL,
  capacity INTEGER DEFAULT 1
);

-- Bảng Phân quyền dịch vụ cho nhân sự
CREATE TABLE IF NOT EXISTS staff_services (
  staff_id INTEGER REFERENCES staff(id) ON DELETE CASCADE,
  service_id TEXT REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY(staff_id, service_id)
);

-- Bảng Lịch hẹn
CREATE TABLE IF NOT EXISTS appointments (
  id SERIAL PRIMARY KEY,
  patient_name TEXT NOT NULL,
  service_id TEXT REFERENCES services(id),
  staff_id INTEGER REFERENCES staff(id),
  machine_id INTEGER REFERENCES machines(id),
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT DEFAULT 'scheduled'
);

-- Bảng Nghỉ phép nhân sự
CREATE TABLE IF NOT EXISTS staff_leaves (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  leave_date DATE NOT NULL,
  leave_type TEXT NOT NULL DEFAULT 'full_day',
  start_time TIME,
  end_time TIME,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Indexes để tăng tốc
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_name);
CREATE INDEX IF NOT EXISTS idx_appointments_staff ON appointments(staff_id);
CREATE INDEX IF NOT EXISTS idx_appointments_service ON appointments(service_id);
CREATE INDEX IF NOT EXISTS idx_appointments_start ON appointments(start_time);
CREATE INDEX IF NOT EXISTS idx_staff_leaves_date ON staff_leaves(leave_date);
CREATE INDEX IF NOT EXISTS idx_staff_leaves_staff ON staff_leaves(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_services_staff ON staff_services(staff_id);

-- Dữ liệu mặc định (Seed data)
INSERT INTO settings (key, value) VALUES 
('morning_start', '07:30'),
('morning_end', '11:30'),
('afternoon_start', '13:30'),
('afternoon_end', '17:00'),
('export_version', '0.0'),
('last_export_date', '')
ON CONFLICT (key) DO NOTHING;
