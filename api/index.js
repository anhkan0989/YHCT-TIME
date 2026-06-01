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
        res.status(401).json({ error: "Sai tÃ i khoáº£n hoáº·c máº­t kháº©u" });
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
    
    res.json({ message: "ÄÃ£ xÃ³a toÃ n bá»™ dá»¯ liá»‡u cá»§a Ä‘Æ¡n vá»‹: " + tenantId });
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
    res.json({ id: data.id, message: "ÄÃ£ táº¡o nghá»‰ phÃ©p" });
});

app.put("/api/staff-leaves/:id", async (req, res) => {
    const { id } = req.params;
    const { staff_id, leave_date, leave_type, start_time, end_time, reason } = req.body;
    await supabase.from("staff_leaves").update({
        staff_id, leave_date, leave_type, start_time: start_time || null, end_time: end_time || null, reason: reason || null
    }).eq("id", id);
    res.json({ message: "ÄÃ£ cáº­p nháº­t nghá»‰ phÃ©p" });
});

app.delete("/api/staff-leaves/:id", async (req, res) => {
    const { id } = req.params;
    await supabase.from("staff_leaves").delete().eq("id", id);
    res.json({ message: "ÄÃ£ xÃ³a nghá»‰ phÃ©p" });
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
        const lOtStartMins = mEndMins;
        const eOtStartMins = aEndMins;

        // --- Service priority order for scheduling ---
        const SERVICE_PRIORITY = ['xoa bÃ³p', 'thá»§y chÃ¢m', 'Ä‘iá»‡n chÃ¢m', 'hÃ o chÃ¢m', 'Ä‘iá»‡n/hÃ o chÃ¢m', 'há»“ng ngoáº¡i', 'giÃ¡c hÆ¡i', 'chÆ°á»m'];
        const getSvcPriority = (svcName) => {
            const nameLow = svcName.toLowerCase();
            for (let i = 0; i < SERVICE_PRIORITY.length; i++) {
                if (nameLow.includes(SERVICE_PRIORITY[i])) return i;
            }
            return SERVICE_PRIORITY.length;
        };

        // ===== PRE-COMPUTE LOOKUP TABLES (O(1) thay vÃ¬ O(N)) =====
        const serviceMap = new Map(services.map(s => [s.id, s]));
        
        // Staff â†’ allowed service IDs
        const staffAllowedSvcMap = {};
        staffServices.forEach(ss => {
            if (!staffAllowedSvcMap[ss.staff_id]) staffAllowedSvcMap[ss.staff_id] = new Set();
            staffAllowedSvcMap[ss.staff_id].add(ss.service_id);
        });

        // Pre-parse leave time ranges (trÃ¡nh parse string trong vÃ²ng láº·p)
        const parsedLeaves = {};
        Object.keys(staffLeavesMap).forEach(staffId => {
            parsedLeaves[staffId] = staffLeavesMap[staffId].map(leave => {
                if (leave.leave_type === 'full_day') return { type: 'full_day' };
                if (leave.leave_type === 'time_range' && leave.start_time && leave.end_time) {
                    const lp = leave.start_time.split(':');
                    const lep = leave.end_time.split(':');
                    return {
                        type: 'time_range',
                        startMins: parseInt(lp[0]) * 60 + parseInt(lp[1]),
                        endMins: parseInt(lep[0]) * 60 + parseInt(lep[1])
                    };
                }
                return null;
            }).filter(Boolean);
        });

        // Pre-filter staff per service (role + allowed services + full_day leave)
        const baseEligibleByService = {};
        services.forEach(svc => {
            baseEligibleByService[svc.id] = staff.filter(s => {
                // Full-day leave check
                const leaves = parsedLeaves[s.id];
                if (leaves && leaves.some(l => l.type === 'full_day')) return false;
                // Role check
                if (svc.required_role) {
                    const reqRoles = svc.required_role.split(',').map(r => r.trim());
                    if (!reqRoles.includes(s.role)) return false;
                }
                // Allowed services check
                const allowed = staffAllowedSvcMap[s.id];
                if (allowed && allowed.size > 0 && !allowed.has(svc.id)) return false;
                return true;
            });
        });

        // Pre-compute machines per service
        const machinesByService = {};
        services.forEach(svc => {
            if (svc.requires_machine) {
                machinesByService[svc.id] = allMachines.filter(m => m.service_id === svc.id);
            }
        });

        // Group patients by pKey then sort each group's services by priority
        const patientGroups = {};
        patients.forEach(p => {
            const pKey = p.stt || p.name;
            if (!patientGroups[pKey]) patientGroups[pKey] = [];
            patientGroups[pKey].push(p);
        });
        const sortedPatients = [];
        const seenKeys = [];
        patients.forEach(p => {
            const pKey = p.stt || p.name;
            if (!seenKeys.includes(pKey)) seenKeys.push(pKey);
        });
        seenKeys.forEach(pKey => {
            const group = patientGroups[pKey];
            group.sort((a, b) => {
                const svcA = serviceMap.get(a.service_id);
                const svcB = serviceMap.get(b.service_id);
                return getSvcPriority(svcA?.name || '') - getSvcPriority(svcB?.name || '');
            });
            sortedPatients.push(...group);
        });

        const MAX_PATIENTS = 300;
        if (sortedPatients.length > MAX_PATIENTS) {
            return res.status(400).json({ error: `QuÃ¡ nhiá»u (${sortedPatients.length}). Tá»‘i Ä‘a ${MAX_PATIENTS}.` });
        }

        console.log(`[SCHEDULE] Báº¯t Ä‘áº§u: ${seenKeys.length} BN, ${sortedPatients.length} DVKT, ${staff.length} NV`);
        const startMs = Date.now();

        // ===== THUáº¬T TOÃN Xáº¾P Lá»ŠCH Tá»I Æ¯U =====
        try {
        sortedPatients.forEach(p => {
            const service = serviceMap.get(p.service_id);
            if (!service) {
                unassignedPatients.push({ ...p, reason: 'KhÃ´ng tÃ¬m tháº¥y cáº¥u hÃ¬nh DVKT' });
                return;
            }
            const pKey = p.stt || p.name;
            if (!patientTimeline[pKey]) patientTimeline[pKey] = [];

            let foundSlot = false;
            let finalSlotData = null;

            // Session apps for this patient (Ä‘Ã£ xáº¿p trÆ°á»›c Ä‘Ã³ trong phiÃªn nÃ y)
            const sessionAppsForPatient = scheduledAppointments.filter(a => (a.stt || a.patient_name) === pKey);

            // Stagger: BN thá»© i báº¯t Ä‘áº§u muá»™n hÆ¡n (i*2+2) phÃºt
            const patientIndex = seenKeys.indexOf(pKey);
            const staggerMins = (patientIndex * 2) + 2;
            let patientLastEndTime = midnightTime + (mStartMins + staggerMins) * 60000;

            if (sessionAppsForPatient.length > 0) {
                const lastApp = sessionAppsForPatient[sessionAppsForPatient.length - 1];
                const lastSvc = serviceMap.get(lastApp.service_id);
                if (lastSvc) {
                    const lastStart = lastApp.start_time_ms;
                    const hasIdle = !lastSvc.is_exclusive_staff && lastSvc.non_overlap_time < lastSvc.total_time;
                    patientLastEndTime = hasIdle
                        ? lastStart + lastSvc.non_overlap_time * 60000 + MIN_GAP
                        : lastStart + lastSvc.total_time * 60000 + MIN_GAP;
                }
            }

            const machinesForSvc = machinesByService[service.id] || [];

            // Base eligible staff (Ä‘Ã£ pre-filter role/service/full_day)
            const baseStaff = baseEligibleByService[service.id] || [];
            if (baseStaff.length === 0) {
                unassignedPatients.push({ ...p, service: service.name, reason: 'KhÃ´ng cÃ³ NV nÃ o nháº­n DVKT nÃ y' });
                return;
            }

            // Pre-build appsByStaff lookup
            const appsByStaff = {};
            for (const app of scheduledAppointments) {
                if (!appsByStaff[app.staff_id]) appsByStaff[app.staff_id] = [];
                appsByStaff[app.staff_id].push(app);
            }

            const svcNonOverlapMs = service.non_overlap_time * 60000;
            const svcTotalMs = service.total_time * 60000;
            const svcBedMs = service.bed_occupancy_time * 60000;

            for (let pass = 1; pass <= 3; pass++) {
                let attemptTime = patientLastEndTime;
                const useLunchOt = (pass >= 2) && enableLunchOt;
                const useEveningOt = (pass === 3) && enableEveningOt;
                const dayEnd = useEveningOt ? eOtEndMins : aEndMins;
                let loopCount = 0;

                while (!foundSlot && loopCount < 2000) {
                    loopCount++;
                    const attemptMins = Math.floor((attemptTime - midnightTime) / 60000);

                    // ÄÃ£ vÆ°á»£t giá» lÃ m viá»‡c â†’ dá»«ng pass nÃ y
                    if (attemptMins >= dayEnd) break;

                    // Fast-forward qua khoáº£ng thá»i gian khÃ´ng há»£p lá»‡
                    if (attemptMins < mStartMins + staggerMins) {
                        attemptTime = midnightTime + (mStartMins + staggerMins) * 60000;
                        continue;
                    }
                    if (attemptMins >= mEndMins && attemptMins < aStartMins) {
                        if (useLunchOt && attemptMins < lOtEndMins) {
                            // Trong giá» trÆ°a OT â†’ cho phÃ©p tiáº¿p tá»¥c
                        } else {
                            attemptTime = midnightTime + aStartMins * 60000;
                            continue;
                        }
                    }
                    if (attemptMins >= aEndMins && attemptMins < eOtEndMins && useEveningOt) {
                        // Trong giá» tá»‘i OT â†’ cho phÃ©p tiáº¿p tá»¥c
                    } else if (attemptMins >= aEndMins) {
                        break;
                    }

                    const actionStart = attemptTime;
                    const actionEnd = actionStart + svcNonOverlapMs;
                    const totalEnd = actionStart + svcTotalMs;
                    const bedEnd = actionStart + svcBedMs;

                    // Check: DVKT cÃ³ vá»«a trong ca lÃ m viá»‡c khÃ´ng?
                    const endMins = Math.floor((totalEnd - midnightTime) / 60000);
                    const fitsMorning = attemptMins >= mStartMins && endMins <= mEndMins;
                    const fitsLunchOt = useLunchOt && attemptMins >= mStartMins && endMins <= lOtEndMins;
                    const fitsAfternoon = attemptMins >= aStartMins && endMins <= aEndMins;
                    const fitsEveningOt = useEveningOt && attemptMins >= aStartMins && endMins <= eOtEndMins;

                    if (!fitsMorning && !fitsLunchOt && !fitsAfternoon && !fitsEveningOt) {
                        // Nháº£y Ä‘áº¿n ca tiáº¿p theo
                        if (attemptMins < aStartMins) {
                            attemptTime = midnightTime + aStartMins * 60000;
                        } else {
                            break; // Háº¿t ngÃ y
                        }
                        continue;
                    }

                    // Check: GiÆ°á»ng cÃ²n trá»‘ng?
                    let activeBeds = 0;
                    for (const busy of bedTimeline) {
                        if (actionStart < busy.end && bedEnd > busy.start) {
                            activeBeds++;
                            if (activeBeds >= 10) break;
                        }
                    }
                    if (activeBeds >= 10) {
                        attemptTime += 60000;
                        continue;
                    }

                    // Check: BN cÃ³ Ä‘ang báº­n khÃ´ng?
                    let isPatientBusy = patientTimeline[pKey].some(
                        busy => actionStart < (busy.end + MIN_GAP) && (totalEnd + MIN_GAP) > busy.start
                    );
                    
                    if (isPatientBusy) {
                        const newHasIdle = !service.is_exclusive_staff && !service.no_patient_overlap && service.non_overlap_time < service.total_time;
                        if (newHasIdle) {
                            const canOverlap = patientTimeline[pKey].every(busy => {
                                if (!(actionStart < busy.end && totalEnd > busy.start)) return true; // khÃ´ng clash
                                const clashApp = sessionAppsForPatient.find(a => a.start_time_ms === busy.start);
                                if (!clashApp) return false;
                                const clashSvc = serviceMap.get(clashApp.service_id);
                                if (!clashSvc) return false;
                                
                                const oldHasIdle = !clashSvc.is_exclusive_staff && clashSvc.non_overlap_time < clashSvc.total_time;
                                if (!oldHasIdle && !clashSvc.no_patient_overlap) return false;
                                if (clashSvc.no_patient_overlap) return false;
                                if (actionStart === busy.start) return false;

                                // Check non-overlap thá»i gian
                                if (busy.start <= actionStart) {
                                    const oldBusyEnd = busy.start + clashSvc.non_overlap_time * 60000;
                                    if (actionStart < oldBusyEnd + MIN_GAP) return false;
                                } else {
                                    const newBusyEnd = actionStart + svcNonOverlapMs;
                                    if (busy.start < newBusyEnd + MIN_GAP) return false;
                                }
                                return true;
                            });
                            if (canOverlap) isPatientBusy = false;
                        }
                    }
                    if (isPatientBusy) {
                        // SMART JUMP: nháº£y Ä‘áº¿n khi BN ráº£nh
                        let nextFree = attemptTime + 60000;
                        for (const busy of patientTimeline[pKey]) {
                            if (busy.end + MIN_GAP > attemptTime && busy.end + MIN_GAP < nextFree + svcTotalMs) {
                                nextFree = Math.max(nextFree, busy.end + MIN_GAP);
                            }
                        }
                        attemptTime = nextFree;
                        continue;
                    }

                    // Check: MÃ¡y cÃ²n trá»‘ng?
                    let assignedMachineId = null;
                    if (service.requires_machine) {
                        for (const m of machinesForSvc) {
                            const isBusy = machineAllocations[m.id].some(busy => actionStart < busy.end && totalEnd > busy.start);
                            if (!isBusy) { assignedMachineId = m.id; break; }
                        }
                        if (!assignedMachineId) {
                            attemptTime += 60000;
                            continue;
                        }
                    }

                    // Check: Giá» káº¿t thÃºc BN cÃ³ trÃ¹ng khÃ´ng?
                    let patientConflict = false;
                    for (const ea of sessionAppsForPatient) {
                        if (Math.abs(totalEnd - ea.total_end_ms) < MIN_GAP ||
                            Math.abs(actionStart - ea.total_end_ms) < MIN_GAP ||
                            Math.abs(totalEnd - ea.start_time_ms) < MIN_GAP) {
                            patientConflict = true;
                            break; // EARLY EXIT
                        }
                    }
                    if (patientConflict) {
                        attemptTime += 60000;
                        continue;
                    }

                    // Filter staff by time_range leave (chá»‰ check leave, role Ä‘Ã£ pre-filter)
                    const eligibleStaff = baseStaff.filter(s => {
                        const leaves = parsedLeaves[s.id];
                        if (!leaves) return true;
                        for (const leave of leaves) {
                            if (leave.type === 'time_range') {
                                const dvktEnd = attemptMins + service.non_overlap_time;
                                if (attemptMins < leave.endMins && dvktEnd > leave.startMins) return false;
                            }
                        }
                        return true;
                    });

                    if (eligibleStaff.length === 0) {
                        attemptTime += 60000;
                        continue;
                    }

                    // Æ¯u tiÃªn NV Ä‘Ã£ phá»¥c vá»¥ BN nÃ y, sau Ä‘Ã³ NV Ã­t viá»‡c nháº¥t
                    const patientStaffIds = sessionAppsForPatient.map(a => a.staff_id);
                    eligibleStaff.sort((a, b) => {
                        const aPri = patientStaffIds.includes(a.id) ? -1 : 0;
                        const bPri = patientStaffIds.includes(b.id) ? -1 : 0;
                        if (aPri !== bPri) return aPri - bPri;
                        return (staffTimeline[a.id]?.length || 0) - (staffTimeline[b.id]?.length || 0);
                    });

                    // TÃ¬m NV trá»‘ng
                    let staffFound = false;
                    for (const s of eligibleStaff) {
                        // Check NV báº­n
                        const timeline = staffTimeline[s.id];
                        let busy = false;
                        if (service.is_exclusive_staff) {
                            busy = timeline.some(b => actionStart < (b.end + MIN_GAP) && (totalEnd + MIN_GAP) > b.start);
                        } else {
                            busy = timeline.some(b => b.type === 'action' && actionStart < (b.end + MIN_GAP) && (actionEnd + MIN_GAP) > b.start);
                        }
                        if (busy) continue;

                        // Check giá» káº¿t thÃºc NV trÃ¹ng
                        let staffConflict = false;
                        const sApps = appsByStaff[s.id] || [];
                        for (const ea of sApps) {
                            if (Math.abs(totalEnd - ea.total_end_ms) < MIN_GAP ||
                                Math.abs(actionStart - ea.total_end_ms) < MIN_GAP ||
                                Math.abs(totalEnd - ea.start_time_ms) < MIN_GAP ||
                                Math.abs(actionEnd - ea.action_end_ms) < MIN_GAP) {
                                staffConflict = true;
                                break; // EARLY EXIT
                            }
                        }
                        if (staffConflict) continue;

                        finalSlotData = { s, actionStart, actionEnd, totalEnd, bedEnd, assignedMachineId };
                        foundSlot = true;
                        staffFound = true;
                        break;
                    }

                    if (!staffFound) {
                        // SMART JUMP: nháº£y Ä‘áº¿n khi NV Ä‘áº§u tiÃªn ráº£nh
                        let earliest = Infinity;
                        for (const s of eligibleStaff) {
                            for (const b of staffTimeline[s.id]) {
                                if (b.end + MIN_GAP > attemptTime && b.end + MIN_GAP < earliest) {
                                    earliest = b.end + MIN_GAP;
                                }
                            }
                        }
                        attemptTime = earliest < Infinity ? Math.max(earliest, attemptTime + 60000) : attemptTime + 60000;
                    }
                } // end while

                if (foundSlot) break; // ThoÃ¡t pass loop
            } // end pass

            // Ghi nháº­n káº¿t quáº£
            if (foundSlot && finalSlotData) {
                const { s, actionStart, actionEnd, totalEnd, bedEnd } = finalSlotData;
                if (service.is_exclusive_staff) {
                    staffTimeline[s.id].push({ start: actionStart, end: totalEnd, type: 'action' });
                } else {
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
            } else {
                unassignedPatients.push({ ...p, service: service?.name, reason: 'Het suc chua / ket lich' });
            }
        }); // end sortedPatients.forEach

        const elapsed = Date.now() - startMs;
        console.log(`[SCHEDULE] Xong trong ${elapsed}ms. OK: ${scheduledAppointments.length}, Fail: ${unassignedPatients.length}`);

        // Luu vao DB de frontend hien thi danh sach
        if (scheduledAppointments.length > 0) {
            const tenantId = req.cookies.tenant_id;
            const toInsert = scheduledAppointments.map(app => ({
                patient_name: app.patient_name,
                service_id: app.service_id,
                staff_id: app.staff_id,
                machine_id: app.machine_id,
                start_time: app.start_time,
                status: app.status,
                tenant_id: tenantId || null
            }));
            await supabase.from("appointments").insert(toInsert);
        }

        res.json({ scheduled: scheduledAppointments, unassigned: unassignedPatients });

        } catch (err) {
            console.error('[SCHEDULE] ERROR:', err.message, err.stack);
            res.status(500).json({ error: 'Loi xep lich: ' + err.message });
        }
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
