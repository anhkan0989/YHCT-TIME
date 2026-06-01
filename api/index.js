import express from "express";
import cors from "cors";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// --- ADMIN API ---
app.post("/api/admin/login", (req, res) => {
    const { username, password } = req.body;
    if (username === "anhkan" && password === "020609") {
        res.cookie("admin_auth", "true", { path: "/" });
        res.json({ success: true });
    } else {
        res.status(401).json({ error: "Sai tài khoản hoặc mật khẩu" });
    }
});

app.get("/api/admin/clinics", async (req, res) => {
    if (req.cookies.admin_auth !== "true") return res.status(403).json({ error: "Forbidden" });
    
    const { data: settings } = await supabase.from("settings").select("tenant_id");
    const { data: staff } = await supabase.from("staff").select("tenant_id");
    const { data: apps } = await supabase.from("appointments").select("tenant_id");
    
    let allTenants = new Set();
    (settings || []).forEach(d => d.tenant_id && allTenants.add(d.tenant_id));
    (staff || []).forEach(d => d.tenant_id && allTenants.add(d.tenant_id));
    (apps || []).forEach(d => d.tenant_id && allTenants.add(d.tenant_id));
    
    res.json(Array.from(allTenants));
});

app.delete("/api/admin/clinics/:id", async (req, res) => {
    if (req.cookies.admin_auth !== "true") return res.status(403).json({ error: "Forbidden" });
    const tenantId = req.params.id;
    if (!tenantId) return res.status(400).json({ error: "Missing tenant ID" });

    await supabase.from("appointments").delete().eq("tenant_id", tenantId);
    await supabase.from("staff_leaves").delete().eq("tenant_id", tenantId);
    await supabase.from("machines").delete().eq("tenant_id", tenantId);
    await supabase.from("services").delete().eq("tenant_id", tenantId);
    await supabase.from("staff").delete().eq("tenant_id", tenantId);
    await supabase.from("settings").delete().eq("tenant_id", tenantId);
    
    res.json({ message: "Đã xóa toàn bộ dữ liệu của đơn vị: " + tenantId });
});
// --- END ADMIN API ---


app.get("/api/settings", async (req, res) => {
    const tenantId = req.cookies.tenant_id;
    let query = supabase.from("settings").select("*");
    if (tenantId) query = query.eq("tenant_id", tenantId);
    const { data } = await query;
    res.json((data || []).reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {}));
});

app.put("/api/settings", async (req, res) => {
    const tenantId = req.cookies.tenant_id;
    const updates = req.body;
    const entries = Object.keys(updates).map(key => ({ 
        key, 
        value: updates[key],
        tenant_id: tenantId || null
    }));
    const { error } = await supabase.from("settings").upsert(entries);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: "Settings updated" });
});

app.get("/api/staff", async (req, res) => {
    const tenantId = req.cookies.tenant_id;
    let staffQuery = supabase.from("staff").select("*");
    if (tenantId) staffQuery = staffQuery.eq("tenant_id", tenantId);
    const { data: staff } = await staffQuery;
    
    const { data: staffServices } = await supabase.from("staff_services").select("*");
    
    const mappedStaff = (staff || []).map(s => {
        s.allowed_services = (staffServices || []).filter(ss => ss.staff_id === s.id).map(ss => ss.service_id);
        return s;
    });
    res.json(mappedStaff);
});

