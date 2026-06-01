/**
 * Module: Quản lý Nhân sự Nghỉ phép + Giao diện Nâng cao DVKT
 * Version: 1.1.0 (Refined UI and terminology)
 */
(function() {
  'use strict';

  // === DEBOUNCE HELPER ===
  function debounce(fn, ms) {
    let timer;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // === XỬ LÝ FETCH GIAO TIẾP VỚI SERVER ===
  let cachedServices = [];
  const API_BASE = '';
  
  async function preloadServices() {
    try {
      const res = await fetch('/api/services');
      cachedServices = await res.json();
    } catch(e) {}
  }
  preloadServices();

  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const [url, config] = args;
    // Intercept when React saves Service (POST or PUT)
    if (typeof url === 'string' && url.includes('/api/services') && config && (config.method === 'POST' || config.method === 'PUT')) {
      try {
        const bodyObj = JSON.parse(config.body);
        const nopCheckbox = document.getElementById('dvkt-nop-checkbox');
        if (nopCheckbox) {
          bodyObj.no_patient_overlap = nopCheckbox.checked ? true : false;
        }
        const allowCheckboxes = document.querySelectorAll('.dvkt-allow-cb:checked');
        if (allowCheckboxes.length > 0 || document.getElementById('dvkt-custom-overlap-wrapper')) {
          bodyObj.allow_idle_overlap_with = Array.from(allowCheckboxes).map(cb => cb.value).join(',');
        }
        const denyCheckboxes = document.querySelectorAll('.dvkt-deny-cb:checked');
        if (denyCheckboxes.length > 0 || document.getElementById('dvkt-custom-overlap-wrapper')) {
          bodyObj.deny_idle_overlap_with = Array.from(denyCheckboxes).map(cb => cb.value).join(',');
        }
        config.body = JSON.stringify(bodyObj);
      } catch(e) { console.error('Interceptor error', e); }
    }

    const res = await originalFetch.apply(this, args);
    
    // Reload local cache if services updated
    if (typeof url === 'string' && url.includes('/api/services') && (!config || config.method === 'GET' || config.method === 'POST' || config.method === 'PUT')) {
      preloadServices();
    }
    return res;
  };


  // === INJECT CSS ===
  function injectStyles() {
    const style = document.createElement('style');
    style.id = 'module-staff-leave-css';
    style.textContent = `
      /* Cải thiện Giao diện Modal DVKT (Gọn gàng, không phải kéo/cuộn ngang dọc) */
      .dvkt-custom-modal-wrapper {
        max-width: 95vw !important;
        width: 850px !important;
        padding: 16px 24px !important;
        max-height: 95vh !important;
        overflow-y: hidden !important; 
        border-radius: 16px !important;
      }
      .dvkt-custom-modal-wrapper > div, .dvkt-custom-modal-wrapper form {
        max-height: calc(95vh - 50px);
        overflow-y: auto;
      }
      /* Rút gọn padding, margin để form gọn vào 1 khung */
      .dvkt-custom-modal-wrapper label { margin-bottom: 2px !important; display:block; }
      .dvkt-custom-modal-wrapper input[type="text"], .dvkt-custom-modal-wrapper input[type="number"] { 
        height: 38px !important; padding: 4px 12px !important;
      }
      .dvkt-custom-modal-wrapper div { margin-bottom: 6px !important; margin-top: 0 !important; }
      .dvkt-custom-modal-wrapper .gap-4, .dvkt-custom-modal-wrapper .gap-6 { gap: 12px !important; }
      
      /* Cải thiện hộp Checkbox DVKT */
      .dvkt-custom-box {
        border: 1px solid currentColor; border-radius: 8px; padding: 10px;
        display: flex; align-items: center; gap: 12px; margin-top: 4px !important;
        cursor: pointer; background: #fafafa;
      }
      .dvkt-custom-box input[type="checkbox"] { width: 18px; height: 18px; }
      .dvkt-custom-box .title { font-weight: 700; font-size: 13px; margin: 0 !important;}
      .dvkt-custom-box .desc { font-size: 11px; margin: 0 !important; line-height: 1.2; }
      
      /* Module Nghỉ phép Nhân sự */
      .staff-leave-overlay {
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5); z-index: 10000;
        display: flex; align-items: center; justify-content: center;
      }
      .staff-leave-modal {
        background: #fff; border-radius: 16px; width: 900px; max-width: 96vw; max-height: 90vh;
        display: flex; flex-direction: column; overflow: hidden; font-family: sans-serif;
      }
      .sl-header { background: #0d9488; color: white; padding: 16px 24px; display: flex; justify-content: space-between; }
      .sl-header h2 { margin: 0; font-size: 18px; font-weight: bold; }
      .sl-body { padding: 20px 24px; overflow-y: auto; flex: 1; }
      .sl-table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      .sl-table th, .sl-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
      .sl-table th { background: #f8fafc; font-size: 12px; text-transform: uppercase; color: #475569; }
      .sl-btn { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; cursor: pointer; color: white;}
      .sl-btn-primary { background: #0d9488; }
      .sl-btn-edit { background: #eab308; }
      .sl-btn-delete { background: #ef4444; }
      .sl-btn-ghost { background: #f1f5f9; color: #334155; }
      .sl-form-group { margin-bottom: 12px; }
      .sl-form-group label { display: block; font-weight: 600; font-size: 13px; margin-bottom: 6px; }
      .sl-form-group select, .sl-form-group input { width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; }
      
      /* Nút Tích hợp vào Tab Nhân sự */
      .inline-staff-btn {
        background: linear-gradient(135deg, #10b981, #059669); color: white;
        padding: 8px 16px; border-radius: 8px; border: none;
        font-weight: 600; font-size: 14px; cursor: pointer;
        display: inline-flex; align-items: center; gap: 8px;
        box-shadow: 0 4px 6px rgba(16,185,129,0.2); transition: 0.2s;
        margin-left: 16px; margin-bottom: 10px;
      }
      .inline-staff-btn:hover { background: #059669; }
    `;
    document.head.appendChild(style);
  }

  // === OBSERVE THE UI (DOM PATCHAR) ===
  // Flag tránh re-patch elements đã xử lý
  const patchedElements = new WeakSet();
  let isPatching = false; // Ngăn vòng lặp vô hạn khi đang patch DOM

  function _doObserveCheck() {
    // Nếu đang patch hoặc đang focus input → bỏ qua hoàn toàn
    if (isPatching) return;
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
      return; // Đang gõ text → KHÔNG can thiệp DOM
    }
    isPatching = true;
    try {
    // 1. Dò tìm và patch Modal DVKT
    const modalTitles = document.querySelectorAll('h2, h3');
    modalTitles.forEach(title => {
      const text = title.textContent || '';
      
      // --- PATCH TAB NHÂN VIÊN ---
      if (text.includes('Danh sách Nhân viên') && !document.getElementById('inject-staff-leave-btn')) {
         const btn = document.createElement('button');
         btn.id = 'inject-staff-leave-btn';
         btn.className = 'inline-staff-btn';
         btn.innerHTML = '🏖️ Tùy chọn thời gian nghỉ phép (Ngày/Giờ)';
         btn.onclick = openStaffLeaveModal;
         title.parentElement.insertBefore(btn, title.nextSibling);
      }

      // --- PATCH FORM DVKT ---
      if (text.includes('Chỉnh sửa DVKT:') || text.includes('Thêm DVKT')) {
        const modalBox = title.closest('[role="dialog"]') || title.closest('.bg-white') || title.parentElement?.parentElement;
        if (modalBox && !patchedElements.has(modalBox)) {
           patchedElements.add(modalBox);
           modalBox.classList.add('dvkt-custom-modal-wrapper');

           let serviceName = '';
           if (text.includes('Chỉnh sửa DVKT:')) serviceName = text.replace('Chỉnh sửa DVKT:', '').trim();
           
           let isNop = false;
           if (serviceName) {
              const svc = cachedServices.find(s => s.name === serviceName);
              if (svc && svc.no_patient_overlap) isNop = true;
           }

           // --- SỬA LABEL: chỉ dùng querySelectorAll có điều kiện chặt ---
           modalBox.querySelectorAll('label').forEach(lb => {
              if (patchedElements.has(lb)) return;
              const lbText = lb.textContent || '';
              
              if (lbText.includes('TỔNG THỜI GIAN DVKT (PHÚT)')) {
                 patchedElements.add(lb);
                 lb.innerHTML = '<span style="color:#166534;font-size:13px;font-weight:700;">⏳ Tổng thời gian Bệnh Nhân làm DVKT (Phút)</span><br/><span style="font-size:11px;color:#15803d;font-weight:400;">Bao gồm cả thời gian làm + chờ. Trừ vào quỹ thời gian BN.</span>';
              }
              if (lbText.includes('T.GIAN THAO TÁC (KHÔNG ĐƯỢC TRÙNG)') || lbText === 'T.GIAN THAO TÁC') {
                 patchedElements.add(lb);
                 lb.innerHTML = '<span style="color:#0369a1;font-size:13px;font-weight:700;">⏱ Sau bao nhiêu phút thì Nhân Sự được đi làm DVKT khác?</span><br/><span style="font-size:11px;color:#0284c7;font-weight:400;">(Phút đầu NV bận, thời gian tính từ lúc bắt đầu)</span>';
              }
           });

           // --- THÊM CHECKBOX ---
           const divs = Array.from(modalBox.querySelectorAll('div'));
           const exclusiveContainer = divs.find(d => 
             d.textContent.includes('Chiếm trọn vẹn nhân viên') && 
             d.querySelector('input[type="checkbox"]') && 
             !d.classList.contains('dvkt-custom-box')
           );

           if (exclusiveContainer && !document.getElementById('dvkt-nop-checkbox-wrapper')) {
              exclusiveContainer.classList.add('dvkt-custom-box');
              exclusiveContainer.style.color = '#991b1b';
              
              // Chỉ thêm spans mới, không overwrite innerHTML (tránh mất React event handlers)
              const titleSpan = document.createElement('span');
              titleSpan.className = 'title';
              titleSpan.textContent = '🚫 1 - CA ĐẶC BIỆT: Chiếm trọn vẹn nhân sự';
              
              const checkbox = exclusiveContainer.querySelector('input[type="checkbox"]');
              if (checkbox) {
                const oldLabel = exclusiveContainer.querySelector('label, span:not(.title):not(.desc)');
                if (oldLabel && oldLabel.textContent.includes('Chiếm trọn vẹn')) {
                  oldLabel.textContent = '';
                  oldLabel.appendChild(titleSpan);
                  const descSpan = document.createElement('div');
                  descSpan.className = 'desc';
                  descSpan.textContent = 'Bỏ qua Thời gian giải phóng NV. Nhân sự sẽ làm duy nhất 1 ca này từ đầu đến cuối tổng thời gian.';
                  oldLabel.appendChild(descSpan);
                }
              }

              // TẠO THÊM MODULE 2
              const npoWrapper = document.createElement('div');
              npoWrapper.id = 'dvkt-nop-checkbox-wrapper';
              npoWrapper.className = 'dvkt-custom-box';
              npoWrapper.style.color = '#b45309';
              npoWrapper.innerHTML = `
                 <input type="checkbox" id="dvkt-nop-checkbox" ${isNop ? 'checked' : ''}>
                 <div>
                   <div class="title">🚫 2 - Cấm lồng kết quả</div>
                   <div class="desc">Tuyệt đối không lồng Bệnh Nhân khác trong lúc đang làm, dù có thời gian chờ. Phải hoàn tất tổng thời gian rồi mới lồng việc khác.</div>
                 </div>
              `;
              exclusiveContainer.parentElement.insertBefore(npoWrapper, exclusiveContainer.nextSibling);

              // TẠO THÊM MODULE 3: TÙY CHỌN LỒNG CA
              const customOverlapWrapper = document.createElement('div');
              customOverlapWrapper.id = 'dvkt-custom-overlap-wrapper';
              customOverlapWrapper.className = 'dvkt-custom-box';
              customOverlapWrapper.style.flexDirection = 'column';
              customOverlapWrapper.style.alignItems = 'flex-start';
              
              let allowIds = [], denyIds = [];
              if (serviceName) {
                 const svc = cachedServices.find(s => s.name === serviceName);
                 if (svc) {
                    allowIds = svc.allow_idle_overlap_with ? svc.allow_idle_overlap_with.split(',').map(x=>x.trim()) : [];
                    denyIds = svc.deny_idle_overlap_with ? svc.deny_idle_overlap_with.split(',').map(x=>x.trim()) : [];
                 }
              }
              
              const allowHtml = cachedServices.filter(s => s.name !== serviceName).map(s => {
                 const isChecked = allowIds.includes(String(s.id)) ? 'checked' : '';
                 return `<label style="display:flex; align-items:center; gap:6px; font-weight:normal; font-size:12px; cursor:pointer;"><input type="checkbox" class="dvkt-allow-cb" value="${s.id}" ${isChecked}> ${s.name}</label>`;
              }).join('');

              const denyHtml = cachedServices.filter(s => s.name !== serviceName).map(s => {
                 const isChecked = denyIds.includes(String(s.id)) ? 'checked' : '';
                 return `<label style="display:flex; align-items:center; gap:6px; font-weight:normal; font-size:12px; cursor:pointer;"><input type="checkbox" class="dvkt-deny-cb" value="${s.id}" ${isChecked}> ${s.name}</label>`;
              }).join('');

              customOverlapWrapper.innerHTML = `
                 <div style="width:100%; margin-bottom:8px;">
                   <div class="title" style="color:#059669;">✅ 3 - CHO PHÉP lồng vào giờ chờ của:</div>
                   <div class="desc" style="margin-bottom:4px">Đánh dấu tích để liên kết lồng kết quả. Cho phép lồng chéo, tiết kiệm thời gian khám.</div>
                   <div style="height: 100px; overflow-y: auto; overflow-x: hidden; border: 1px solid #ccc; border-radius: 4px; padding: 6px; background: white; display:flex; flex-direction:column; gap:4px;">
                      ${allowHtml || '<i style="font-size:11px;color:#999;">Không có Dịch vụ khác</i>'}
                   </div>
                 </div>
                 <div style="width:100%;">
                   <div class="title" style="color:#9f1239;">🚫 4 - CẤM TUYỆT ĐỐI lồng vào giờ chờ của:</div>
                   <div class="desc" style="margin-bottom:4px">Đánh dấu tích để chọn nhiều. Chặn ngay cả khi đủ thời gian chờ.</div>
                   <div style="height: 100px; overflow-y: auto; overflow-x: hidden; border: 1px solid #ccc; border-radius: 4px; padding: 6px; background: white; display:flex; flex-direction:column; gap:4px;">
                      ${denyHtml || '<i style="font-size:11px;color:#999;">Không có Dịch vụ khác</i>'}
                   </div>
                 </div>
              `;
              
              exclusiveContainer.parentElement.insertBefore(customOverlapWrapper, npoWrapper.nextSibling);
           }
        }
      }
    });
    } finally { isPatching = false; }
  }

  // Debounce: chỉ chạy sau 500ms idle — tránh chạy liên tục khi React re-render
  const debouncedObserveCheck = debounce(_doObserveCheck, 500);

  function observeUI() {
    const observer = new MutationObserver((mutations) => {
      // BỎ QUA hoàn toàn nếu đang focus vào ô nhập liệu (tránh vòng lặp React)
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        return;
      }
      // BỎ QUA nếu đang trong quá trình patch
      if (isPatching) return;
      // Chỉ trigger nếu có thay đổi thực sự về cấu trúc DOM (thêm node mới)
      const hasStructuralChange = mutations.some(m => m.type === 'childList' && m.addedNodes.length > 0);
      if (hasStructuralChange) {
        debouncedObserveCheck();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // === STAFF LEAVE UI MODULE ===
  let leaveList = [];
  let staffList = [];
  let filterDate = new Date().toISOString().slice(0, 10);
  let editId = null;

  async function apiFetch(url, options = {}) {
    const res = await window.fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
    return res.json();
  }

  async function openStaffLeaveModal() {
    staffList = await apiFetch('/api/staff');
    leaveList = await apiFetch(`/api/staff-leaves?date=${filterDate}`);
    editId = null;
    renderModal();
  }

  function renderModal() {
    let old = document.getElementById('staff-leave-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'staff-leave-overlay';
    overlay.className = 'staff-leave-overlay';
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

    const modal = document.createElement('div');
    modal.className = 'staff-leave-modal';
    modal.innerHTML = `
      <div class="sl-header">
         <h2>🏖️ Tùy chọn thời gian nghỉ phép (Ngày / Giờ)</h2>
         <button style="background:transparent;border:none;color:white;font-size:20px;cursor:pointer;" onclick="document.getElementById('staff-leave-overlay').remove()">✕</button>
      </div>
      <div style="display:flex; padding: 12px 24px; background:#f1f5f9; gap:10px;">
         <button id="sl-tab-list" class="sl-btn" style="background:#0f172a;">📋 Danh sách nghỉ</button>
         <button id="sl-tab-add" class="sl-btn" style="background:transparent; color:#0f172a; border:1px solid #cbd5e1;">${editId ? '✏️ Cập nhật' : '➕ Tạo thời gian nghỉ'}</button>
      </div>
      <div id="sl-content" class="sl-body"></div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    document.getElementById('sl-tab-list').onclick = () => { editId = null; renderModal(); };
    document.getElementById('sl-tab-add').onclick = () => renderForm();

    renderList();
  }

  function renderList() {
    const content = document.getElementById('sl-content');
    let html = `
      <div style="display:flex; gap:10px; margin-bottom: 16px; align-items:center;">
        <b>Lọc ngày:</b>
        <input type="date" id="sl-f-date" value="${filterDate}" class="sl-btn" style="background:white; color:black; border:1px solid #ccc;">
        <button id="sl-f-btn" class="sl-btn sl-btn-primary">Áp dụng</button>
        <button id="sl-f-all" class="sl-btn sl-btn-ghost">Tất cả</button>
      </div>
    `;

    if (leaveList.length === 0) {
      html += `<div>Chưa có cài đặt thời gian nghỉ nào cho ngày này.</div>`;
    } else {
      html += `<table class="sl-table">
        <tr><th>Nhân sự</th><th>Ngày</th><th>Hình thức</th><th>Thời gian</th><th>Lý do</th><th>Thao tác</th></tr>
        ${leaveList.map(l => `
          <tr>
            <td><b>${l.staff_name}</b></td>
            <td>${l.leave_date}</td>
            <td>${l.leave_type === 'full_day' ? '<span style="color:#dc2626;font-weight:bold;">Cả ngày</span>' : '<span style="color:#d97706;font-weight:bold;">Theo giờ</span>'}</td>
            <td>${l.leave_type === 'time_range' ? `${l.start_time} - ${l.end_time}` : '24h'}</td>
            <td>${l.reason || ''}</td>
            <td>
              <button class="sl-btn sl-btn-edit sl-edit" data-id="${l.id}">Sửa</button>
              <button class="sl-btn sl-btn-delete sl-del" data-id="${l.id}">Xóa</button>
            </td>
          </tr>
        `).join('')}
      </table>`;
    }
    content.innerHTML = html;

    document.getElementById('sl-f-btn').onclick = async () => { filterDate = document.getElementById('sl-f-date').value; leaveList = await apiFetch(`/api/staff-leaves?date=${filterDate}`); renderList(); };
    document.getElementById('sl-f-all').onclick = async () => { filterDate = ''; leaveList = await apiFetch(`/api/staff-leaves`); renderList(); };
    content.querySelectorAll('.sl-edit').forEach(b => b.onclick = () => { editId = parseInt(b.dataset.id); renderForm(); });
    content.querySelectorAll('.sl-del').forEach(b => b.onclick = async () => {
      if (confirm('Xóa thiết lập nghỉ phép này?')) {
        await apiFetch(`/api/staff-leaves/${b.dataset.id}`, { method: 'DELETE' });
        leaveList = await apiFetch(`/api/staff-leaves?date=${filterDate}`);
        renderList();
      }
    });
  }

  function renderForm() {
    const content = document.getElementById('sl-content');
    document.getElementById('sl-tab-list').style.background = 'transparent';
    document.getElementById('sl-tab-list').style.color = '#0f172a';
    document.getElementById('sl-tab-add').style.background = '#0f172a';
    document.getElementById('sl-tab-add').style.color = 'white';
    document.getElementById('sl-tab-add').textContent = editId ? '✏️ Cập nhật' : '➕ Tạo thời gian nghỉ';

    const editData = editId ? leaveList.find(l => l.id === editId) : null;
    const lType = editData ? editData.leave_type : 'time_range'; // Default to time range as clinics mostly use hours

    content.innerHTML = `
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div class="sl-form-group">
          <label>Nhân sự xin nghỉ:</label>
          <select id="sl-staff_id">
            ${staffList.map(s => `<option value="${s.id}" ${editData && editData.staff_id === s.id ? 'selected':''}>${s.name} - ${s.role}</option>`).join('')}
          </select>
        </div>
        <div class="sl-form-group">
          <label>Ngày nghỉ:</label>
          <input type="date" id="sl-date" value="${editData ? editData.leave_date : new Date().toISOString().slice(0,10)}">
        </div>
        <div class="sl-form-group" style="grid-column: span 2;">
          <label>Loại hình nghỉ:</label>
          <div style="display:flex; gap: 20px;">
            <label style="font-weight:normal; font-size:15px; cursor:pointer;"><input type="radio" name="sl-type" value="time_range" ${lType==='time_range'?'checked':''}> ⏰ Nghỉ theo giờ</label>
            <label style="font-weight:normal; font-size:15px; cursor:pointer;"><input type="radio" name="sl-type" value="full_day" ${lType==='full_day'?'checked':''}> 🌙 Nghỉ trọn ngày (24h)</label>
          </div>
        </div>
        <div class="sl-form-group" id="sl-time-wrapper" style="grid-column: span 2; display: ${lType==='time_range'?'flex':'none'}; gap: 16px; background:#fef3c7; padding:16px; border-radius:8px;">
          <div style="flex:1;">
            <label>Giờ bắt đầu nghỉ:</label>
            <input type="time" id="sl-start" value="${editData?.start_time || '07:00'}">
          </div>
          <div style="flex:1;">
            <label>Giờ quay lại làm (Kết thúc nghỉ):</label>
            <input type="time" id="sl-end" value="${editData?.end_time || '09:00'}">
          </div>
        </div>
        <div class="sl-form-group" style="grid-column: span 2;">
          <label>Lý do (Ghi chú):</label>
          <input type="text" id="sl-reason" value="${editData?.reason || ''}" placeholder="Vd: Việc bận gia đình...">
        </div>
      </div>
      <div style="margin-top:20px; display:flex; justify-content:flex-end; gap:10px;">
        <button class="sl-btn sl-btn-ghost" onclick="document.getElementById('sl-tab-list').click()">Hủy thao tác</button>
        <button class="sl-btn sl-btn-primary" id="sl-save">💾 ${editData ? 'Lưu cập nhật' : 'Lưu cài đặt nghỉ phép'}</button>
      </div>
    `;

    document.querySelectorAll('input[name="sl-type"]').forEach(r => {
      r.onchange = e => { document.getElementById('sl-time-wrapper').style.display = e.target.value === 'time_range' ? 'flex' : 'none'; };
    });

    document.getElementById('sl-save').onclick = async () => {
      const payload = {
        staff_id: parseInt(document.getElementById('sl-staff_id').value),
        leave_date: document.getElementById('sl-date').value,
        leave_type: document.querySelector('input[name="sl-type"]:checked').value,
        start_time: document.getElementById('sl-start').value || null,
        end_time: document.getElementById('sl-end').value || null,
        reason: document.getElementById('sl-reason').value
      };
      
      const method = editData ? 'PUT' : 'POST';
      const endpoint = editData ? `/api/staff-leaves/${editId}` : '/api/staff-leaves';
      
      await apiFetch(endpoint, { method, body: JSON.stringify(payload) });
      filterDate = payload.leave_date;
      editId = null;
      leaveList = await apiFetch(`/api/staff-leaves?date=${filterDate}`);
      renderList();
    };
  }

  // === PATCH DEBOUNCE CHO REACT INPUTS ===
  // Tránh MutationObserver can thiệp khi đang gõ text
  function patchReactInputDebounce() {
    // Khi focus vào input → tạm dừng observer patch
    document.addEventListener('focusin', (e) => {
      const el = e.target;
      if (!el) return;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.setAttribute('autocomplete', 'off');
        el.setAttribute('spellcheck', 'false');
        el.setAttribute('autocorrect', 'off');
        el.setAttribute('autocapitalize', 'off');
      }
    }, { passive: true });
    // Khi blur khỏi input → chạy lại observer 1 lần
    document.addEventListener('focusout', (e) => {
      const el = e.target;
      if (!el) return;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        setTimeout(() => debouncedObserveCheck(), 300);
      }
    }, { passive: true });
  }

  // Khởi động
  function init() {
    injectStyles();
    observeUI();
    patchReactInputDebounce();
    console.log('[Module] Staff Leave & UI Tuning Loaded v1.2!');
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
  else { init(); }

})();
