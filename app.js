(() => {
  const PAGE_INFO = {
    overview: {
      eyebrow: "LOGISTICS OVERVIEW",
      title: "ภาพรวมพัสดุ",
      description: "มองเห็นสถานะและแนวโน้มการจัดส่งจากข้อมูลชุดเดียวกัน",
    },
    shipments: {
      eyebrow: "SHIPMENT REGISTER",
      title: "รายการพัสดุ",
      description: "ค้นหา ตรวจสอบ และส่งออกรายการตามเงื่อนไขที่เลือก",
    },
    performance: {
      eyebrow: "CARRIER PERFORMANCE",
      title: "วิเคราะห์ขนส่ง",
      description: "เปรียบเทียบบริษัทขนส่ง ภูมิภาค และช่องทางสั่งซื้อ",
    },
    quality: {
      eyebrow: "DATA QUALITY",
      title: "คุณภาพข้อมูล",
      description: "ตรวจวิธีจัดการข้อมูล ค่าผิดปกติ และข้อจำกัดก่อนนำไปใช้",
    },
  };
  const STATUS_COLORS = {
    "ส่งสำเร็จ": "#5a9c73",
    "กำลังจัดส่ง": "#d2a253",
    "ตีกลับ": "#ce7168",
    "จัดส่งไม่สำเร็จ": "#9270ae",
    "ไม่ระบุ": "#aeb8b1",
  };
  const PAGE_SIZE = 12;
  const MONTHS_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const state = {
    page: "overview",
    currentPage: 1,
    sortBy: "received_date",
    sortDirection: "desc",
    toastTimer: null,
    renderDuration: 0,
  };

  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
  const numberValue = (value) => Number.isFinite(Number(value)) && value !== null && value !== "" ? Number(value) : null;
  const sum = (rows, field) => rows.reduce((total, row) => total + (numberValue(row[field]) ?? 0), 0);
  const average = (values) => values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
  const formatNumber = (value, digits = 0) => value === null || !Number.isFinite(value)
    ? "—"
    : new Intl.NumberFormat("th-TH", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
  const formatBaht = (value, digits = 0) => value === null || !Number.isFinite(value)
    ? "—"
    : `฿${formatNumber(value, digits)}`;
  const formatPercent = (value) => value === null || !Number.isFinite(value) ? "—" : `${formatNumber(value, 1)}%`;
  const formatDate = (value) => {
    if (!value) return "ไม่ระบุ";
    const parts = value.split("-");
    return parts.length === 3 ? `${Number(parts[2])} ${MONTHS_TH[Number(parts[1]) - 1]} ${parts[0]}` : value;
  };
  const countBy = (rows, field) => {
    const counts = new Map();
    rows.forEach((row) => {
      const label = row[field] || "ไม่ระบุ";
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return [...counts.entries()].map(([label, count]) => ({ label, count }));
  };
  const groupBy = (rows, field) => {
    const groups = new Map();
    rows.forEach((row) => {
      const label = row[field] || "ไม่ระบุ";
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(row);
    });
    return groups;
  };
  const rateOf = (rows, predicate) => rows.length ? rows.filter(predicate).length / rows.length * 100 : null;
  const meanField = (rows, field) => average(rows.map((row) => numberValue(row[field])).filter((value) => value !== null));
  const statusClass = (status) => {
    if (status === "ส่งสำเร็จ") return "status-success";
    if (status === "กำลังจัดส่ง") return "status-progress";
    if (status === "ตีกลับ") return "status-return";
    if (status === "จัดส่งไม่สำเร็จ") return "status-failed";
    return "status-unknown";
  };
  const statusPill = (status) => `<span class="status-pill ${statusClass(status)}">${escapeHtml(status || "ไม่ระบุ")}</span>`;

  function showDataError(message) {
    $("#load-status").textContent = "โหลดข้อมูลไม่สำเร็จ";
    $(".status-dot").style.background = "#bd5b57";
    $("#page-content").innerHTML = `<div class="empty-state"><div><strong>ไม่สามารถเปิดชุดข้อมูลได้</strong>${escapeHtml(message)}<p>ตรวจว่าไฟล์ data/shipments.js มีอยู่ แล้วรัน python scripts/clean_data.py อีกครั้ง</p></div></div>`;
  }

  function init() {
    if (!Array.isArray(window.SHIPMENTS) || !window.DATA_QUALITY) {
      showDataError("ไม่พบไฟล์ข้อมูลที่ใช้แสดงผล");
      return;
    }

    $("#load-status").textContent = "ข้อมูลพร้อมใช้งาน";
    $("#nav-count").textContent = formatNumber(window.SHIPMENTS.length);
    populateSelect("#status-filter", [...new Set(window.SHIPMENTS.map((row) => row.status))].sort(), "ทุกสถานะ");
    populateSelect("#carrier-filter", [...new Set(window.SHIPMENTS.map((row) => row.carrier))].sort(), "ทุกบริษัท");
    document.querySelectorAll(".nav-item[data-page]").forEach((button) => {
      button.addEventListener("click", () => navigate(button.dataset.page));
    });
    $(".brand").addEventListener("click", (event) => {
      event.preventDefault();
      navigate("overview");
    });
    ["#date-from", "#date-to", "#status-filter", "#carrier-filter", "#search-filter"].forEach((selector) => {
      $(selector).addEventListener("input", () => {
        state.currentPage = 1;
        refreshContent();
      });
      $(selector).addEventListener("change", () => {
        state.currentPage = 1;
        refreshContent();
      });
    });
    $("#clear-filters").addEventListener("click", clearFilters);
    $("#page-content").addEventListener("click", handleContentClick);
    refreshContent();
  }

  function populateSelect(selector, options, firstLabel) {
    const select = $(selector);
    select.innerHTML = `<option value="">${escapeHtml(firstLabel)}</option>${options.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("")}`;
  }

  function navigate(page) {
    if (!PAGE_INFO[page] || page === state.page) return;
    state.page = page;
    state.currentPage = 1;
    document.querySelectorAll(".nav-item[data-page]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.page === page);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
    refreshContent();
  }

  function clearFilters() {
    $("#date-from").value = "";
    $("#date-to").value = "";
    $("#status-filter").value = "";
    $("#carrier-filter").value = "";
    $("#search-filter").value = "";
    state.currentPage = 1;
    refreshContent();
    announce("ล้างตัวกรองทั้งหมดแล้ว");
  }

  function getFilteredRows() {
    const from = $("#date-from").value;
    const to = $("#date-to").value;
    const status = $("#status-filter").value;
    const carrier = $("#carrier-filter").value;
    const query = $("#search-filter").value.trim().toLocaleLowerCase("th");
    return window.SHIPMENTS.filter((row) => {
      if (from && (!row.received_date || row.received_date < from)) return false;
      if (to && (!row.received_date || row.received_date > to)) return false;
      if (status && row.status !== status) return false;
      if (carrier && row.carrier !== carrier) return false;
      if (query) {
        const searchable = [row.tracking_id, row.carrier, row.province, row.product_type, row.failure_reason]
          .join(" ").toLocaleLowerCase("th");
        if (!searchable.includes(query)) return false;
      }
      return true;
    });
  }

  function refreshContent() {
    const started = performance.now();
    const rows = getFilteredRows();
    const info = PAGE_INFO[state.page];
    $("#page-title").textContent = info.title;
    $("#page-eyebrow").textContent = info.eyebrow;
    $("#page-description").textContent = info.description;
    $("#breadcrumb-current").textContent = info.title;
    if (!rows.length) {
      $("#page-content").innerHTML = `<div class="panel empty-state"><div><strong>ไม่พบพัสดุที่ตรงกับเงื่อนไข</strong>ลองเปลี่ยนช่วงวันที่หรือสถานะ หรือกดล้างตัวกรองเพื่อดูข้อมูลทั้งหมด<br><button class="button button-quiet" data-action="clear" type="button">ล้างตัวกรอง</button></div></div>`;
    } else if (state.page === "overview") {
      $("#page-content").innerHTML = renderOverview(rows);
    } else if (state.page === "shipments") {
      $("#page-content").innerHTML = renderShipments(rows);
    } else if (state.page === "performance") {
      $("#page-content").innerHTML = renderPerformance(rows);
    } else {
      $("#page-content").innerHTML = renderQuality(rows);
    }
    state.renderDuration = performance.now() - started;
    $("#render-time").textContent = `ประมวลผลตัวกรอง ${formatNumber(state.renderDuration, 1)} ms`;
  }

  function renderKpi(label, value, note, icon, tone = "positive") {
    return `<article class="kpi-card"><div class="kpi-top"><span>${label}</span><span class="kpi-icon" aria-hidden="true">${icon}</span></div><div class="kpi-value">${value}</div><div class="kpi-foot"><span class="${tone}">${note}</span></div></article>`;
  }

  function renderKpis(rows) {
    const successRate = rateOf(rows, (row) => row.status === "ส่งสำเร็จ");
    const completeDays = rows.filter((row) => row.status === "ส่งสำเร็จ")
      .map((row) => numberValue(row.delivery_days)).filter((value) => value !== null);
    const totalFee = rows.reduce((total, row) => total + Math.max(0, numberValue(row.shipping_fee_thb) ?? 0), 0);
    return `<section class="kpi-grid">
      ${renderKpi("พัสดุทั้งหมด", formatNumber(rows.length), "รายการในชุดข้อมูลที่กรอง", "▣")}
      ${renderKpi("อัตราส่งสำเร็จ", formatPercent(successRate), `${formatNumber(rows.filter((row) => row.status === "ส่งสำเร็จ").length)} รายการ`, "✓")}
      ${renderKpi("เวลาจัดส่งเฉลี่ย", completeDays.length ? `${formatNumber(average(completeDays), 1)} วัน` : "—", `คำนวณจาก ${formatNumber(completeDays.length)} รายการที่มีข้อมูล`, "◷", "warning")}
      ${renderKpi("ค่าจัดส่งรวม", formatBaht(totalFee), "รวมค่าบวกที่อ่านได้; ยังมี outlier", "฿", "warning")}
    </section>`;
  }

  function renderOverview(rows) {
    const monthly = new Map();
    rows.forEach((row) => {
      if (!row.received_date) return;
      const month = row.received_date.slice(0, 7);
      monthly.set(month, (monthly.get(month) || 0) + 1);
    });
    const trend = [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => ({ label: month.slice(5), displayLabel: MONTHS_TH[Number(month.slice(5)) - 1], value }));
    const statuses = countBy(rows, "status").sort((a, b) => b.count - a.count);
    const carriers = countBy(rows, "carrier").filter((entry) => entry.label !== "ไม่ระบุ")
      .sort((a, b) => b.count - a.count).slice(0, 5);
    const regions = countBy(rows, "region").sort((a, b) => b.count - a.count).slice(0, 5);
    const leadingCarrier = carriers[0];
    const successRate = rateOf(rows, (row) => row.status === "ส่งสำเร็จ");
    const progressCount = rows.filter((row) => row.status === "กำลังจัดส่ง").length;
    return `${renderKpis(rows)}
      <div class="content-grid grid-main-side">
        <section class="panel"><div class="panel-heading"><div><h2 class="panel-title">แนวโน้มรับพัสดุรายเดือน</h2><p class="panel-subtitle">จำนวนรายการตามวันที่รับพัสดุ · หน่วย: พัสดุ</p></div><span class="panel-action">ข้อมูลชุดที่กรอง</span></div>${renderLineChart(trend)}</section>
        <section class="panel"><div class="panel-heading"><div><h2 class="panel-title">สัดส่วนสถานะพัสดุ</h2><p class="panel-subtitle">สถานะหลังรวมชื่อที่มีความหมายเดียวกัน</p></div></div>${renderDonut(statuses)}</section>
      </div>
      <div class="content-grid grid-equal">
        <section class="panel"><div class="panel-heading"><div><h2 class="panel-title">บริษัทขนส่งที่มีรายการมากที่สุด</h2><p class="panel-subtitle">จำนวนพัสดุตามบริษัท · หน่วย: รายการ</p></div><span class="panel-action">Top 5</span></div>${renderBars(carriers)}</section>
        <section class="panel"><div class="panel-heading"><div><h2 class="panel-title">ปลายทางตามภูมิภาค</h2><p class="panel-subtitle">จำนวนพัสดุในแต่ละภูมิภาค · หน่วย: รายการ</p></div></div>${renderBars(regions)}</section>
      </div>
      <div class="insight-strip"><span class="insight-bullet">↗</span><div><strong>สรุปจากตัวกรองนี้:</strong> อัตราส่งสำเร็จ ${formatPercent(successRate)}${leadingCarrier ? ` · ${escapeHtml(leadingCarrier.label)} มีรายการมากที่สุด ${formatNumber(leadingCarrier.count)} พัสดุ` : ""} · ยังอยู่ระหว่างจัดส่ง ${formatNumber(progressCount)} รายการ ตัวเลขสะท้อนข้อมูลที่กรอง ไม่ใช่ข้อมูลทั้งชุดเสมอไป</div></div>`;
  }

  function renderLineChart(points) {
    if (!points.length) return `<div class="empty-state">ไม่มีวันที่รับพัสดุที่ถูกต้องในตัวกรองนี้</div>`;
    const width = 620;
    const height = 205;
    const left = 38;
    const right = 12;
    const top = 14;
    const bottom = 32;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const maximum = Math.max(1, ...points.map((point) => point.value));
    const ceiling = Math.ceil(maximum / 5) * 5 || 1;
    const coords = points.map((point, index) => ({
      ...point,
      x: points.length === 1 ? left + plotWidth / 2 : left + index * plotWidth / (points.length - 1),
      y: top + plotHeight - (point.value / ceiling) * plotHeight,
    }));
    const path = coords.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
    const areaPath = `${path} L${coords[coords.length - 1].x.toFixed(1)},${(top + plotHeight).toFixed(1)} L${coords[0].x.toFixed(1)},${(top + plotHeight).toFixed(1)} Z`;
    const ticks = [0, ceiling / 2, ceiling];
    const tickLines = ticks.map((tick) => {
      const y = top + plotHeight - (tick / ceiling) * plotHeight;
      return `<line class="grid-line" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}"/><text x="${left - 8}" y="${y + 3}" text-anchor="end">${formatNumber(tick)}</text>`;
    }).join("");
    const labelEvery = Math.max(1, Math.ceil(coords.length / 7));
    const labels = coords.map((point, index) => index % labelEvery === 0 || index === coords.length - 1
      ? `<text x="${point.x}" y="${height - 8}" text-anchor="middle">${escapeHtml(point.displayLabel)}</text>` : "").join("");
    const dots = coords.map((point) => `<circle class="series-dot" cx="${point.x}" cy="${point.y}" r="3.3"><title>${escapeHtml(point.displayLabel)} · ${formatNumber(point.value)} พัสดุ</title></circle>`).join("");
    return `<svg class="line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="กราฟแนวโน้มรับพัสดุรายเดือน">
      <defs><linearGradient id="line-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#6da985" stop-opacity=".22"/><stop offset="100%" stop-color="#6da985" stop-opacity=".01"/></linearGradient></defs>
      ${tickLines}<path class="area-fill" d="${areaPath}"/><path class="series-line" d="${path}"/>${dots}${labels}
    </svg>`;
  }

  function renderBars(items) {
    if (!items.length) return `<div class="empty-state">ไม่มีข้อมูลสำหรับแสดงกราฟ</div>`;
    const max = Math.max(1, ...items.map((item) => item.count));
    return `<div class="bar-list">${items.map((item) => `<div class="bar-row"><span class="bar-label" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span><div class="bar-track" role="img" aria-label="${escapeHtml(item.label)} ${formatNumber(item.count)} รายการ"><div class="bar-fill" style="width:${Math.max(2, item.count / max * 100)}%"></div></div><span class="bar-value">${formatNumber(item.count)}</span></div>`).join("")}</div>`;
  }

  function renderDonut(items) {
    if (!items.length) return `<div class="empty-state">ไม่มีสถานะพัสดุให้แสดง</div>`;
    let position = 0;
    const total = items.reduce((value, item) => value + item.count, 0);
    const segments = items.map((item) => {
      const start = position;
      position += item.count / total * 100;
      return `${STATUS_COLORS[item.label] || "#aeb8b1"} ${start.toFixed(2)}% ${position.toFixed(2)}%`;
    });
    const legend = items.map((item) => `<div class="legend-row"><span class="legend-dot" style="background:${STATUS_COLORS[item.label] || "#aeb8b1"}"></span><span>${escapeHtml(item.label)}</span><strong>${formatNumber(item.count)}</strong></div>`).join("");
    return `<div class="donut-layout"><div class="donut" style="background:conic-gradient(${segments.join(",")})" role="img" aria-label="แผนภูมิสัดส่วนสถานะ"><div class="donut-center"><strong>${formatNumber(total)}</strong><span>พัสดุ</span></div></div><div class="legend">${legend}</div></div>`;
  }

  function renderShipments(rows) {
    const sorted = [...rows].sort((a, b) => {
      const left = a[state.sortBy];
      const right = b[state.sortBy];
      const order = state.sortDirection === "asc" ? 1 : -1;
      if (left === null || left === "") return 1;
      if (right === null || right === "") return -1;
      if (typeof left === "number" && typeof right === "number") return (left - right) * order;
      return String(left).localeCompare(String(right), "th") * order;
    });
    const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    state.currentPage = Math.min(state.currentPage, pageCount);
    const pageRows = sorted.slice((state.currentPage - 1) * PAGE_SIZE, state.currentPage * PAGE_SIZE);
    const from = (state.currentPage - 1) * PAGE_SIZE + 1;
    const to = Math.min(state.currentPage * PAGE_SIZE, sorted.length);
    const body = pageRows.map((row) => `<tr>
      <td><span class="tracking-id">${escapeHtml(row.tracking_id)}</span>${row.id_collision ? '<span title="รหัสซ้ำแต่รายละเอียดต่างกัน" class="muted-note"> †</span>' : ""}</td>
      <td>${escapeHtml(formatDate(row.received_date))}</td>
      <td>${escapeHtml(row.carrier)}</td>
      <td>${escapeHtml(row.province)}</td>
      <td>${escapeHtml(row.product_type)}</td>
      <td>${row.weight_kg === null ? "—" : `${formatNumber(row.weight_kg, 2)} กก.`}</td>
      <td>${row.shipping_fee_thb === null ? "—" : formatBaht(row.shipping_fee_thb, 2)}</td>
      <td>${statusPill(row.status)}</td>
      <td>${row.delivery_days === null ? "—" : `${formatNumber(row.delivery_days)} วัน`}</td>
    </tr>`).join("");
    return `<section class="panel table-panel">
      <div class="table-toolbar"><div><h2 class="panel-title">ทะเบียนพัสดุ</h2><p class="panel-subtitle">รายการที่ตรงกับตัวกรองและคำค้น</p></div><div class="table-toolbar-actions"><span class="table-count">${formatNumber(rows.length)} รายการ</span><button class="button button-primary" data-action="export" type="button">↓ ส่งออก CSV</button></div></div>
      <div class="table-wrap"><table><thead><tr>
        <th>รหัสพัสดุ</th>
        <th><button class="sort-button" data-sort="received_date" type="button">วันที่รับ ${sortIcon("received_date")}</button></th>
        <th>บริษัทขนส่ง</th><th>จังหวัดปลายทาง</th><th>ประเภทสินค้า</th><th>น้ำหนัก</th>
        <th><button class="sort-button" data-sort="shipping_fee_thb" type="button">ค่าจัดส่ง ${sortIcon("shipping_fee_thb")}</button></th>
        <th><button class="sort-button" data-sort="status" type="button">สถานะ ${sortIcon("status")}</button></th><th>ระยะเวลา</th>
      </tr></thead><tbody>${body}</tbody></table></div>
      <div class="table-footer"><span>แสดง ${formatNumber(from)}–${formatNumber(to)} จาก ${formatNumber(sorted.length)} รายการ</span><div class="pagination"><button class="page-button" data-page-index="${state.currentPage - 1}" type="button" aria-label="หน้าก่อนหน้า" ${state.currentPage === 1 ? "disabled" : ""}>‹</button><span>หน้า ${formatNumber(state.currentPage)} / ${formatNumber(pageCount)}</span><button class="page-button" data-page-index="${state.currentPage + 1}" type="button" aria-label="หน้าถัดไป" ${state.currentPage === pageCount ? "disabled" : ""}>›</button></div></div>
      </section>
      <p class="muted-note">† รหัสซ้ำที่มีรายละเอียดต่างกันคงไว้เป็นคนละรายการ เพื่อหลีกเลี่ยงการลบข้อมูลโดยไม่มีหลักฐาน</p>`;
  }

  function sortIcon(field) {
    if (state.sortBy !== field) return "↕";
    return state.sortDirection === "asc" ? "↑" : "↓";
  }

  function renderPerformance(rows) {
    const carriers = [...groupBy(rows, "carrier").entries()]
      .filter(([name]) => name !== "ไม่ระบุ")
      .map(([name, group]) => ({
        name,
        count: group.length,
        successRate: rateOf(group, (row) => row.status === "ส่งสำเร็จ"),
        deliveryDays: meanField(group.filter((row) => row.status === "ส่งสำเร็จ"), "delivery_days"),
        satisfaction: meanField(group, "satisfaction_score"),
        shippingFee: average(group.map((row) => numberValue(row.shipping_fee_thb)).filter((value) => value !== null && value >= 0)),
      })).sort((a, b) => b.count - a.count);
    const carrierBars = carriers.slice(0, 6).map(({ name, count }) => ({ label: name, count }));
    const regionBars = countBy(rows, "region").sort((a, b) => b.count - a.count);
    const channelBars = countBy(rows, "order_channel").filter((item) => item.label !== "ไม่ระบุ")
      .sort((a, b) => b.count - a.count);
    const tableRows = carriers.map((carrier) => `<tr>
      <td class="carrier-name">${escapeHtml(carrier.name)}</td><td>${formatNumber(carrier.count)}</td>
      <td>${formatPercent(carrier.successRate)}</td><td>${carrier.deliveryDays === null ? "—" : `${formatNumber(carrier.deliveryDays, 1)} วัน`}</td>
      <td>${carrier.satisfaction === null ? "—" : `${formatNumber(carrier.satisfaction, 1)} / 5`}</td>
      <td>${carrier.shippingFee === null ? "—" : formatBaht(carrier.shippingFee, 0)}</td>
    </tr>`).join("");
    const bestRate = [...carriers].filter((carrier) => carrier.count >= 5 && carrier.successRate !== null)
      .sort((a, b) => b.successRate - a.successRate)[0];
    return `<div class="content-grid grid-equal">
      <section class="panel"><div class="panel-heading"><div><h2 class="panel-title">ปริมาณงานตามบริษัท</h2><p class="panel-subtitle">จำนวนพัสดุที่รับ · หน่วย: รายการ</p></div></div>${renderBars(carrierBars)}</section>
      <section class="panel"><div class="panel-heading"><div><h2 class="panel-title">พื้นที่ปลายทาง</h2><p class="panel-subtitle">จำนวนพัสดุตามภูมิภาค · หน่วย: รายการ</p></div></div>${renderBars(regionBars)}</section>
    </div>
    <div class="content-grid grid-main-side">
      <section class="panel"><div class="panel-heading"><div><h2 class="panel-title">เปรียบเทียบผลการให้บริการ</h2><p class="panel-subtitle">อัตราส่งสำเร็จและวันจัดส่งเฉลี่ยจากรายการที่มีข้อมูล</p></div></div>
        <div class="table-wrap"><table class="carrier-table"><thead><tr><th>บริษัทขนส่ง</th><th>พัสดุ</th><th>สำเร็จ</th><th>เฉลี่ย</th><th>พึงพอใจ</th><th>ค่าจัดส่งเฉลี่ย</th></tr></thead><tbody>${tableRows || `<tr><td colspan="6">ไม่มีข้อมูลบริษัทขนส่ง</td></tr>`}</tbody></table></div>
        <p class="chart-caption">เปรียบเทียบเฉพาะกลุ่มที่มีข้อมูล ตัวเลขเฉลี่ยไม่ใช่ราคาหรือ SLA ที่บริษัทรับรอง</p>
      </section>
      <section class="panel"><div class="panel-heading"><div><h2 class="panel-title">ช่องทางสั่งซื้อ</h2><p class="panel-subtitle">จำนวนพัสดุตามช่องทาง · หน่วย: รายการ</p></div></div>${renderBars(channelBars)}</section>
    </div>
    <div class="insight-strip"><span class="insight-bullet">i</span><div><strong>อ่านผลอย่างระมัดระวัง:</strong> ${bestRate ? `${escapeHtml(bestRate.name)} มีอัตราส่งสำเร็จสูงสุดในกลุ่มที่มีอย่างน้อย 5 รายการ (${formatPercent(bestRate.successRate)})` : "ข้อมูลหลังกรองยังไม่พอสำหรับเปรียบเทียบบริษัท"} ควรตรวจจำนวนตัวอย่าง ค่าผิดปกติ และข้อมูลที่ขาดก่อนสรุปผล</div></div>`;
  }

  function renderQuality(rows) {
    const quality = window.DATA_QUALITY;
    const totalMissing = Object.values(quality.missing_values_after_cleaning).reduce((total, count) => total + count, 0);
    const outlierRows = quality.outlier_review_rows || [];
    const outlierExamples = outlierRows.slice(0, 4).map((outlier) =>
      `<div class="quality-row"><span>${escapeHtml(outlier.tracking_id)} · ${escapeHtml(outlier.fields.join(", "))}</span><strong class="quality-warn">ตรวจทานค่า</strong></div>`).join("");
    const reasons = countBy(rows.filter((row) => row.status === "ตีกลับ" || row.status === "จัดส่งไม่สำเร็จ"), "failure_reason")
      .filter((entry) => entry.label !== "ไม่ระบุ").sort((a, b) => b.count - a.count);
    const leadReason = reasons[0];
    const unresolved = rows.filter((row) => row.status === "กำลังจัดส่ง").length;
    const failed = rows.filter((row) => row.status === "ตีกลับ" || row.status === "จัดส่งไม่สำเร็จ").length;
    return `<div class="content-grid grid-equal">
      <section class="panel"><div class="panel-heading"><div><h2 class="panel-title">ผลการเตรียมข้อมูล</h2><p class="panel-subtitle">ขั้นตอนทำความสะอาดไฟล์ต้นทาง</p></div><a class="download-link" href="data/shipments_clean.csv" download>ดาวน์โหลดข้อมูลสะอาด ↓</a></div>
        <div class="mini-stats"><div class="mini-stat"><span>แถวก่อนทำความสะอาด</span><strong>${formatNumber(quality.source_rows)}</strong></div><div class="mini-stat"><span>แถวที่นำมาวิเคราะห์</span><strong>${formatNumber(quality.clean_rows)}</strong></div><div class="mini-stat"><span>แถวซ้ำทุกคอลัมน์ที่ตัดออก</span><strong>${formatNumber(quality.exact_duplicates_removed)}</strong></div></div>
        <div class="quality-list">
          <div class="quality-row"><span>tracking ID ซ้ำแต่รายละเอียดต่างกัน</span><strong class="${quality.tracking_id_collision_groups ? "quality-warn" : "quality-good"}">${formatNumber(quality.tracking_id_collision_groups)} กลุ่ม · คงรายการไว้</strong></div>
          <div class="quality-row"><span>วันที่อ่านไม่สำเร็จ</span><strong class="${quality.invalid_dates ? "quality-warn" : "quality-good"}">${formatNumber(quality.invalid_dates)} ค่า · เก็บเป็นค่าว่าง</strong></div>
          <div class="quality-row"><span>ค่าว่างหลังทำความสะอาด</span><strong class="${totalMissing ? "quality-warn" : "quality-good"}">${formatNumber(totalMissing)} ช่อง</strong></div>
          <div class="quality-row"><span>แถวที่ตั้งธง outlier</span><strong class="${outlierRows.length ? "quality-warn" : "quality-good"}">${formatNumber(outlierRows.length)} แถว · ไม่ได้ลบ</strong></div>
        </div>
      </section>
      <section class="panel"><div class="panel-heading"><div><h2 class="panel-title">ค่าที่ควรตรวจสอบ</h2><p class="panel-subtitle">ตั้งธงเพื่อทบทวน ไม่สรุปว่าเป็นค่าผิดโดยอัตโนมัติ</p></div></div>
        ${outlierRows.length ? `<div class="quality-list">${outlierExamples}</div>` : `<div class="empty-state">ไม่มีค่าเกินเกณฑ์ตรวจทาน</div>`}
        <p class="chart-caption">กติกาตรวจ: น้ำหนัก &gt; 100 กก. · ระยะทาง &gt; 5,000 กม. · ค่าจัดส่ง &gt; 10,000 บาท · มูลค่าสินค้า &gt; 100,000 บาท</p>
      </section>
    </div>
    <div class="content-grid grid-equal">
      <section class="panel"><div class="panel-heading"><div><h2 class="panel-title">ข้อค้นพบจากชุดที่กรอง</h2><p class="panel-subtitle">ใช้สถานะและเหตุผลตามข้อมูลที่ระบุไว้</p></div></div>
        <div class="quality-list">
          <div class="quality-row"><span>พัสดุที่ยังอยู่ระหว่างจัดส่ง</span><strong>${formatNumber(unresolved)} รายการ</strong></div>
          <div class="quality-row"><span>พัสดุตีกลับหรือจัดส่งไม่สำเร็จ</span><strong>${formatNumber(failed)} รายการ</strong></div>
          <div class="quality-row"><span>เหตุผลที่พบบ่อยสุดในรายการปัญหา</span><strong>${leadReason ? `${escapeHtml(leadReason.label)} (${formatNumber(leadReason.count)})` : "ไม่มีเหตุผลที่ระบุ"}</strong></div>
          <div class="quality-row"><span>กลุ่มตัวอย่างที่กำลังวิเคราะห์</span><strong>${formatNumber(rows.length)} รายการ</strong></div>
        </div>
      </section>
      <section class="panel"><div class="panel-heading"><div><h2 class="panel-title">ข้อเสนอแนะและข้อจำกัด</h2><p class="panel-subtitle">แนวทางเริ่มต้นสำหรับการตรวจสอบต่อ</p></div></div>
        <article class="recommendation-card"><span class="recommendation-number">01</span><div><h3>ติดตามพัสดุที่ยังไม่ปิดงาน</h3><p>ตรวจ ${formatNumber(unresolved)} รายการที่ยังอยู่ระหว่างจัดส่ง และเพิ่มข้อมูลวันที่ส่งสำเร็จเมื่อปิดงาน</p></div></article>
        <article class="recommendation-card"><span class="recommendation-number">02</span><div><h3>ทบทวนรายการส่งไม่สำเร็จ</h3><p>${leadReason ? `เริ่มจากเหตุผล “${escapeHtml(leadReason.label)}” ที่พบ ${formatNumber(leadReason.count)} รายการ แล้วตรวจแนวทางแก้ที่ต้นทาง` : "บันทึกเหตุผลที่จัดส่งไม่สำเร็จให้ครบ เพื่อหาสาเหตุที่แก้ได้"}</p></div></article>
        <article class="recommendation-card"><span class="recommendation-number">!</span><div><h3>ข้อจำกัด</h3><p>ข้อมูลผิดรูปแบบและ outlier ยังไม่มีหลักฐานยืนยันจากระบบต้นทาง จึงคงค่าอ่านได้ไว้และแสดงคำเตือน ไม่ใช้ค่าเหล่านี้สรุปคุณภาพผู้ให้บริการโดยลำพัง</p></div></article>
      </section>
    </div>
    <div class="insight-strip"><span class="insight-bullet">✓</span><div><strong>ทำซ้ำได้:</strong> ใช้ <code>python scripts/clean_data.py</code> เพื่อสร้าง CSV สะอาดและข้อมูลหน้าเว็บใหม่ วิธีจัดการและความหมายของทุกคอลัมน์อยู่ใน <a class="download-link" href="DATA_DICTIONARY.md">Data dictionary</a></div></div>`;
  }

  function handleContentClick(event) {
    const clearButton = event.target.closest('[data-action="clear"]');
    if (clearButton) {
      clearFilters();
      return;
    }
    const exportButton = event.target.closest('[data-action="export"]');
    if (exportButton) {
      exportCsv(getFilteredRows());
      return;
    }
    const sortButton = event.target.closest("[data-sort]");
    if (sortButton) {
      const field = sortButton.dataset.sort;
      if (state.sortBy === field) state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
      else {
        state.sortBy = field;
        state.sortDirection = field === "received_date" ? "desc" : "asc";
      }
      refreshContent();
      return;
    }
    const pageButton = event.target.closest("[data-page-index]");
    if (pageButton && !pageButton.disabled) {
      state.currentPage = Number(pageButton.dataset.pageIndex);
      refreshContent();
    }
  }

  function exportCsv(rows) {
    const columns = [
      ["รหัสพัสดุ", "tracking_id"], ["วันที่รับพัสดุ", "received_date"],
      ["วันที่จัดส่งสำเร็จ", "delivered_date"], ["บริษัทขนส่ง", "carrier"],
      ["จังหวัดปลายทาง", "province"], ["ภูมิภาค", "region"],
      ["ประเภทสินค้า", "product_type"], ["น้ำหนัก_กก", "weight_kg"],
      ["ระยะทาง_กม", "distance_km"], ["ค่าจัดส่ง_บาท", "shipping_fee_thb"],
      ["ค่าบริการเก็บเงินปลายทาง_บาท", "cod_fee_thb"], ["มูลค่าสินค้า_บาท", "product_value_thb"],
      ["วิธีชำระเงิน", "payment_method"], ["สถานะพัสดุ", "status"],
      ["ระยะเวลาจัดส่ง_วัน", "delivery_days"], ["คะแนนความพึงพอใจ", "satisfaction_score"],
      ["จำนวนครั้งที่จัดส่ง", "delivery_attempts"], ["ช่องทางสั่งซื้อ", "order_channel"],
      ["เหตุผลที่จัดส่งไม่สำเร็จ", "failure_reason"], ["รหัสซ้ำ", "id_collision"],
    ];
    const csvCell = (value) => {
      let text = value === null || value === undefined ? "" : String(value);
      if (/^[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const content = [columns.map(([label]) => csvCell(label)).join(",")]
      .concat(rows.map((row) => columns.map(([, field]) => csvCell(row[field])).join(",")))
      .join("\r\n");
    const blob = new Blob(["\ufeff", content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `shipments_filtered_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce(`ส่งออก ${formatNumber(rows.length)} รายการแล้ว`);
  }

  function announce(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2400);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