app.post("/api/staff", async (req, res) => {
    const tenantId = req.cookies.tenant_id;
    const { name, role, allowed_services } = req.body;
    const { data: info, error } = await supabase.from("staff").insert({ 
        name, role, tenant_id: tenantId || null 
    }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    
    if (allowed_services && allowed_services.length) {
        const svcs = allowed_services.map(svc => ({ staff_id: info.id, service_id: svc }));
        await supabase.from("staff_services").insert(svcs);
    }
    res.json({ id: info.id, message: "Staff created" });
});

app.post("/api/staff/bulk", async (req, res) => {
    const tenantId = req.cookies.tenant_id;
    const { staffs } = req.body;
    for (const s of staffs) {
        const { data: info } = await supabase.from("staff").insert({ 
            name: s.name, role: s.role, tenant_id: tenantId || null 
        }).select().single();
        if (s.allowed_services && s.allowed_services.length && info) {
            const svcs = s.allowed_services.map(svc => ({ staff_id: info.id, service_id: svc }));
            await supabase.from("staff_services").insert(svcs);
        }
    }
    res.json({ message: "Staff imported successfully" });
});

app.put("/api/staff/:id", async (req, res) => {
    const { id } = req.params;
    const { name, role, allowed_services } = req.body;
    await supabase.from("staff").update({ name, role }).eq("id", id);
    await supabase.from("staff_services").delete().eq("staff_id", id);
    
    if (allowed_services && allowed_services.length) {
        const svcs = allowed_services.map(svc => ({ staff_id: id, service_id: svc }));
        await supabase.from("staff_services").insert(svcs);
    }
    res.json({ message: "Staff updated successfully" });
});

app.delete("/api/staff/:id", async (req, res) => {
    const { id } = req.params;
    await supabase.from("staff").delete().eq("id", id);
    res.json({ message: "Staff deleted" });
});

app.get("/api/services", async (req, res) => {
    const tenantId = req.cookies.tenant_id;
    let query = supabase.from("services").select("*");
    if (tenantId) query = query.eq("tenant_id", tenantId);
    const { data } = await query;
    res.json(data || []);
});

app.post("/api/services", async (req, res) => {
    let { id, name, total_time, non_overlap_time, requires_machine, bed_occupancy_time, is_exclusive_staff, no_patient_overlap, required_role, allow_idle_overlap_with, deny_idle_overlap_with } = req.body;
    total_time = parseInt(total_time) || 0;
    non_overlap_time = parseInt(non_overlap_time) || 0;
    bed_occupancy_time = parseInt(bed_occupancy_time) || total_time;
    if (!name) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    
    const tenantId = req.cookies.tenant_id;
    const newId = id || Math.random().toString(36).substr(2, 9);

    const { data, error } = await supabase.from("services").insert({
        id: newId, name, total_time, non_overlap_time, requires_machine: requires_machine ? true : false, 
        bed_occupancy_time, is_exclusive_staff: is_exclusive_staff ? true : false, 
        no_patient_overlap: no_patient_overlap ? true : false, required_role: required_role || '', 
        allow_idle_overlap_with: allow_idle_overlap_with || '', deny_idle_overlap_with: deny_idle_overlap_with || '',
        tenant_id: tenantId || null
    }).select().single();
    
    if (error) return res.status(400).json({ error: error.message });
    res.json({ id: data.id, message: "Service added" });
});

app.put("/api/services/:id", async (req, res) => {
    const { id } = req.params;
    let { name, total_time, non_overlap_time, requires_machine, bed_occupancy_time, is_exclusive_staff, no_patient_overlap, required_role, allow_idle_overlap_with, deny_idle_overlap_with } = req.body;
    total_time = parseInt(total_time) || 0;
    non_overlap_time = parseInt(non_overlap_time) || 0;
    bed_occupancy_time = parseInt(bed_occupancy_time) || total_time;
    const { error } = await supabase.from("services").update({
        name, total_time, non_overlap_time, requires_machine: requires_machine ? true : false, 
        bed_occupancy_time, is_exclusive_staff: is_exclusive_staff ? true : false, 
        no_patient_overlap: no_patient_overlap ? true : false, required_role: required_role || '', 
        allow_idle_overlap_with: allow_idle_overlap_with || '', deny_idle_overlap_with: deny_idle_overlap_with || ''
    }).eq("id", id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: "Service updated" });
});

app.delete("/api/services/:id", async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from("services").delete().eq("id", id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: "Service deleted" });
});

app.get("/api/staff-leaves", async (req, res) => {
    const tenantId = req.cookies.tenant_id;
    const { date, staff_id } = req.query;
    let query = supabase.from("staff_leaves").select("*, staff:staff_id(name)");
    if (tenantId) query = query.eq("tenant_id", tenantId);
    if (date) query = query.eq("leave_date", date);
    if (staff_id) query = query.eq("staff_id", staff_id);
    
    const { data } = await query;
    const mapped = (data || []).map(d => ({...d, staff_name: d.staff?.name}));
    res.json(mapped.sort((a, b) => new Date(b.leave_date).getTime() - new Date(a.leave_date).getTime()));
});

