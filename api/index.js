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
            const staggerMins = (patientIndex * 2);
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
                let currentEnableLunchOt = (pass === 1) ? false : enableLunchOt;
                let currentEnableEveningOt = (pass === 1) ? false : enableEveningOt;
                while (!foundSlot && attemptTime < midnightTime + 24 * 60 * 60 * 1000 && loopCount < MAX_LOOP) {
                    loopCount++;
                    const vnDate = new Date(attemptTime + 7 * 60 * 60 * 1000);
                    const attemptMins = vnDate.getUTCHours() * 60 + vnDate.getUTCMinutes();
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
                            if (Math.abs(attemptTime - usedTime) < 3 * 60 * 1000) {
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
                                    const vnDate2 = new Date(attemptTime + 7 * 60 * 60 * 1000);
                                    const dvktStartMins = vnDate2.getUTCHours() * 60 + vnDate2.getUTCMinutes();
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
                    eligibleStaff.sort((a,b) => staffTimeline[a.id].length - staffTimeline[b.id].length);
                    for (const s of eligibleStaff) {
                        const actionStart = attemptTime;
                        const actionEnd = actionStart + service.non_overlap_time * 60 * 1000;
                        const totalEnd = actionStart + service.total_time * 60 * 1000;
                        const bedEnd = actionStart + service.bed_occupancy_time * 60 * 1000;

                        const attemptEndDate = new Date(totalEnd + 7 * 60 * 60 * 1000);
                        const attemptEndMins = attemptEndDate.getUTCHours() * 60 + attemptEndDate.getUTCMinutes();
                        const fitsMorning = attemptMins >= mStartMins && attemptEndMins <= mEndMins;
                        const fitsLunchOt = currentEnableLunchOt && attemptMins >= mStartMins && attemptEndMins <= lOtEndMins;
                        const fitsAfternoon = attemptMins >= aStartMins && attemptEndMins <= aEndMins;
                        const fitsEveningOt = currentEnableEveningOt && attemptMins >= aStartMins && attemptEndMins <= eOtEndMins;
                        const exceedsShift = !fitsMorning && !fitsLunchOt && !fitsAfternoon && !fitsEveningOt;

                        // Kiểm tra NV có bận không: kết thúc ca trước + MIN_GAP mới được bắt đầu ca mới
                        // Dùng actionEnd (non_overlap_time) cho non-exclusive, totalEnd cho exclusive
                        // QUAN TRỌNG: Dùng >= thay vì > để BẮT BUỘC khoảng cách, không cho trùng giờ
                        const isStaffBusy = exceedsShift || (service.is_exclusive_staff
                            ? staffTimeline[s.id].some(busy => actionStart < (busy.end + MIN_GAP) && (totalEnd + MIN_GAP) > busy.start)
                            : staffTimeline[s.id].some(busy => {
                                if (busy.type === 'action') {
                                    // Phải cách nhau ít nhất MIN_GAP (1 phút)
                                    // actionStart phải >= busy.end + MIN_GAP (không cho bằng nhau)
                                    return actionStart < (busy.end + MIN_GAP) && (actionEnd + MIN_GAP) > busy.start;
                                }
                                return false;
                            }));
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
                            machinesForSvc.sort((a,b) => machineAllocations[a.id].length - machineAllocations[b.id].length);
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
    
    res.json({ scheduled: scheduledAppointments, unassigned: unassignedPatients });
});

app.use(express.static(path.join(process.cwd(), "public")));
app.use((req, res) => {
    if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found" });
    if (!req.cookies.tenant_id) {
        res.sendFile(path.join(process.cwd(), "public", "landing.html"));
    } else {
        res.sendFile(path.join(process.cwd(), "public", "index.html"));
    }
});

export default app;