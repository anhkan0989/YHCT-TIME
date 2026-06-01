import express from "express";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = process.env.DB_PATH || path.join(__dirname, "clinic.db");
const db = new Database(dbPath);
// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL -- 'Doctor', 'Physician', 'Nurse'
  );

  CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    total_time INTEGER NOT NULL DEFAULT 0,
    non_overlap_time INTEGER NOT NULL DEFAULT 0,
    bed_occupancy_time INTEGER NOT NULL,
    required_role TEXT,                 -- 'Doctor' etc
    requires_machine BOOLEAN DEFAULT 0,
    machine_capacity INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS machines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    service_id TEXT,
    capacity INTEGER DEFAULT 1,
    FOREIGN KEY(service_id) REFERENCES services(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS staff_services (
    staff_id INTEGER,
    service_id TEXT,
    PRIMARY KEY(staff_id, service_id),
    FOREIGN KEY(staff_id) REFERENCES staff(id) ON DELETE CASCADE,
    FOREIGN KEY(service_id) REFERENCES services(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_name TEXT NOT NULL,
    service_id TEXT NOT NULL,
    staff_id INTEGER,
    machine_id INTEGER,
    start_time TEXT NOT NULL, -- ISO string
    status TEXT DEFAULT 'scheduled',
    FOREIGN KEY(service_id) REFERENCES services(id),
    FOREIGN KEY(staff_id) REFERENCES staff(id),
    FOREIGN KEY(machine_id) REFERENCES machines(id)
  );
`);
// === Bảng nghỉ phép nhân sự ===
db.exec(`
  CREATE TABLE IF NOT EXISTS staff_leaves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL,
    leave_date TEXT NOT NULL,
    leave_type TEXT NOT NULL DEFAULT 'full_day',
    start_time TEXT,
    end_time TEXT,
    reason TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(staff_id) REFERENCES staff(id) ON DELETE CASCADE
  );
`);
// === INDEXES để tăng tốc query ===
try { db.exec('CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_name)'); } catch(e) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_appointments_staff ON appointments(staff_id)'); } catch(e) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_appointments_service ON appointments(service_id)'); } catch(e) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_appointments_start ON appointments(start_time)'); } catch(e) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_staff_leaves_date ON staff_leaves(leave_date)'); } catch(e) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_staff_leaves_staff ON staff_leaves(staff_id)'); } catch(e) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_staff_services_staff ON staff_services(staff_id)'); } catch(e) {}
// Các cột mới cho tính năng Lồng Ca (Idle Overlap)
try { db.exec("ALTER TABLE services ADD COLUMN allow_idle_overlap_with TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE services ADD COLUMN deny_idle_overlap_with TEXT DEFAULT ''"); } catch (e) {}
// Thêm cột machine_id cho DB cũ nếu chưa có
try {
    db.exec("ALTER TABLE appointments ADD COLUMN machine_id INTEGER");
}
catch (e) { }
// Support upgrading DB safely
try {
    db.exec("ALTER TABLE services ADD COLUMN machine_capacity INTEGER DEFAULT 1");
}
catch (e) { }
try {
    db.exec("ALTER TABLE services ADD COLUMN is_exclusive_staff BOOLEAN DEFAULT 0");
}
catch (e) { }
try {
    db.exec("ALTER TABLE services ADD COLUMN total_time INTEGER DEFAULT 0");
}
catch (e) { }
try {
    db.exec("ALTER TABLE services ADD COLUMN non_overlap_time INTEGER DEFAULT 0");
}
catch (e) { }
// Cột mới: không trùng bệnh nhân
try {
    db.exec("ALTER TABLE services ADD COLUMN no_patient_overlap BOOLEAN DEFAULT 0");
}
catch (e) { }
try {
    db.exec(`
    UPDATE services 
    SET total_time = staff_action_time + wait_time + staff_finish_time,
        non_overlap_time = staff_action_time
    WHERE total_time = 0;
  `);
}
catch (e) { }
// Seed Default Settings
const initSettings = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
initSettings.run("morning_start", "07:30");
initSettings.run("morning_end", "11:30");
initSettings.run("afternoon_start", "13:30");
initSettings.run("afternoon_end", "17:00");
initSettings.run("export_version", "0.0");
initSettings.run("last_export_date", "");
// Seed initial services if empty
const serviceCount = db.prepare("SELECT COUNT(*) as count FROM services").get();
if (serviceCount.count === 0) {
    const insertService = db.prepare(`
    INSERT INTO services (id, name, total_time, non_overlap_time, bed_occupancy_time, required_role, requires_machine, machine_capacity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
    insertService.run('01', 'Điện/Hào châm', 30, 5, 30, null, 1, 1);
    insertService.run('02', 'Thủy châm', 25, 10, 25, 'Doctor', 0, 1);
    insertService.run('03', 'Giác hơi', 20, 15, 20, null, 0, 1);
    insertService.run('05', 'Cấy chỉ', 60, 40, 70, 'Doctor', 0, 1);
    insertService.run('06', 'Xoa bóp bấm huyệt', 25, 20, 25, null, 0, 1);
    insertService.run('10', 'Chườm thuốc', 15, 1, 15, null, 0, 1);
}
// Seed initial machines if empty
const machineCount = db.prepare("SELECT COUNT(*) as count FROM machines").get();
if (machineCount.count === 0) {
    const insertMachine = db.prepare("INSERT INTO machines (name, service_id, capacity) VALUES (?, ?, ?)");
    // Seed some default machines based on common services
    insertMachine.run('Máy Điện châm 01', '01', 1);
    insertMachine.run('Máy Điện châm 02', '01', 1);
    insertMachine.run('Máy Điện châm 03', '01', 1);
    insertMachine.run('Máy Hào châm 01', '01', 1);
}
// Seed initial staff if empty
const staffCount = db.prepare("SELECT COUNT(*) as count FROM staff").get();
if (staffCount.count === 0) {
    const insertStaff = db.prepare("INSERT INTO staff (name, role) VALUES (?, ?)");
    const insertStaffSvc = db.prepare("INSERT INTO staff_services (staff_id, service_id) VALUES (?, ?)");
    const staffs = [
        { name: 'BS. Nguyễn Văn A', role: 'Doctor' },
        { name: 'YS. Trần Thị B', role: 'Physician' },
        { name: 'KTV. Lê Văn C', role: 'Physician' }
    ];
    const services = db.prepare("SELECT id FROM services").all();
    for (const s of staffs) {
        const info = insertStaff.run(s.name, s.role);
        // Assign all services by default
        for (const svc of services) {
            insertStaffSvc.run(info.lastInsertRowid, svc.id);
        }
    }
}
export async function startServer(portArg) {
    const app = express();
    app.use(express.json());
    // Thêm CORS để gọi API nếu cần
    app.use((req, res, next) => {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE");
        res.header("Access-Control-Allow-Headers", "Content-Type");
        next();
    });
    app.get("/api/settings", (req, res) => {
        const settings = db.prepare("SELECT * FROM settings").all();
        res.json(settings.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {}));
    });
    app.put("/api/settings", (req, res) => {
        const insert = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
        const tx = db.transaction((entries) => {
            for (const [k, v] of entries)
                insert.run(k, v);
        });
        tx(Object.entries(req.body));
        res.json({ message: "Settings updated" });
    });
    // API Routes
    app.get("/api/staff", (req, res) => {
        const staff = db.prepare("SELECT * FROM staff").all();
        const staffServices = db.prepare("SELECT * FROM staff_services").all();
        const mappedStaff = staff.map(s => {
            s.allowed_services = staffServices.filter(ss => ss.staff_id === s.id).map(ss => ss.service_id);
            return s;
        });
        res.json(mappedStaff);
    });
    app.post("/api/staff", (req, res) => {
        const { name, role, allowed_services } = req.body;
        const info = db.prepare("INSERT INTO staff (name, role) VALUES (?, ?)").run(name, role);
        if (allowed_services && allowed_services.length) {
            const insertService = db.prepare("INSERT INTO staff_services (staff_id, service_id) VALUES (?, ?)");
            const tx = db.transaction((svcs) => {
                for (const svc of svcs)
                    insertService.run(info.lastInsertRowid, svc);
            });
            tx(allowed_services);
        }
        res.json({ id: info.lastInsertRowid, message: "Staff created" });
    });
    app.post("/api/staff/bulk", (req, res) => {
        const { staffs } = req.body; // Array of { name, role, allowed_services: [] }
        const tx = db.transaction((list) => {
            const insertStaff = db.prepare("INSERT INTO staff (name, role) VALUES (?, ?)");
            const insertService = db.prepare("INSERT INTO staff_services (staff_id, service_id) VALUES (?, ?)");
            for (const s of list) {
                const info = insertStaff.run(s.name, s.role);
                if (s.allowed_services && s.allowed_services.length) {
                    for (const svc of s.allowed_services) {
                        insertService.run(info.lastInsertRowid, svc);
                    }
                }
            }
        });
        tx(staffs);
        res.json({ message: "Staff imported successfully" });
    });
    app.put("/api/staff/:id", (req, res) => {
        const { id } = req.params;
        const { name, role, allowed_services } = req.body;
        db.prepare("UPDATE staff SET name = ?, role = ? WHERE id = ?").run(name, role, id);
        db.prepare("DELETE FROM staff_services WHERE staff_id = ?").run(id);
        if (allowed_services && allowed_services.length) {
            const insertService = db.prepare("INSERT INTO staff_services (staff_id, service_id) VALUES (?, ?)");
            const tx = db.transaction((svcs) => {
                for (const svc of svcs)
                    insertService.run(id, svc);
            });
            tx(allowed_services);
        }
        res.json({ message: "Staff updated successfully" });
    });
    app.delete("/api/staff/:id", (req, res) => {
        const { id } = req.params;
        db.prepare("DELETE FROM staff_services WHERE staff_id = ?").run(id);
        db.prepare("DELETE FROM staff WHERE id = ?").run(id);
        res.json({ message: "Staff deleted" });
    });
    app.get("/api/services", (req, res) => {
        const services = db.prepare("SELECT * FROM services").all();
        res.json(services);
    });
    app.post("/api/services", (req, res) => {
        const { name, total_time, non_overlap_time, requires_machine, bed_occupancy_time, is_exclusive_staff, no_patient_overlap, required_role, allow_idle_overlap_with, deny_idle_overlap_with } = req.body;
        if (!name || total_time == null || non_overlap_time == null) {
            return res.status(400).json({ error: "Missing required fields" });
        }
        const existing = db.prepare("SELECT id FROM services WHERE name = ?").get(name);
        if (existing) {
            return res.status(400).json({ error: "Service with this name already exists" });
        }
        const stmt = db.prepare(`INSERT INTO services (name, total_time, non_overlap_time, requires_machine, bed_occupancy_time, is_exclusive_staff, no_patient_overlap, required_role, allow_idle_overlap_with, deny_idle_overlap_with) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        const info = stmt.run(name, total_time, non_overlap_time, requires_machine ? 1 : 0, bed_occupancy_time || total_time, is_exclusive_staff ? 1 : 0, no_patient_overlap ? 1 : 0, required_role || '', allow_idle_overlap_with || '', deny_idle_overlap_with || '');
        res.json({ id: info.lastInsertRowid, message: "Service added" });
    });
    app.put("/api/services/:id", (req, res) => {
        const { id } = req.params;
        const { name, total_time, non_overlap_time, requires_machine, bed_occupancy_time, is_exclusive_staff, no_patient_overlap, required_role, allow_idle_overlap_with, deny_idle_overlap_with } = req.body;
        const stmt = db.prepare(`UPDATE services SET name = ?, total_time = ?, non_overlap_time = ?, requires_machine = ?, bed_occupancy_time = ?, is_exclusive_staff = ?, no_patient_overlap = ?, required_role = ?, allow_idle_overlap_with = ?, deny_idle_overlap_with = ? WHERE id = ?`);
        stmt.run(name, total_time, non_overlap_time, requires_machine ? 1 : 0, bed_occupancy_time || total_time, is_exclusive_staff ? 1 : 0, no_patient_overlap ? 1 : 0, required_role || '', allow_idle_overlap_with || '', deny_idle_overlap_with || '', id);
        res.json({ message: "Service updated" });
    });
    app.delete("/api/services/:id", (req, res) => {
        const { id } = req.params;
        try {
            db.prepare("DELETE FROM staff_services WHERE service_id = ?").run(id);
            db.prepare("DELETE FROM services WHERE id = ?").run(id);
            res.json({ message: "Service deleted" });
        }
        catch (e) {
            res.status(400).json({ error: e.message });
        }
    });
    // === Staff Leaves API (Nghỉ phép nhân sự) ===
    app.get("/api/staff-leaves", (req, res) => {
        const { date, staff_id } = req.query;
        let query = "SELECT sl.*, s.name as staff_name FROM staff_leaves sl JOIN staff s ON sl.staff_id = s.id";
        const params = [];
        const conditions = [];
        if (date) {
            conditions.push("sl.leave_date = ?");
            params.push(date);
        }
        if (staff_id) {
            conditions.push("sl.staff_id = ?");
            params.push(staff_id);
        }
        if (conditions.length > 0) {
            query += " WHERE " + conditions.join(" AND ");
        }
        query += " ORDER BY sl.leave_date DESC, sl.created_at DESC";
        res.json(db.prepare(query).all(...params));
    });
    app.post("/api/staff-leaves", (req, res) => {
        const { staff_id, leave_date, leave_type, start_time, end_time, reason } = req.body;
        if (!staff_id || !leave_date || !leave_type) {
            return res.status(400).json({ error: "Thiếu thông tin bắt buộc" });
        }
        if (leave_type === 'time_range' && (!start_time || !end_time)) {
            return res.status(400).json({ error: "Vui lòng nhập thời gian bắt đầu và kết thúc" });
        }
        try {
            const info = db.prepare(`
                INSERT INTO staff_leaves (staff_id, leave_date, leave_type, start_time, end_time, reason)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(staff_id, leave_date, leave_type, start_time || null, end_time || null, reason || null);
            res.json({ id: info.lastInsertRowid, message: "Đã tạo nghỉ phép" });
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });
    app.put("/api/staff-leaves/:id", (req, res) => {
        const { id } = req.params;
        const { staff_id, leave_date, leave_type, start_time, end_time, reason } = req.body;
        try {
            db.prepare(`
                UPDATE staff_leaves SET staff_id = ?, leave_date = ?, leave_type = ?, 
                start_time = ?, end_time = ?, reason = ? WHERE id = ?
            `).run(staff_id, leave_date, leave_type, start_time || null, end_time || null, reason || null, id);
            res.json({ message: "Đã cập nhật nghỉ phép" });
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });
    app.delete("/api/staff-leaves/:id", (req, res) => {
        const { id } = req.params;
        db.prepare("DELETE FROM staff_leaves WHERE id = ?").run(id);
        res.json({ message: "Đã xóa nghỉ phép" });
    });
    // === Machines API ===
    app.get("/api/machines", (req, res) => {
        res.json(db.prepare("SELECT * FROM machines").all());
    });
    app.post("/api/machines", (req, res) => {
        const { name, service_id, capacity } = req.body;
        try {
            const info = db.prepare("INSERT INTO machines (name, service_id, capacity) VALUES (?, ?, ?)").run(name, service_id || null, capacity || 1);
            res.json({ id: info.lastInsertRowid, message: "Machine created" });
        }
        catch (e) {
            res.status(400).json({ error: e.message });
        }
    });
    app.put("/api/machines/:id", (req, res) => {
        const { id } = req.params;
        const { name, service_id, capacity } = req.body;
        try {
            db.prepare("UPDATE machines SET name = ?, service_id = ?, capacity = ? WHERE id = ?").run(name, service_id || null, capacity || 1, id);
            res.json({ message: "Machine updated" });
        }
        catch (e) {
            res.status(400).json({ error: e.message });
        }
    });
    app.delete("/api/machines/:id", (req, res) => {
        const { id } = req.params;
        db.prepare("DELETE FROM machines WHERE id = ?").run(id);
        res.json({ message: "Machine deleted" });
    });
    app.get("/api/appointments", (req, res) => {
        const appointments = db.prepare(`
      SELECT a.*, s.name as service_name, st.name as staff_name, m.name as machine_name
      FROM appointments a
      JOIN services s ON a.service_id = s.id
      LEFT JOIN staff st ON a.staff_id = st.id
      LEFT JOIN machines m ON a.machine_id = m.id
      ORDER BY a.start_time ASC
    `).all();
        res.json(appointments);
    });
    app.delete("/api/appointments", (req, res) => {
        db.prepare("DELETE FROM appointments").run();
        res.json({ message: "All appointments cleared" });
    });
    app.delete("/api/appointments/:id", (req, res) => {
        const { id } = req.params;
        db.prepare("DELETE FROM appointments WHERE id = ?").run(id);
        res.json({ message: "Appointment deleted" });
    });
    app.delete("/api/appointments/patient/:name", (req, res) => {
        const { name } = req.params;
        db.prepare("DELETE FROM appointments WHERE patient_name = ?").run(name);
        res.json({ message: "Appointments for patient deleted" });
    });
    app.put("/api/appointments/:id", (req, res) => {
        const { id } = req.params;
        const { staff_id } = req.body;
        if (!staff_id) {
            db.prepare("UPDATE appointments SET staff_id = NULL WHERE id = ?").run(id);
        }
        else {
            db.prepare("UPDATE appointments SET staff_id = ? WHERE id = ?").run(staff_id, id);
        }
        res.json({ message: "Appointment updated" });
    });
    // === Endpoint kiểm tra server ===
    app.get("/api/health", (req, res) => {
        res.json({ status: 'ok', time: new Date().toISOString() });
    });
    app.post("/api/schedule", (req, res) => {
        const { patients, startTime } = req.body;
        const services = db.prepare("SELECT * FROM services").all();
        const staff = db.prepare("SELECT * FROM staff").all();
        const staffServices = db.prepare("SELECT * FROM staff_services").all();
        const settingsRows = db.prepare("SELECT * FROM settings").all();
        const settings = settingsRows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
        const scheduledAppointments = [];
        const staffTimeline = {};
        const patientTimeline = {};
        const machineAllocations = {};
        const bedTimeline = [];
        const unassignedPatients = [];
        const allMachines = db.prepare("SELECT * FROM machines").all();
        allMachines.forEach(m => machineAllocations[m.id] = []);
        staff.forEach(s => staffTimeline[s.id] = []);
        // === Load nghỉ phép nhân sự cho ngày scheduling ===
        const scheduleDate = startTime ? new Date(startTime).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
        const staffLeaves = db.prepare("SELECT * FROM staff_leaves WHERE leave_date = ?").all(scheduleDate);
        const staffLeavesMap = {};
        staffLeaves.forEach(leave => {
            if (!staffLeavesMap[leave.staff_id]) staffLeavesMap[leave.staff_id] = [];
            staffLeavesMap[leave.staff_id].push(leave);
        });
        // Prepopulate timelines from existing appointments to avoid overlaps
        const existingApps = db.prepare("SELECT * FROM appointments").all();
        existingApps.forEach(app => {
            const svc = services.find(s => s.id === app.service_id);
            if (!svc || !app.staff_id)
                return;
            const start = new Date(app.start_time).getTime();
            const actionEnd = start + svc.non_overlap_time * 60 * 1000;
            const finishEnd = start + svc.total_time * 60 * 1000;
            const bedEnd = start + svc.bed_occupancy_time * 60 * 1000;
            if (!patientTimeline[app.patient_name])
                patientTimeline[app.patient_name] = [];
            patientTimeline[app.patient_name].push({ start, end: finishEnd });
            bedTimeline.push({ start, end: bedEnd });
            if (app.machine_id) {
                if (!machineAllocations[app.machine_id])
                    machineAllocations[app.machine_id] = [];
                machineAllocations[app.machine_id].push({ start, end: finishEnd });
            }
            if (svc.is_exclusive_staff) {
                staffTimeline[app.staff_id].push({ start, end: finishEnd, type: 'action' });
            }
            else {
                staffTimeline[app.staff_id].push({ start, end: actionEnd, type: 'action' });
            }
        });
        const baseTime = startTime ? new Date(startTime).getTime() : new Date().getTime();
        // Convert baseTime to its midnight
        const baseDate = new Date(baseTime);
        baseDate.setHours(0, 0, 0, 0);
        const midnightTime = baseDate.getTime();
        const MIN_GAP = 1 * 60 * 1000; // 1 minute gap between services for same staff
        const parseTimeStr = (t) => {
            const parts = t.split(':');
            return parseInt(parts[0]) * 60 + parseInt(parts[1]);
        };
        const mStartMins = parseTimeStr(settings.morning_start || '07:30');
        const mEndMins = parseTimeStr(settings.morning_end || '11:30');
        const aStartMins = parseTimeStr(settings.afternoon_start || '13:30');
        const aEndMins = parseTimeStr(settings.afternoon_end || '17:00');
        const enableLunchOt = settings.enable_lunch_ot === 'true';
        const lOtEndMins = parseTimeStr(settings.lunch_ot_end || '12:30');
        const enableEveningOt = settings.enable_evening_ot === 'true';
        const eOtEndMins = parseTimeStr(settings.evening_ot_end || '19:00');
        // --- Service priority order for scheduling ---
        const SERVICE_PRIORITY = ['xoa bóp', 'thủy châm', 'điện châm', 'hào châm', 'điện/hào châm', 'hồng ngoại', 'giác hơi', 'chườm'];
        const getSvcPriority = (svcName) => {
            const nameLow = svcName.toLowerCase();
            for (let i = 0; i < SERVICE_PRIORITY.length; i++) {
                if (nameLow.includes(SERVICE_PRIORITY[i]))
                    return i;
            }
            return SERVICE_PRIORITY.length;
        };
        // Group patients by pKey then sort each group's services by priority
        const patientGroups = {};
        patients.forEach((p) => {
            const pKey = p.stt || p.name;
            if (!patientGroups[pKey])
                patientGroups[pKey] = [];
            patientGroups[pKey].push(p);
        });
        // Build sorted patient list: sort services within each patient by priority
        const sortedPatients = [];
        const seenKeys = [];
        patients.forEach((p) => {
            const pKey = p.stt || p.name;
            if (!seenKeys.includes(pKey))
                seenKeys.push(pKey);
        });
        // Sort services within each patient by priority, no stagger offset
        seenKeys.forEach((pKey) => {
            const group = patientGroups[pKey];
            group.sort((a, b) => {
                const svcA = services.find((s) => s.id === a.service_id);
                const svcB = services.find((s) => s.id === b.service_id);
                return getSvcPriority(svcA?.name || '') - getSvcPriority(svcB?.name || '');
            });
            sortedPatients.push(...group);
        });
        // Giới hạn số bệnh nhân để tránh block quá lâu
        const MAX_PATIENTS = 200;
        if (sortedPatients.length > MAX_PATIENTS) {
            return res.status(400).json({ error: `Quá nhiều bệnh nhân (${sortedPatients.length}). Tối đa ${MAX_PATIENTS} mỗi lần.` });
        }
        sortedPatients.forEach((p) => {
            const service = services.find(s => s.id === p.service_id);
            if (!service) {
                unassignedPatients.push({ ...p, reason: 'Không tìm thấy cấu hình DVKT' });
                return;
            }
            const pKey = p.stt || p.name;
            if (!patientTimeline[pKey])
                patientTimeline[pKey] = [];
            let foundSlot = false;
            let finalSlotData = null;
            let loopCount = 0;
            const MAX_LOOP = 1500; // Giới hạn vòng lặp tránh hang
            // Only look at THIS session's new appointments (not pre-existing from DB) to find last end time
            const sessionAppsForPatient = scheduledAppointments.filter(a => {
                const aKey = a.stt || a.patient_name;
                return aKey === pKey;
            });
            // Lấy thứ tự của bệnh nhân trong lượt xếp lịch này
            const patientIndex = seenKeys.indexOf(pKey);
            // Độ trễ để dành chỗ cho Tạo phiếu (1p) và Y lệnh (1p) duy nhất cho mỗi BN.
            // BN thứ i cần (i*2 + 2) phút trống sau giờ mở cửa.
            const staggerMins = (patientIndex * 2) + 2;
            let patientLastEndTime = midnightTime + (mStartMins + staggerMins) * 60 * 1000;
            if (sessionAppsForPatient.length > 0) {
                const lastApp = sessionAppsForPatient[sessionAppsForPatient.length - 1];
                const lastSvc = services.find(s => s.id === lastApp.service_id);
                if (lastSvc) {
                    const lastStart = new Date(lastApp.start_time).getTime();
                    const hasIdleTime = !lastSvc.is_exclusive_staff && lastSvc.non_overlap_time < lastSvc.total_time;
                    if (hasIdleTime) {
                        patientLastEndTime = lastStart + lastSvc.non_overlap_time * 60 * 1000 + MIN_GAP;
                    }
                    else {
                        patientLastEndTime = lastStart + lastSvc.total_time * 60 * 1000 + MIN_GAP;
                    }
                }
            }
            for (let pass = 1; pass <= 2; pass++) {
                loopCount = 0;
                let attemptTime = patientLastEndTime;
                while (!foundSlot && attemptTime < midnightTime + 24 * 60 * 60 * 1000 && loopCount < MAX_LOOP) {
                    loopCount++;
                    const attemptDate = new Date(attemptTime);
                    const attemptMins = attemptDate.getHours() * 60 + attemptDate.getMinutes();
                    // Ép thời gian bắt đầu tối thiểu theo Stagger khi chuyển ca (Session)
                    if (attemptMins < mStartMins + staggerMins) {
                        attemptTime = midnightTime + (mStartMins + staggerMins) * 60 * 1000;
                        continue;
                    }
                    else if (attemptMins >= mEndMins && attemptMins < aStartMins && !enableLunchOt) {
                        attemptTime = midnightTime + aStartMins * 60 * 1000;
                        continue;
                    }
                    else if (enableLunchOt && attemptMins >= lOtEndMins && attemptMins < aStartMins) {
                        attemptTime = midnightTime + aStartMins * 60 * 1000;
                        continue;
                    }
                    // Find eligible staff based on role AND allowed services AND leave status
                    const eligibleStaff = staff.filter(s => {
                        // === CHECK NGHỈ PHÉP ===
                        const leaves = staffLeavesMap[s.id];
                        if (leaves) {
                            for (const leave of leaves) {
                                if (leave.leave_type === 'full_day') {
                                    return false; // Nghỉ cả ngày → loại hoàn toàn
                                }
                                if (leave.leave_type === 'time_range' && leave.start_time && leave.end_time) {
                                    // Tính thời gian nghỉ
                                    const leaveParts = leave.start_time.split(':');
                                    const leaveStartMins = parseInt(leaveParts[0]) * 60 + parseInt(leaveParts[1]);
                                    const leaveEndParts = leave.end_time.split(':');
                                    const leaveEndMins = parseInt(leaveEndParts[0]) * 60 + parseInt(leaveEndParts[1]);
                                    // Tính thời gian thao tác DVKT
                                    const attemptDate2 = new Date(attemptTime);
                                    const dvktStartMins = attemptDate2.getHours() * 60 + attemptDate2.getMinutes();
                                    const dvktEndMins = dvktStartMins + service.non_overlap_time;
                                    // Check overlap: nếu thời gian DVKT chồng lên thời gian nghỉ → loại
                                    if (dvktStartMins < leaveEndMins && dvktEndMins > leaveStartMins) {
                                        return false;
                                    }
                                }
                            }
                        }
                        // === CHECK ROLE ===
                        if (service.required_role) {
                            const reqRoles = service.required_role.split(',').map((r) => r.trim());
                            if (!reqRoles.includes(s.role))
                                return false;
                        }
                        const allowed = staffServices.filter(ss => ss.staff_id === s.id).map(ss => ss.service_id);
                        if (allowed.length > 0 && !allowed.includes(service.id))
                            return false;
                        return true;
                    });
                    if (eligibleStaff.length === 0) {
                        if (pass === 2) {
                            unassignedPatients.push({ ...p, service: service.name, reason: `Không có Nhân viên nào nhận DVKT này` });
                        }
                        break; // break the while loop, don't schedule
                    }
                    for (const s of eligibleStaff) {
                        const actionStart = attemptTime;
                        const actionEnd = actionStart + service.non_overlap_time * 60 * 1000;
                        const totalEnd = actionStart + service.total_time * 60 * 1000;
                        const bedEnd = actionStart + service.bed_occupancy_time * 60 * 1000;
                        // Kiểm tra NV có bận không: kết thúc ca trước + MIN_GAP mới được bắt đầu ca mới
                        // Dùng actionEnd (non_overlap_time) cho non-exclusive, totalEnd cho exclusive
                        // QUAN TRỌNG: Dùng >= thay vì > để BẮT BUỘC khoảng cách, không cho trùng giờ
                        const isStaffBusy = service.is_exclusive_staff
                            ? staffTimeline[s.id].some(busy => actionStart < (busy.end + MIN_GAP) && (totalEnd + MIN_GAP) > busy.start)
                            : staffTimeline[s.id].some(busy => {
                                if (busy.type === 'action') {
                                    // Phải cách nhau ít nhất MIN_GAP (1 phút)
                                    // actionStart phải >= busy.end + MIN_GAP (không cho bằng nhau)
                                    return actionStart < (busy.end + MIN_GAP) && (actionEnd + MIN_GAP) > busy.start;
                                }
                                return false;
                            });
                        const tooClose = false; // Đã tích hợp MIN_GAP vào isStaffBusy
                        const activeBeds = bedTimeline.filter(busy => actionStart < busy.end && bedEnd > busy.start).length;
                        const isBedBusy = activeBeds >= 10;
                        // BN check: các DVKT trên cùng 1 BN phải cách nhau ít nhất MIN_GAP
                        let isPatientBusy = patientTimeline[pKey].some(busy => actionStart < (busy.end + MIN_GAP) && (totalEnd + MIN_GAP) > busy.start);
                        // ========== LOGIC LỒNG CHÉO DVKT TỔNG QUÁT ==========
                        // Quy tắc dựa hoàn toàn trên cấu hình DVKT, không hardcode tên dịch vụ:
                        //
                        // 1. DVKT mới có no_patient_overlap = true
                        //    => KHÔNG cho phép lồng chéo (BN phải chờ xong DVKT cũ)
                        //
                        // 2. DVKT mới (service) là "chiếm trọn NV" (is_exclusive_staff)
                        //    HOẶC non_overlap_time >= total_time (không có thời gian rảnh)
                        //    => KHÔNG cho phép lồng chéo (BN phải chờ xong DVKT cũ)
                        //
                        // 3. DVKT cũ (clashing) là "chiếm trọn NV" 
                        //    HOẶC non_overlap_time >= total_time
                        //    HOẶC no_patient_overlap = true
                        //    => KHÔNG cho phép lồng chéo
                        //
                        // 4. Cả hai DVKT đều có thời gian rảnh (idle > 0)
                        //    => Cho phép lồng chéo NẾU:
                        //    a) Giờ bắt đầu KHÁC nhau
                        //    b) Giờ kết thúc KHÁC nhau  
                        //    c) DVKT mới bắt đầu SAU phần bận của DVKT cũ (non_overlap_time + 1p)
                        //    d) Nếu cùng NV: DVKT mới bắt đầu sau non_overlap_time của DVKT cũ + 1p
                        //       (đã được xử lý ở staffTimeline check)
                        //
                        const newServiceHasIdleTime = !service.is_exclusive_staff &&
                            !service.no_patient_overlap &&
                            service.non_overlap_time < service.total_time;
                        if (isPatientBusy && newServiceHasIdleTime) {
                            const canOverlapAll = patientTimeline[pKey].every(busy => {
                                const clashing = (actionStart < busy.end && totalEnd > busy.start);
                                if (!clashing)
                                    return true; // Không chồng chéo -> OK
                                // Tìm DVKT đang chồng chéo
                                const clashingApp = scheduledAppointments.find(a => a.patient_name === p.name &&
                                    new Date(a.start_time).getTime() === busy.start);
                                if (!clashingApp)
                                    return false; // Không xác định -> block
                                const clashingSvc = services.find(sv => sv.id === clashingApp.service_id);
                                if (!clashingSvc)
                                    return false;
                                
                                // Kiểm tra cùng Nhân viên -> CẮT (KHÔNG LỒNG) nếu cùng 1 nhân viên phục vụ
                                if (clashingApp.staff_id === s.id) {
                                    return false; // Tuyệt đối không cho trùng giờ kết quả cùng 1 nhân viên
                                }

                                // ===== CUSTOM IDLE OVERLAP LOGIC =====
                                const newAllowList = service.allow_idle_overlap_with ? service.allow_idle_overlap_with.split(',').map(x=>x.trim()) : [];
                                const newDenyList = service.deny_idle_overlap_with ? service.deny_idle_overlap_with.split(',').map(x=>x.trim()) : [];
                                const oldAllowList = clashingSvc.allow_idle_overlap_with ? clashingSvc.allow_idle_overlap_with.split(',').map(x=>x.trim()) : [];
                                const oldDenyList = clashingSvc.deny_idle_overlap_with ? clashingSvc.deny_idle_overlap_with.split(',').map(x=>x.trim()) : [];
                                
                                const idNewStr = String(service.id);
                                const idOldStr = String(clashingSvc.id);

                                // 1. Nếu nằm trong DANH SÁCH CẤM của nhau -> BLOCK
                                if (newDenyList.includes(idOldStr) || oldDenyList.includes(idNewStr)) {
                                    return false; 
                                }

                                // 2. Nếu nằm trong DANH SÁCH CHO PHÉP của nhau -> ALLOW
                                const isExplicitlyAllowed = newAllowList.includes(idOldStr) || oldAllowList.includes(idNewStr);

                                // Nếu KHÔNG ĐƯỢC chỉ định trong bất kỳ list nào, ta dùng logic fallback mặc định
                                if (!isExplicitlyAllowed) {
                                    // Kiểm tra DVKT cũ có no_patient_overlap không
                                    if (clashingSvc.no_patient_overlap)
                                        return false; // DVKT cũ cấm trùng BN -> KHÔNG cho lồng
                                    // Kiểm tra DVKT cũ có thời gian rảnh không
                                    const oldHasIdleTime = !clashingSvc.is_exclusive_staff &&
                                        clashingSvc.non_overlap_time < clashingSvc.total_time;
                                    // Nếu DVKT cũ KHÔNG có thời gian rảnh -> KHÔNG cho lồng
                                    if (!oldHasIdleTime)
                                        return false;
                                }

                                // Dù explicitly allowed hoặc default fallback, VẪN phải đảm bảo thời gian logic:
                                // Giờ bắt đầu/kết thúc PHẢI khác nhau rành mạch, cách ít nhất MIN_GAP
                                if (actionStart === busy.start)
                                    return false;
                                const clashingTotalEnd = busy.start + clashingSvc.total_time * 60 * 1000;
                                if (totalEnd === clashingTotalEnd)
                                    return false;
                                // CẤM: Giờ bắt đầu DVKT mới = giờ kết thúc DVKT cũ (hoặc ngược lại)
                                if (actionStart <= clashingTotalEnd && actionStart >= (clashingTotalEnd - MIN_GAP))
                                    return false;
                                if (totalEnd <= busy.start + MIN_GAP && totalEnd >= busy.start)
                                    return false;
                                // Xác định DVKT nào bắt đầu trước để kiểm tra thời gian rảnh
                                if (busy.start <= actionStart) {
                                    const oldBusyEnd = busy.start + clashingSvc.non_overlap_time * 60 * 1000;
                                    if (actionStart < oldBusyEnd + MIN_GAP)
                                        return false;
                                }
                                else {
                                    const newBusyEnd = actionStart + service.non_overlap_time * 60 * 1000;
                                    if (busy.start < newBusyEnd + MIN_GAP)
                                        return false;
                                }
                                return true; // Tất cả điều kiện đều thỏa -> cho phép lồng
                            });
                            if (canOverlapAll)
                                isPatientBusy = false;
                        }
                        // Check specific machine availability
                        let assignedMachineId = null;
                        if (service.requires_machine) {
                            const machinesForSvc = allMachines.filter(m => m.service_id === service.id);
                            for (const m of machinesForSvc) {
                                const isMbusy = machineAllocations[m.id].some(busy => actionStart < busy.end && totalEnd > busy.start);
                                if (!isMbusy) {
                                    assignedMachineId = m.id;
                                    break;
                                }
                            }
                        }
                        // ========== RÀNG BUỘC CỨNG: GIỜ KẾT THÚC THỰC TẾ KHÔNG ĐƯỢC TRÙNG ==========
                        // Tính giờ kết thúc thực tế (totalEnd = start + total_time) của TẤT CẢ DVKT đã xếp
                        // rồi so sánh với totalEnd của DVKT mới
                        let hasEndConflict = false;
                        for (const existingApp of scheduledAppointments) {
                            const existSvc = services.find(sv => sv.id === existingApp.service_id);
                            if (!existSvc) continue;
                            const existStart = new Date(existingApp.start_time).getTime();
                            const existTotalEnd = existStart + existSvc.total_time * 60 * 1000;
                            const existActionEnd = existStart + existSvc.non_overlap_time * 60 * 1000;
                            const existKey = existingApp.stt || existingApp.patient_name;
                            const isSamePatient = (existKey === pKey);
                            const isSameStaff = (existingApp.staff_id === s.id);
                            
                            if (isSamePatient || isSameStaff) {
                                // 1. Giờ KẾT THÚC THỰC TẾ không được bằng nhau (±MIN_GAP)
                                if (Math.abs(totalEnd - existTotalEnd) < MIN_GAP) {
                                    hasEndConflict = true;
                                    break;
                                }
                                // 2. Giờ BẮT ĐẦU mới không được = Giờ KẾT THÚC THỰC TẾ cũ (±MIN_GAP)
                                if (Math.abs(actionStart - existTotalEnd) < MIN_GAP) {
                                    hasEndConflict = true;
                                    break;
                                }
                                // 3. Giờ KẾT THÚC THỰC TẾ mới không được = Giờ BẮT ĐẦU cũ (±MIN_GAP)
                                if (Math.abs(totalEnd - existStart) < MIN_GAP) {
                                    hasEndConflict = true;
                                    break;
                                }
                            }
                            // 4. Cùng NV: giờ kết thúc THAO TÁC cũng không được trùng
                            if (isSameStaff) {
                                if (Math.abs(actionEnd - existActionEnd) < MIN_GAP) {
                                    hasEndConflict = true;
                                    break;
                                }
                            }
                        }
                        if (!isStaffBusy && !tooClose && (!service.requires_machine || assignedMachineId) && !isBedBusy && !isPatientBusy && !hasEndConflict) {
                            finalSlotData = { s, actionStart, actionEnd, totalEnd, bedEnd, assignedMachineId };
                            foundSlot = true;
                            break;
                        }
                    }
                    if (!foundSlot)
                        attemptTime += 1 * 60 * 1000; // Tăng 1 phút mỗi bước kiểm tra
                }
                if (foundSlot)
                    break;
            }
            if (foundSlot && finalSlotData) {
                const { s, actionStart, actionEnd, totalEnd, bedEnd } = finalSlotData;
                if (service.is_exclusive_staff) {
                    staffTimeline[s.id].push({ start: actionStart, end: totalEnd, type: 'action' });
                }
                else {
                    staffTimeline[s.id].push({ start: actionStart, end: actionEnd, type: 'action' });
                }
                patientTimeline[pKey].push({ start: actionStart, end: totalEnd });
                if (finalSlotData.assignedMachineId) {
                    machineAllocations[finalSlotData.assignedMachineId].push({ start: actionStart, end: totalEnd });
                }
                bedTimeline.push({ start: actionStart, end: bedEnd });
                scheduledAppointments.push({
                    patient_name: p.name,
                    service_id: service.id,
                    staff_id: s.id,
                    machine_id: finalSlotData.assignedMachineId,
                    start_time: new Date(actionStart).toISOString(),
                    status: 'scheduled'
                });
            }
            if (!foundSlot) {
                const reasons = unassignedPatients.map(u => u.name);
                if (!reasons.includes(p.name)) {
                    unassignedPatients.push({ ...p, service: service.name, reason: 'Phòng khám đã hết sức chứa / bị kẹt lịch' });
                }
            }
        });
        const insert = db.prepare("INSERT INTO appointments (patient_name, service_id, staff_id, machine_id, start_time) VALUES (?, ?, ?, ?, ?)");
        const transaction = db.transaction((apps) => {
            for (const app of apps) {
                insert.run(app.patient_name, app.service_id, app.staff_id, app.machine_id || null, app.start_time);
            }
        });
        transaction(scheduledAppointments);
        if (unassignedPatients.length > 0) {
            res.status(200).json({ scheduled: scheduledAppointments, unassigned: unassignedPatients });
        }
        else {
            res.json({ scheduled: scheduledAppointments, unassigned: [] });
        }
    });
    if (process.env.NODE_ENV !== "production") {
        const { createServer: createViteServer } = await import("vite");
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: "spa",
        });
        app.use(vite.middlewares);
    }
    else {
        const publicPath = path.join(__dirname, "public");
        app.use(express.static(publicPath));
        app.get("*", (req, res) => res.sendFile(path.join(publicPath, "index.html")));
    }
    const PORT = portArg !== undefined ? portArg : (Number(process.env.PORT) || 3000);
    return new Promise((resolve) => {
        const server = app.listen(PORT, "0.0.0.0", () => {
            const actualPort = server.address().port;
            console.log(`Server running on http://localhost:${actualPort}`);
            resolve({ port: actualPort, server });
        });
    });
}
// start server automatically if not imported
if (process.env.IS_ELECTRON !== "true") {
    startServer();
}