app.post("/api/staff-leaves", async (req, res) => {
    const tenantId = req.cookies.tenant_id;
    const { staff_id, leave_date, leave_type, start_time, end_time, reason } = req.body;
    const { data, error } = await supabase.from("staff_leaves").insert({
        staff_id, leave_date, leave_type, start_time: start_time || null, end_time: end_time || null, reason: reason || null,
        tenant_id: tenantId || null
    }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ id: data.id, message: "Đã tạo nghỉ phép" });
});

app.put("/api/staff-leaves/:id", async (req, res) => {
    const { id } = req.params;
    const { staff_id, leave_date, leave_type, start_time, end_time, reason } = req.body;
    await supabase.from("staff_leaves").update({
        staff_id, leave_date, leave_type, start_time: start_time || null, end_time: end_time || null, reason: reason || null
    }).eq("id", id);
    res.json({ message: "Đã cập nhật nghỉ phép" });
});

app.delete("/api/staff-leaves/:id", async (req, res) => {
    const { id } = req.params;
    await supabase.from("staff_leaves").delete().eq("id", id);
    res.json({ message: "Đã xóa nghỉ phép" });
});

app.get("/api/machines", async (req, res) => {
    const tenantId = req.cookies.tenant_id;
    let query = supabase.from("machines").select("*");
    if (tenantId) query = query.eq("tenant_id", tenantId);
    const { data } = await query;
    res.json(data || []);
});

app.post("/api/machines", async (req, res) => {
    const tenantId = req.cookies.tenant_id;
    const { name, service_id, capacity } = req.body;
    const { data, error } = await supabase.from("machines").insert({
        name, service_id: service_id || null, capacity: capacity || 1, tenant_id: tenantId || null
    }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ id: data.id, message: "Machine created" });
});

app.put("/api/machines/:id", async (req, res) => {
    const { id } = req.params;
    const { name, service_id, capacity } = req.body;
    await supabase.from("machines").update({
        name, service_id: service_id || null, capacity: capacity || 1
    }).eq("id", id);
    res.json({ message: "Machine updated" });
});

app.delete("/api/machines/:id", async (req, res) => {
    const { id } = req.params;
    await supabase.from("machines").delete().eq("id", id);
    res.json({ message: "Machine deleted" });
});

app.get("/api/appointments", async (req, res) => {
    const tenantId = req.cookies.tenant_id;
    let query = supabase.from("appointments").select("*, services(name), staff(name), machines(name)");
    if (tenantId) query = query.eq("tenant_id", tenantId);
    const { data } = await query.order("start_time", { ascending: true });
    const mapped = (data || []).map(a => ({
        ...a,
        service_name: a.services?.name,
        staff_name: a.staff?.name,
        machine_name: a.machines?.name
    }));
    res.json(mapped);
});

app.delete("/api/appointments", async (req, res) => {
    const tenantId = req.cookies.tenant_id;
    let query = supabase.from("appointments").delete().neq("id", 0);
    if (tenantId) query = query.eq("tenant_id", tenantId);
    await query;
    res.json({ message: "All appointments cleared" });
});

app.delete("/api/appointments/:id", async (req, res) => {
    const { id } = req.params;
    if (id !== "patient") {
        await supabase.from("appointments").delete().eq("id", id);
        res.json({ message: "Appointment deleted" });
    } else {
        res.status(400).send("Invalid");
    }
});

app.delete("/api/appointments/patient/:name", async (req, res) => {
    const { name } = req.params;
    const tenantId = req.cookies.tenant_id;
    let query = supabase.from("appointments").delete().eq("patient_name", name);
    if (tenantId) query = query.eq("tenant_id", tenantId);
    await query;
    res.json({ message: "Appointments for patient deleted" });
});

app.put("/api/appointments/:id", async (req, res) => {
    const { id } = req.params;
    const { staff_id } = req.body;
    await supabase.from("appointments").update({ staff_id: staff_id || null }).eq("id", id);
    res.json({ message: "Appointment updated" });
});

