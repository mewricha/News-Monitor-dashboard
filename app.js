// ============================================================
// โหลดข้อมูลจาก data/news.json (path สัมพัทธ์ อยู่ repo เดียวกัน ไม่มีปัญหา CORS)
// ============================================================
var state = {
  allNews: [],
  filteredNews: [],
  topics: [],
  selectedCategories: new Set(), // ว่าง = ไม่กรอง (เอาทุกหมวด)
  selectedSources: new Set()     // ว่าง = ไม่กรอง (เอาทุกสำนักข่าว)
};

var THAI_MONTHS_ABBR = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function formatThaiDate(d) {
  return d.getDate() + ' ' + THAI_MONTHS_ABBR[d.getMonth()] + ' ' + (d.getFullYear() + 543);
}

async function loadData() {
  try {
    var res = await fetch('data/news.json', { cache: 'no-store' });
    var data = await res.json();
    state.allNews = data.news || [];

    var updatedEl = document.getElementById('lastUpdated');
    if (data.generatedAt) {
      updatedEl.textContent = 'อัปเดตล่าสุด: ' + formatThaiDate(new Date(data.generatedAt)) + ' ' +
        new Date(data.generatedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
    } else {
      updatedEl.textContent = 'ยังไม่มีข้อมูล (รอรอบอัปเดตแรกจาก GitHub Actions)';
    }

    setupMultiselect('category', 'categoryMultiselect', 'categoryToggle', 'categoryPanel', 'ทุกหมวด');
    setupMultiselect('source', 'sourceMultiselect', 'sourceToggle', 'sourcePanel', 'ทุกสำนักข่าว');
    applyFiltersAndRender();
  } catch (err) {
    document.getElementById('resultsGrid').innerHTML = '<div class="empty">โหลดข้อมูลไม่สำเร็จ: ' + err.message + '</div>';
    console.error(err);
  }
}

// ============================================================
// ตัวกรองแบบเลื่อนลงติ๊กหลายชนิด (multiselect dropdown)
// ============================================================
function setupMultiselect(kind, containerId, toggleId, panelId, allLabel) {
  var field = kind === 'category' ? 'category' : 'source';
  var selectedSet = kind === 'category' ? state.selectedCategories : state.selectedSources;

  var values = Array.from(new Set(state.allNews.map(function (n) { return n[field] || '-'; }))).sort();

  var panel = document.getElementById(panelId);
  var clearRow = document.createElement('div');
  clearRow.className = 'ms-clear';
  clearRow.textContent = 'ล้างตัวเลือกทั้งหมด';
  clearRow.addEventListener('click', function () {
    selectedSet.clear();
    updateMultiselectUI(kind, containerId, toggleId, panelId, allLabel);
    applyFiltersAndRender();
  });
  panel.innerHTML = '';
  panel.appendChild(clearRow);

  values.forEach(function (v) {
    var label = document.createElement('label');
    var checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = v;
    checkbox.addEventListener('change', function () {
      if (checkbox.checked) selectedSet.add(v); else selectedSet.delete(v);
      updateMultiselectUI(kind, containerId, toggleId, panelId, allLabel);
      applyFiltersAndRender();
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(v));
    panel.appendChild(label);
  });

  var toggleBtn = document.getElementById(toggleId);
  toggleBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    var isOpen = !panel.hidden;
    document.querySelectorAll('.multiselect-panel').forEach(function (p) { p.hidden = true; });
    panel.hidden = isOpen;
  });

  document.addEventListener('click', function (e) {
    var container = document.getElementById(containerId);
    if (!container.contains(e.target)) panel.hidden = true;
  });

  updateMultiselectUI(kind, containerId, toggleId, panelId, allLabel);
}

function updateMultiselectUI(kind, containerId, toggleId, panelId, allLabel) {
  var selectedSet = kind === 'category' ? state.selectedCategories : state.selectedSources;
  var toggleBtn = document.getElementById(toggleId);
  if (selectedSet.size === 0) {
    toggleBtn.textContent = allLabel + ' ▾';
  } else {
    toggleBtn.textContent = 'เลือกแล้ว ' + selectedSet.size + ' รายการ ▾';
  }
}

