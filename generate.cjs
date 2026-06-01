const fs = require('fs');

const original = fs.readFileSync('server.js', 'utf-8');

const startIdx = original.indexOf('const { patients, startTime } = req.body;');
const endIdx = original.indexOf('const insert = db.prepare("INSERT INTO appointments');
let schedule_logic = original.substring(startIdx, endIdx);

schedule_logic = schedule_logic.replace('const services = db.prepare("SELECT * FROM services").all();', '');
schedule_logic = schedule_logic.replace('const staff = db.prepare("SELECT * FROM staff").all();', '');
schedule_logic = schedule_logic.replace('const staffServices = db.prepare("SELECT * FROM staff_services").all();', '');
schedule_logic = schedule_logic.replace('const settingsRows = db.prepare("SELECT * FROM settings").all();', '');
schedule_logic = schedule_logic.replace('const allMachines = db.prepare("SELECT * FROM machines").all();', '');
schedule_logic = schedule_logic.replace('const staffLeaves = db.prepare("SELECT * FROM staff_leaves WHERE leave_date = ?").all(scheduleDate);', '');
schedule_logic = schedule_logic.replace('const existingApps = db.prepare("SELECT * FROM appointments").all();', '');

let new_api = `import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/settings", async (req, res) => {
    const { data } = await supabase.from("settings").select("*");
    res.json((data || []).reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {}));
});

app.put("/api/settings", async (req, res) => {
    const entries = Object.entries(req.body).map(([key, value]) => ({ key, value }));
    const { error } = await supabase.from("settings").upsert(entries);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: "Settings updated" });
});

app.get("/api/staff", async (req, res) => {
    const { data: staff } = await supabase.from("staff").select("*");
    const { data: staffServices } = await supabase.from("staff_services").select("*");
    
    const mappedStaff = (staff || []).map(s => {
        s.allowed_services = (staffServices || []).filter(ss => ss.staff_id === s.id).map(ss => ss.service_id);
        return s;
    });
    res.json(mappedStaff);
});

app.post("/api/staff", async (req, res) => {
    const { name, role, allowed_services } = req.body;
    const { data: info, error } = await supabase.from("staff").insert({ name, role }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    
    if (allowed_services && allowed_services.length) {
        const svcs = allowed_services.map(svc => ({ staff_id: info.id, service_id: svc }));
        await supabase.from("staff_services").insert(svcs);
    }
    res.json({ id: info.id, message: "Staff created" });
});

app.post("/api/staff/bulk", async (req, res) => {
    const { staffs } = req.body;
    for (const s of staffs) {
        const { data: info } = await supabase.from("staff").insert({ name: s.name, role: s.role }).select().single();
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
    const { data } = await supabase.from("services").select("*");
    res.json(data || []);
});

app.post("/api/services", async (req, res) => {
    const { id, name, total_time, non_overlap_time, requires_machine, bed_occupancy_time, is_exclusive_staff, no_patient_overlap, required_role, allow_idle_overlap_with, deny_idle_overlap_with } = req.body;
    if (!name || total_time == null || non_overlap_time == null) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    
    const newId = id || Math.random().toString(36).substr(2, 9);

    const { data, error } = await supabase.from("services").insert({
        id: newId, name, total_time, non_overlap_time, requires_machine: requires_machine ? true : false, 
        bed_occupancy_time: bed_occupancy_time || total_time, is_exclusive_staff: is_exclusive_staff ? true : false, 
        no_patient_overlap: no_patient_overlap ? true : false, required_role: required_role || '', 
        allow_idle_overlap_with: allow_idle_overlap_with || '', deny_idle_overlap_with: deny_idle_overlap_with || ''
    }).select().single();
    
    if (error) return res.status(400).json({ error: error.message });
    res.json({ id: data.id, message: "Service added" });
});

app.put("/api/services/:id", async (req, res) => {
    const { id } = req.params;
    const { name, total_time, non_overlap_time, requires_machine, bed_occupancy_time, is_exclusive_staff, no_patient_overlap, required_role, allow_idle_overlap_with, deny_idle_overlap_with } = req.body;
    const { error } = await supabase.from("services").update({
        name, total_time, non_overlap_time, requires_machine: requires_machine ? true : false, 
        bed_occupancy_time: bed_occupancy_time || total_time, is_exclusive_staff: is_exclusive_staff ? true : false, 
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
    const { date, staff_id } = req.query;
    let query = supabase.from("staff_leaves").select("*, staff:staff_id(name)");
    if (date) query = query.eq("leave_date", date);
    if (staff_id) query = query.eq("staff_id", staff_id);
    
    const { data } = await query;
    const mapped = (data || []).map(d => ({...d, staff_name: d.staff?.name}));
    res.json(mapped.sort((a, b) => new Date(b.leave_date).getTime() - new Date(a.leave_date).getTime()));
});

app.post("/api/staff-leaves", async (req, res) => {
    const { staff_id, leave_date, leave_type, start_time, end_time, reason } = req.body;
    const { data, error } = await supabase.from("staff_leaves").insert({
        staff_id, leave_date, leave_type, start_time: start_time || null, end_time: end_time || null, reason: reason || null
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
    const { data } = await supabase.from("machines").select("*");
    res.json(data || []);
});

app.post("/api/machines", async (req, res) => {
    const { name, service_id, capacity } = req.body;
    const { data, error } = await supabase.from("machines").insert({
        name, service_id: service_id || null, capacity: capacity || 1
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
    const { data } = await supabase.from("appointments").select("*, services(name), staff(name), machines(name)").order("start_time", { ascending: true });
    const mapped = (data || []).map(a => ({
        ...a,
        service_name: a.services?.name,
        staff_name: a.staff?.name,
        machine_name: a.machines?.name
    }));
    res.json(mapped);
});

app.delete("/api/appointments", async (req, res) => {
    await supabase.from("appointments").delete().neq("id", 0);
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
    await supabase.from("appointments").delete().eq("patient_name", name);
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
    
    const [servicesRes, staffRes, staffServicesRes, settingsRes, machinesRes, staffLeavesRes, existingAppsRes] = await Promise.all([
        supabase.from("services").select("*"),
        supabase.from("staff").select("*"),
        supabase.from("staff_services").select("*"),
        supabase.from("settings").select("*"),
        supabase.from("machines").select("*"),
        supabase.from("staff_leaves").select("*").eq("leave_date", scheduleDate),
        supabase.from("appointments").select("*")
    ]);

    const services = servicesRes.data || [];
    const staff = staffRes.data || [];
    const staffServices = staffServicesRes.data || [];
    const settingsRows = settingsRes.data || [];
    const allMachines = machinesRes.data || [];
    const staffLeaves = staffLeavesRes.data || [];
    const existingApps = existingAppsRes.data || [];
`;

new_api += schedule_logic + `
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

export default app;
`;

fs.writeFileSync('api/index.js', new_api);
console.log("Generated api/index.js successfully!");
