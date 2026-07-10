// ============================================================
// โหลดข้อมูลจาก data/news.json (path สัมพัทธ์ อยู่ repo เดียวกัน ไม่มีปัญหา CORS)
// ============================================================
var state = {
  allNews: [],       // ข่าวดิบทั้งหมด
  filteredNews: [],  // หลังกรอง (ยังไม่จัดกลุ่ม)
  topics: []         // หลังจัดกลุ่มตามรหัสกลุ่มข่าว
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

    populateCategoryFilter();
    applyFiltersAndRender();
  } catch (err) {
    document.getElementById('resultsGrid').innerHTML = '<div class="empty">โหลดข้อมูลไม่สำเร็จ: ' + err.message + '</div>';
    console.error(err);
  }
}

function populateCategoryFilter() {
  var categories = Array.from(new Set(state.allNews.map(function (n) { return n.category || 'อื่นๆ'; })));
  categories.sort();
  var sel = document.getElementById('categoryFilter');
  categories.forEach(function (c) {
    var opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });
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

// ============================================================
// กรองและเรนเดอร์
// ============================================================
function applyFiltersAndRender() {
  var q = document.getElementById('searchInput').value.trim().toLowerCase();
  var cat = document.getElementById('categoryFilter').value;
  var dateFrom = document.getElementById('dateFrom').value;
  var dateTo = document.getElementById('dateTo').value;
  var onlyNeg = document.getElementById('onlyNegative').checked;
  var onlyCam = document.getElementById('onlyCambodia').checked;
  var sortOrder = document.getElementById('sortOrder').value;

  var filtered = state.allNews.filter(function (n) {
    if (cat && n.category !== cat) return false;
    if (onlyNeg && !n.isNegative) return false;
    if (onlyCam && !n.isThailandCambodia) return false;

    if (dateFrom && n.datetime < dateFrom) return false;
    if (dateTo && n.datetime > (dateTo + 'T23:59:59')) return false;

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
  var negCount = topics.filter(function (t) { return t.isNegative; }).length;
  var sourceSet = new Set(filtered.map(function (n) { return n.source; }));

  document.getElementById('statGrid').innerHTML =
    '<div class="stat-card"><p class="label">ประเด็นทั้งหมด</p><p class="value">' + topics.length + '</p></div>' +
    '<div class="stat-card"><p class="label">นำเสนอข่าว (ครั้ง)</p><p class="value accent">' + filtered.length + '</p></div>' +
    '<div class="stat-card"><p class="label">ข่าวลบ</p><p class="value danger">' + negCount + '</p></div>' +
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
    var badges = '<span class="badge category">' + escapeHtml(t.category) + '</span>';
    if (t.isThailandCambodia) badges += '<span class="badge cambodia">ไทย-กัมพูชา</span>';
    if (t.isNegative && t.impact && t.impact !== '-') {
      badges += '<span class="badge impact-' + t.impact + '">ระดับ ' + t.impact + '</span>';
    }

    var sourcesHtml = t.sources.slice(0, 5).map(function (s) {
      return '<a href="' + s.url + '" target="_blank" rel="noopener">🔗 ' + escapeHtml(s.source) + '</a>';
    }).join('');
    if (t.sources.length > 5) {
      sourcesHtml += '<span style="font-size:12px;color:#7A7887">และอีก ' + (t.sources.length - 5) + ' แหล่ง</span>';
    }

    return '<div class="news-card">' + badges +
      '<p class="title">' + escapeHtml(t.title) + '</p>' +
      '<p class="summary">' + escapeHtml(t.summary) + '</p>' +
      '<p class="meta">' + formatThaiDate(new Date(t.earliestDate)) + ' · นำเสนอ ' + t.count + ' ครั้ง</p>' +
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

  var csvContent = '\uFEFF' + lines.join('\r\n'); // ใส่ BOM กัน Excel อ่านภาษาไทยเพี้ยน
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
// ผูก event listener
// ============================================================
['searchInput', 'categoryFilter', 'dateFrom', 'dateTo', 'onlyNegative', 'onlyCambodia', 'sortOrder']
  .forEach(function (id) {
    var el = document.getElementById(id);
    el.addEventListener('input', applyFiltersAndRender);
    el.addEventListener('change', applyFiltersAndRender);
  });

document.getElementById('exportBtn').addEventListener('click', exportCsv);

loadData();