// ============================================================
// จัดกลุ่มข่าวตามรหัสกลุ่มข่าว (eventGroup) -> ได้ "ประเด็น"
// ============================================================
function groupIntoTopics(newsList) {
  var map = {};
  newsList.forEach(function (n) {
    var code = n.eventGroup || ('SINGLE-' + n.title + n.datetime);
    if (!map[code]) {
      map[code] = {
        code: code, category: n.category, isNegative: false, impact: '-',
        isThailandCambodia: false, title: n.title, summary: n.summary,
        earliestDate: n.datetime, count: 0, sources: []
      };
    }
    var t = map[code];
    t.count++;
    t.sources.push({ source: n.source, url: n.url, datetime: n.datetime });
    if (n.isNegative) { t.isNegative = true; t.impact = n.impact; }
    if (n.isThailandCambodia) t.isThailandCambodia = true;
    if (new Date(n.datetime) < new Date(t.earliestDate)) {
      t.earliestDate = n.datetime;
      t.title = n.title;
    }
    if ((n.summary || '').length > (t.summary || '').length) t.summary = n.summary;
  });
  return Object.keys(map).map(function (k) { return map[k]; });
}

function uniqueSourceCount(topic) {
  return new Set(topic.sources.map(function (s) { return s.source; })).size;
}