app.get("/api/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

app.post("/api/schedule", async (req, res) => {
    const { patients, startTime } = req.body;
    const scheduleDate = startTime ? new Date(startTime).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    
    const tenantId = req.cookies.tenant_id;
    let servicesQuery = supabase.from("services").select("*");
    let staffQuery = supabase.from("staff").select("*");
    let settingsQuery = supabase.from("settings").select("*");
    let machinesQuery = supabase.from("machines").select("*");
    let leavesQuery = supabase.from("staff_leaves").select("*").eq("leave_date", scheduleDate);
    let appsQuery = supabase.from("appointments").select("*");

    if (tenantId) {
        servicesQuery = servicesQuery.eq("tenant_id", tenantId);
        staffQuery = staffQuery.eq("tenant_id", tenantId);
        settingsQuery = settingsQuery.eq("tenant_id", tenantId);
        machinesQuery = machinesQuery.eq("tenant_id", tenantId);
        leavesQuery = leavesQuery.eq("tenant_id", tenantId);
        appsQuery = appsQuery.eq("tenant_id", tenantId);
    }

    const [servicesRes, staffRes, staffServicesRes, settingsRes, machinesRes, staffLeavesRes, existingAppsRes] = await Promise.all([
        servicesQuery,
        staffQuery,
        supabase.from("staff_services").select("*"),
        settingsQuery,
        machinesQuery,
        leavesQuery,
        appsQuery
    ]);

    const services = servicesRes.data || [];
    const staff = staffRes.data || [];
    const staffServices = staffServicesRes.data || [];
    const settingsRows = settingsRes.data || [];
    const allMachines = machinesRes.data || [];
    const staffLeaves = staffLeavesRes.data || [];
    const existingApps = existingAppsRes.data || [];
        
        const settings = settingsRows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
        const scheduledAppointments = [];
        const staffTimeline = {};
        const patientTimeline = {};
        const machineAllocations = {};
        const bedTimeline = [];
        const unassignedPatients = [];
        
        allMachines.forEach(m => machineAllocations[m.id] = []);
        staff.forEach(s => staffTimeline[s.id] = []);
        
        const staffLeavesMap = {};
        staffLeaves.forEach(leave => {
            if (!staffLeavesMap[leave.staff_id]) staffLeavesMap[leave.staff_id] = [];
            staffLeavesMap[leave.staff_id].push(leave);
        });
        // Prepopulate timelines from existing appointments to avoid overlaps
        
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
        // Calculate midnight in Vietnam time (UTC+7)
        const midnightTime = new Date(`${scheduleDate}T00:00:00+07:00`).getTime();
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
        const globalFirstServiceTimes = [];
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
        
        console.log(`[SCHEDULE] Bắt đầu xếp lịch cho ${sortedPatients.length} dịch vụ...`);
        
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
                    const lastStart = lastApp.start_time_ms;
                    const hasIdleTime = !lastSvc.is_exclusive_staff && lastSvc.non_overlap_time < lastSvc.total_time;
                    if (hasIdleTime) {
                        patientLastEndTime = lastStart + lastSvc.non_overlap_time * 60 * 1000 + MIN_GAP;
                    }
                    else {
                        patientLastEndTime = lastStart + lastSvc.total_time * 60 * 1000 + MIN_GAP;
                    }
                }
            }
            
            const machinesForSvc = service.requires_machine ? allMachines.filter(m => m.service_id === service.id) : [];

            for (let pass = 1; pass <= 3; pass++) {
                loopCount = 0;
                let attemptTime = patientLastEndTime;
                let currentEnableLunchOt = (pass >= 2) ? enableLunchOt : false;
                let currentEnableEveningOt = (pass === 3) ? enableEveningOt : false;
                while (!foundSlot && attemptTime < midnightTime + 24 * 60 * 60 * 1000 && loopCount < MAX_LOOP) {
                    loopCount++;
                    const attemptMins = Math.floor((attemptTime - midnightTime) / 60000);

                    if (!currentEnableEveningOt && attemptMins >= aEndMins) {
                        break;
                    }
                    if (currentEnableEveningOt && attemptMins >= eOtEndMins) {
                        break;
                    }

                    // Ép thời gian bắt đầu tối thiểu theo Stagger khi chuyển ca (Session)
                    if (attemptMins < mStartMins + staggerMins) {
                        attemptTime = midnightTime + (mStartMins + staggerMins) * 60 * 1000;
                        continue;
                    }
                    else if (attemptMins >= mEndMins && attemptMins < aStartMins && !currentEnableLunchOt) {
                        attemptTime = midnightTime + aStartMins * 60 * 1000;
                        continue;
                    }
                    else if (currentEnableLunchOt && attemptMins >= lOtEndMins && attemptMins < aStartMins) {
                        attemptTime = midnightTime + aStartMins * 60 * 1000;
                        continue;
                    }

                    // Đảm bảo Giờ Y lệnh/Tạo phiếu (suy ra từ Giờ thực hiện dịch vụ đầu tiên) không bị trùng lặp
                    if (sessionAppsForPatient.length === 0) {
                        let isTooClose = false;
                        for (let usedTime of globalFirstServiceTimes) {
                            if (Math.abs(attemptTime - usedTime) < 4 * 60 * 1000) {
                                isTooClose = true;
                                break;
                            }
                        }
                        if (isTooClose) {
                            attemptTime += 60 * 1000;
                            continue;
                        }
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
                                    const dvktStartMins = Math.floor((attemptTime - midnightTime) / 60000);
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
                        if (pass === 3) {
                            unassignedPatients.push({ ...p, service: service.name, reason: `Không có Nhân viên nào nhận DVKT này` });
                        }
                        break; // break the while loop, don't schedule
                    }
                    const patientStaffIds = sessionAppsForPatient.map(app => app.staff_id);
                    eligibleStaff.sort((a,b) => {
                        const aServed = patientStaffIds.includes(a.id) ? -1 : 0;
                        const bServed = patientStaffIds.includes(b.id) ? -1 : 0;
                        if (aServed !== bServed) return aServed - bServed;
                        return staffTimeline[a.id].length - staffTimeline[b.id].length;
                    });
                    const actionStart = attemptTime;
                    const actionEnd = actionStart + service.non_overlap_time * 60 * 1000;
                    const totalEnd = actionStart + service.total_time * 60 * 1000;
                    const bedEnd = actionStart + service.bed_occupancy_time * 60 * 1000;

                    const attemptEndMins = Math.floor((totalEnd - midnightTime) / 60000);
                    const fitsMorning = attemptMins >= mStartMins && attemptEndMins <= mEndMins;
                    const fitsLunchOt = currentEnableLunchOt && attemptMins >= mStartMins && attemptEndMins <= lOtEndMins;
                    const fitsAfternoon = attemptMins >= aStartMins && attemptEndMins <= aEndMins;
                    const fitsEveningOt = currentEnableEveningOt && attemptMins >= aStartMins && attemptEndMins <= eOtEndMins;
                    const exceedsShift = !fitsMorning && !fitsLunchOt && !fitsAfternoon && !fitsEveningOt;

                    if (exceedsShift) {
                        // Nhảy cóc đến ca làm việc tiếp theo để tiết kiệm vòng lặp (Fast-forward)
                        if (attemptMins < mStartMins) attemptTime = midnightTime + mStartMins * 60000;
                        else if (attemptMins >= mEndMins && currentEnableLunchOt && attemptMins < lOtStartMins) attemptTime = midnightTime + lOtStartMins * 60000;
                        else if (attemptMins >= (currentEnableLunchOt ? lOtEndMins : mEndMins) && attemptMins < aStartMins) attemptTime = midnightTime + aStartMins * 60000;
                        else if (attemptMins >= aEndMins && currentEnableEveningOt && attemptMins < eOtStartMins) attemptTime = midnightTime + eOtStartMins * 60000;
                        else {
                            // Hết giờ làm việc hôm nay
                            break;
                        }
                        continue;
                    }

                    const activeBeds = bedTimeline.filter(busy => actionStart < busy.end && bedEnd > busy.start).length;
                    const isBedBusy = activeBeds >= 10;
                    if (isBedBusy) {
                        attemptTime += 60000;
                        continue;
                    }

                    // BN check: các DVKT trên cùng 1 BN phải cách nhau ít nhất MIN_GAP
                    let isPatientBusy = patientTimeline[pKey].some(busy => actionStart < (busy.end + MIN_GAP) && (totalEnd + MIN_GAP) > busy.start);
                    
                    const newServiceHasIdleTime = !service.is_exclusive_staff &&
                        !service.no_patient_overlap &&
                        service.non_overlap_time < service.total_time;
                    
                    if (isPatientBusy && newServiceHasIdleTime) {
                        const canOverlapAll = patientTimeline[pKey].every(busy => {
                            const clashing = (actionStart < busy.end && totalEnd > busy.start);
                            if (!clashing) return true;
                            
                            const clashingApp = sessionAppsForPatient.find(a => a.start_time_ms === busy.start);
                            if (!clashingApp) return false;
                            const clashingSvc = services.find(sv => sv.id === clashingApp.service_id);
                            if (!clashingSvc) return false;
                            
                            const newAllowList = service.allow_idle_overlap_with ? service.allow_idle_overlap_with.split(',').map(x=>x.trim()) : [];
                            const newDenyList = service.deny_idle_overlap_with ? service.deny_idle_overlap_with.split(',').map(x=>x.trim()) : [];
                            const oldAllowList = clashingSvc.allow_idle_overlap_with ? clashingSvc.allow_idle_overlap_with.split(',').map(x=>x.trim()) : [];
                            const oldDenyList = clashingSvc.deny_idle_overlap_with ? clashingSvc.deny_idle_overlap_with.split(',').map(x=>x.trim()) : [];
                            
                            const idNewStr = String(service.id);
                            const idOldStr = String(clashingSvc.id);

                            if (newDenyList.includes(idOldStr) || oldDenyList.includes(idNewStr)) return false; 
                            const isExplicitlyAllowed = newAllowList.includes(idOldStr) || oldAllowList.includes(idNewStr);

                            if (!isExplicitlyAllowed) {
                                if (clashingSvc.no_patient_overlap) return false;
                                const oldHasIdleTime = !clashingSvc.is_exclusive_staff && clashingSvc.non_overlap_time < clashingSvc.total_time;
                                if (!oldHasIdleTime) return false;
                            }

                            if (actionStart === busy.start) return false;
                            const clashingTotalEnd = busy.start + clashingSvc.total_time * 60 * 1000;
                            if (totalEnd === clashingTotalEnd) return false;
                            if (actionStart <= clashingTotalEnd && actionStart >= (clashingTotalEnd - MIN_GAP)) return false;
                            if (totalEnd <= busy.start + MIN_GAP && totalEnd >= busy.start) return false;
                            
                            if (busy.start <= actionStart) {
                                const oldBusyEnd = busy.start + clashingSvc.non_overlap_time * 60 * 1000;
                                if (actionStart < oldBusyEnd + MIN_GAP) return false;
                            } else {
                                const newBusyEnd = actionStart + service.non_overlap_time * 60 * 1000;
                                if (busy.start < newBusyEnd + MIN_GAP) return false;
                            }
                            return true;
                        });
                        if (canOverlapAll) isPatientBusy = false;
                    }
                    if (isPatientBusy) {
                        attemptTime += 60000;
                        continue;
                    }

                    // Check specific machine availability
                    let assignedMachineId = null;
                    if (service.requires_machine) {
                        // Sort inside loop because machineAllocations lengths might change if other patients are scheduled
                        machinesForSvc.sort((a,b) => machineAllocations[a.id].length - machineAllocations[b.id].length);
                        for (const m of machinesForSvc) {
                            const isMbusy = machineAllocations[m.id].some(busy => actionStart < busy.end && totalEnd > busy.start);
                            if (!isMbusy) {
                                assignedMachineId = m.id;
                                break;
                            }
                        }
                        if (!assignedMachineId) {
                            attemptTime += 60000;
                            continue;
                        }
                    }

                    // Check patient end conflicts
                    let hasPatientEndConflict = false;
                    for (const existingApp of sessionAppsForPatient) {
                        const existSvc = services.find(sv => sv.id === existingApp.service_id);
                        if (!existSvc) continue;
                        const existStart = existingApp.start_time_ms;
                        const existTotalEnd = existingApp.total_end_ms;
                        
                        if (Math.abs(totalEnd - existTotalEnd) < MIN_GAP) hasPatientEndConflict = true;
                        if (Math.abs(actionStart - existTotalEnd) < MIN_GAP) hasPatientEndConflict = true;
                        if (Math.abs(totalEnd - existStart) < MIN_GAP) hasPatientEndConflict = true;
                    }
                    if (hasPatientEndConflict) {
                        attemptTime += 60000;
                        continue;
                    }

                    let foundSlot = false;
                    let finalSlotData = null;

                    const appsByStaff = {};
                    for (const app of scheduledAppointments) {
                        if (!appsByStaff[app.staff_id]) appsByStaff[app.staff_id] = [];
                        appsByStaff[app.staff_id].push(app);
                    }

                    for (const s of eligibleStaff) {
                        // Kiểm tra NV có bận không
                        const isStaffBusy = service.is_exclusive_staff
                            ? staffTimeline[s.id].some(busy => actionStart < (busy.end + MIN_GAP) && (totalEnd + MIN_GAP) > busy.start)
                            : staffTimeline[s.id].some(busy => {
                                if (busy.type === 'action') {
                                    return actionStart < (busy.end + MIN_GAP) && (actionEnd + MIN_GAP) > busy.start;
                                }
                                return false;
                            });
                        if (isStaffBusy) continue;

                        // Ràng buộc cứng với nhân viên: giờ kết thúc THAO TÁC không được trùng
                        let hasStaffEndConflict = false;
                        
                        const staffApps = appsByStaff[s.id] || [];
                        for (const existingApp of staffApps) {
                            const existSvc = services.find(sv => sv.id === existingApp.service_id);
                            if (!existSvc) continue;
                            const existStart = existingApp.start_time_ms;
                            const existTotalEnd = existingApp.total_end_ms;
                            const existActionEnd = existingApp.action_end_ms;
                            
                            if (Math.abs(totalEnd - existTotalEnd) < MIN_GAP) hasStaffEndConflict = true;
                            if (Math.abs(actionStart - existTotalEnd) < MIN_GAP) hasStaffEndConflict = true;
                            if (Math.abs(totalEnd - existStart) < MIN_GAP) hasStaffEndConflict = true;
                            if (Math.abs(actionEnd - existActionEnd) < MIN_GAP) hasStaffEndConflict = true;
                        }
                        if (hasStaffEndConflict) continue;

                        finalSlotData = { s, actionStart, actionEnd, totalEnd, bedEnd, assignedMachineId };
                        foundSlot = true;
                        break;
                    }

                    if (!foundSlot)
                        attemptTime += 1 * 60 * 1000; // Tăng 1 phút mỗi bước kiểm tra
                }
                if (foundSlot) {
                    if (sessionAppsForPatient.length === 0) {
                        globalFirstServiceTimes.push(attemptTime);
                    }
                    break;
                }
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
                    stt: p.stt,
                    service_id: service.id,
                    staff_id: s.id,
                    machine_id: finalSlotData.assignedMachineId,
                    start_time: new Date(actionStart).toISOString(),
                    start_time_ms: actionStart,
                    action_end_ms: actionEnd,
                    total_end_ms: totalEnd,
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
        
    if (scheduledAppointments.length > 0) {
        const toInsert = scheduledAppointments.map(app => ({
            patient_name: app.patient_name,
            service_id: app.service_id,
            staff_id: app.staff_id,
            machine_id: app.machine_id,
            start_time: app.start_time,
            status: app.status
        }));
        await supabase.from("appointments").insert(toInsert);
    }
    
    console.log(`[SCHEDULE] Xếp lịch xong, thành công: ${scheduledAppointments.length}, Thất bại: ${unassignedPatients.length}`);
    res.json({ scheduled: scheduledAppointments, unassigned: unassignedPatients });
});

app.use(express.static(path.join(process.cwd(), "public")));
app.use((req, res) => {
    if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found" });
    if (req.path === "/admin") {
        return res.sendFile(path.join(process.cwd(), "public", "admin.html"));
    }
    if (!req.cookies.tenant_id) {
        res.sendFile(path.join(process.cwd(), "public", "landing.html"));
    } else {
        res.sendFile(path.join(process.cwd(), "public", "index.html"));
    }
});

export default app;