// ============================================================
// กรองและเรนเดอร์
// ============================================================
function applyFiltersAndRender() {
  var q = document.getElementById('searchInput').value.trim().toLowerCase();
  var dateFrom = document.getElementById('dateFrom').value;
  var dateTo = document.getElementById('dateTo').value;
  var onlyToday = document.getElementById('onlyToday').checked;
  var onlyLast3Days = document.getElementById('onlyLast3Days').checked;
  var sortOrder = document.getElementById('sortOrder').value;

  var todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  var last3DaysStart = new Date(todayStart.getTime() - 2 * 86400000); // รวมวันนี้ + 2 วันก่อนหน้า = 3 วัน

  var filtered = state.allNews.filter(function (n) {
    if (state.selectedCategories.size > 0 && !state.selectedCategories.has(n.category)) return false;
    if (state.selectedSources.size > 0 && !state.selectedSources.has(n.source)) return false;

    if (dateFrom && n.datetime < dateFrom) return false;
    if (dateTo && n.datetime > (dateTo + 'T23:59:59')) return false;

    if (onlyToday && new Date(n.datetime) < todayStart) return false;
    if (onlyLast3Days && new Date(n.datetime) < last3DaysStart) return false;

    if (q) {
      var hay = (n.title + ' ' + n.summary + ' ' + n.source).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });

  state.filteredNews = filtered;

  var topics = groupIntoTopics(filtered);
  if (sortOrder === 'count') {
    topics.sort(function (a, b) { return b.count - a.count; });
  } else if (sortOrder === 'asc') {
    topics.sort(function (a, b) { return new Date(a.earliestDate) - new Date(b.earliestDate); });
  } else {
    topics.sort(function (a, b) { return new Date(b.earliestDate) - new Date(a.earliestDate); });
  }
  state.topics = topics;

  renderStats(filtered, topics);
  renderResults(topics);
}

function renderStats(filtered, topics) {
  var sourceSet = new Set(filtered.map(function (n) { return n.source; }));

  document.getElementById('statGrid').innerHTML =
    '<div class="stat-card"><p class="label">ประเด็นทั้งหมด</p><p class="value">' + topics.length + '</p></div>' +
    '<div class="stat-card"><p class="label">นำเสนอข่าว (ครั้ง)</p><p class="value accent">' + filtered.length + '</p></div>' +
    '<div class="stat-card"><p class="label">สำนักข่าว</p><p class="value">' + sourceSet.size + '</p></div>';

  document.getElementById('resultCount').textContent = 'พบ ' + topics.length + ' ประเด็น (' + filtered.length + ' ข่าว)';
}

function renderResults(topics) {
  var grid = document.getElementById('resultsGrid');
  if (topics.length === 0) {
    grid.innerHTML = '<div class="empty">ไม่พบข่าวที่ตรงเงื่อนไข</div>';
    return;
  }

  grid.innerHTML = topics.map(function (t) {
    var categoryBadgeClass = 'category';
    if (t.category === 'ข่าวผลกระทบลบ') categoryBadgeClass = 'cat-negative';
    else if (t.category === 'ชายแดนไทย-กัมพูชา') categoryBadgeClass = 'cat-cambodia';
    else if (t.category === 'ความมั่นคงชายแดนอื่น') categoryBadgeClass = 'cat-border-other';
    else if (t.category === 'สถานการณ์ จชต.') categoryBadgeClass = 'cat-jcht';

    var badges = '<span class="badge ' + categoryBadgeClass + '">' + escapeHtml(t.category) + '</span>';

    var attentionClass = '';
    if (t.count >= 20) attentionClass = ' attention-high';
    else if (t.count >= 10) attentionClass = ' attention-mid';

    var sourcesHtml = t.sources.slice(0, 5).map(function (s) {
      return '<a href="' + s.url + '" target="_blank" rel="noopener">🔗 ' + escapeHtml(s.source) + '</a>';
    }).join('');
    if (t.sources.length > 5) {
      sourcesHtml += '<span style="font-size:12px;color:var(--text-secondary)">และอีก ' + (t.sources.length - 5) + ' แหล่ง</span>';
    }

    var srcCount = uniqueSourceCount(t);
    var metaText = formatThaiDate(new Date(t.earliestDate)) + ' · นำเสนอ ' + t.count + ' ครั้ง · ' + srcCount + ' สำนักข่าว';

    return '<div class="news-card' + attentionClass + '">' + badges +
      '<p class="title">' + escapeHtml(t.title) + '</p>' +
      '<p class="summary">' + escapeHtml(t.summary) + '</p>' +
      '<p class="meta">' + metaText + '</p>' +
      '<div class="sources">' + sourcesHtml + '</div>' +
      '</div>';
  }).join('');
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ============================================================
// ส่งออก CSV (ข่าวดิบที่ผ่านตัวกรองปัจจุบัน)
// ============================================================
function exportCsv() {
  var rows = state.filteredNews;
  if (rows.length === 0) {
    alert('ไม่มีข้อมูลให้ส่งออกตามเงื่อนไขที่เลือกอยู่');
    return;
  }

  var headers = ['วันที่เวลา', 'หัวข้อ', 'แหล่งที่มา', 'หมวด', 'ข่าวลบ', 'ระดับผลกระทบ', 'ไทย-กัมพูชา', 'ลิงก์'];
  var lines = [headers.join(',')];

  rows.forEach(function (n) {
    var cells = [
      n.datetime, n.title, n.source, n.category,
      n.isNegative ? 'ลบ' : 'ไม่ลบ', n.impact || '-',
      n.isThailandCambodia ? 'ใช่' : 'ไม่ใช่', n.url
    ].map(csvEscape);
    lines.push(cells.join(','));
  });

  var csvContent = '\uFEFF' + lines.join('\r\n');
  var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'army-news-export-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  var s = (value === null || value === undefined) ? '' : String(value);
  if (/[",\r\n]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ============================================================
// ล้างตัวกรองทั้งหมด
// ============================================================
function clearAllFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('dateFrom').value = '';
  document.getElementById('dateTo').value = '';
  document.getElementById('onlyToday').checked = false;
  document.getElementById('onlyLast3Days').checked = false;

  state.selectedCategories.clear();
  state.selectedSources.clear();
  document.querySelectorAll('#categoryPanel input[type=checkbox]').forEach(function (cb) { cb.checked = false; });
  document.querySelectorAll('#sourcePanel input[type=checkbox]').forEach(function (cb) { cb.checked = false; });
  updateMultiselectUI('category', 'categoryMultiselect', 'categoryToggle', 'categoryPanel', 'ทุกหมวด');
  updateMultiselectUI('source', 'sourceMultiselect', 'sourceToggle', 'sourcePanel', 'ทุกสำนักข่าว');

  applyFiltersAndRender();
}

// ============================================================
// ผูก event listener
// ============================================================
['searchInput', 'dateFrom', 'dateTo', 'onlyToday', 'onlyLast3Days', 'sortOrder']
  .forEach(function (id) {
    var el = document.getElementById(id);
    el.addEventListener('input', applyFiltersAndRender);
    el.addEventListener('change', applyFiltersAndRender);
  });

document.getElementById('exportBtn').addEventListener('click', exportCsv);
document.getElementById('clearFiltersBtn').addEventListener('click', clearAllFilters);

loadData();
