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

// ============================================================
// ตารางแปลง "โดเมน → ชื่อสำนักข่าว" สำหรับการแสดงผล
// (มีตารางเดียวกันในโค้ด Apps Script สำหรับรายงาน LINE — แก้ไขให้ตรงกันทั้งสองไฟล์)
// ============================================================
var SOURCE_NAME_URL_RULES = [
  ['topnews.co.th/news-clip', 'TOP News (video)']
];
var SOURCE_NAMES = {
  'topnews.co.th': 'TOP News',
  'naewna.com': 'แนวหน้า',
  'siamrath.co.th': 'สยามรัฐ',
  'mgronline.com': 'ผู้จัดการออนไลน์',
  'matichon.co.th': 'มติชน',
  'dailynews.co.th': 'เดลินิวส์',
  'khaosod.co.th': 'ข่าวสด',
  'thainews.prd.go.th': 'NBT Connext',
  'thaipost.net': 'ไทยโพสต์',
  'thairath.co.th': 'ไทยรัฐ',
  'bangkokbiznews.com': 'กรุงเทพธุรกิจ',
  'banmuang.co.th': 'บ้านเมือง',
  'chiangmainews.co.th': 'เชียงใหม่นิวส์',
  'thaipbs.or.th': 'Thai PBS',
  'nationtv.tv': 'เนชั่นทีวี',
  'pptvhd36.com': 'PPTV HD36',
  'news1live.com': 'NEWS1',
  'siamnews.com': 'สยามนิวส์',
  'antifakenewscenter.com': 'ศูนย์ต่อต้านข่าวปลอม',
  'fm91bkk.com': 'FM91',
  'thestandard.co': 'THE STANDARD',
  'innnews.co.th': 'INN News',
  'ch3plus.com': 'ช่อง 3',
  'komchadluek.net': 'คมชัดลึก',
  'prd.go.th': 'กรมประชาสัมพันธ์',
  'js100.com': 'จส.100',
  'sondhitalk.com': 'Sondhi Talk',
  'spacebar.th': 'SPACEBAR',
  'tnnthailand.com': 'TNN',
  'thaich8.com': 'ช่อง 8',
  'bangkok-today.com': 'Bangkok Today',
  'region3.prd.go.th': 'ปชส.เขต 3',
  'thansettakij.com': 'ฐานเศรษฐกิจ',
  'one31.net': 'ช่องวัน 31',
  'thailandplus.tv': 'Thailand Plus',
  'infoquest.co.th': 'อินโฟเควสท์',
  'voicetv.co.th': 'Voice TV',
  'posttoday.com': 'โพสต์ทูเดย์',
  'ejan.co': 'อีจัน',
  'surin.prd.go.th': 'ปชส.สุรินทร์',
  'bhumjaithai.com': 'พรรคภูมิใจไทย',
  'hatyaifocus.com': 'หาดใหญ่โฟกัส',
  'moneyandbanking.co.th': 'การเงินธนาคาร',
  'thaigov.go.th': 'รัฐบาลไทย',
  'royaloffice.th': 'หน่วยราชการในพระองค์',
  'ops.moe.go.th': 'ศธ.',
  'pr.moph.go.th': 'กระทรวงสาธารณสุข',
  'theactive.thaipbs.or.th': 'The Active',
  'transbordernews.in.th': 'สำนักข่าวชายขอบ',
  'twonewsonline.com': 'ทูนิวส์ออนไลน์'
};

// แปลงโดเมนเป็นชื่อสำนักข่าว: กฎ URL ก่อน → ตารางโดเมน → ไม่เจอคืนค่าเดิม
function displaySourceName(source, url) {
  var u = (url || '').toString().toLowerCase();
  for (var i = 0; i < SOURCE_NAME_URL_RULES.length; i++) {
    if (u && u.indexOf(SOURCE_NAME_URL_RULES[i][0]) !== -1) return SOURCE_NAME_URL_RULES[i][1];
  }
  var s = (source || '').toString().trim();
  return SOURCE_NAMES[s.toLowerCase()] || s;
}

// สีประจำหมวด (ใช้กับโดนัทชาร์ต) — ให้สอดคล้องกับสี badge หมวดข่าวที่ใช้อยู่แล้วในรายการข่าว
// ============================================================
// หมวดประเด็น — ต้องตรงกับ CATEGORY_ORDER ในโค้ด Apps Script
// ⚠️ มี 2 สำเนา (ไฟล์นี้ + Apps Script) เวลาเพิ่ม/เปลี่ยนชื่อหมวดต้องแก้ทั้งคู่
// ============================================================
var CATEGORY_ORDER = [
  'ปราบปรามยาเสพติด',
  'ช่วยเหลือประชาชน/จิตอาสา',
  'ชายแดนไทย-กัมพูชา',
  'สถานการณ์ จชต.',
  'ความมั่นคงชายแดนอื่น',
  'พิธีการ/กิจกรรม',
  'การฝึก/ความพร้อมรบ',
  'กำลังพล/ทหารใหม่',
  'ความสัมพันธ์ทหารระหว่างประเทศ',
  'อื่นๆ'
];

// ⚠️ ชื่อหมวดเก่า → ชื่อปัจจุบัน (ตรงกับ CATEGORY_ALIASES ในโค้ด Apps Script)
//    ถ้าไม่มีตารางนี้ แถวที่ยังใช้ชื่อเดิมจะโผล่เป็น "หมวดที่ 11" ในตัวกรอง
//    ได้สีเทา default ในกราฟ และถูกนับแยกจากหมวดจริง
//    (ตรวจ 2 ส.ค. 69: ยังมี 'พิธีการ/ประเพณีทหาร' ค้างอยู่ 45 แถว)
var CATEGORY_ALIASES = {
  'พิธีการ/ประเพณีทหาร': 'พิธีการ/กิจกรรม'
};

function normalizeCategory(cat) {
  var c = (cat || '').toString().trim();
  if (!c) return 'อื่นๆ';
  return CATEGORY_ALIASES[c] || c;
}

var CATEGORY_COLORS = {
  'ชายแดนไทย-กัมพูชา': '#4CAF6D',
  'ความมั่นคงชายแดนอื่น': '#D4B94E',
  'พิธีการ/กิจกรรม': '#C9A227',
  'สถานการณ์ จชต.': '#E27FB0',
  'กำลังพล/ทหารใหม่': '#6BA6FF',
  'ปราบปรามยาเสพติด': '#A784E8',
  'ช่วยเหลือประชาชน/จิตอาสา': '#4FC3C3',
  'การฝึก/ความพร้อมรบ': '#E8A15C',
  'ความสัมพันธ์ทหารระหว่างประเทศ': '#9AA5B1',
  'อื่นๆ': '#C9B48A'
};
var DEFAULT_CHART_COLOR = '#8FBFFF';

function categoryColor(cat) {
  return CATEGORY_COLORS[normalizeCategory(cat)] || DEFAULT_CHART_COLOR;
}

// ระดับผลกระทบ — ใช้เลือก "ระดับสูงสุดในกลุ่ม" ให้ตรงกับที่ฝั่ง Apps Script ทำ
var IMPACT_RANK = { 'สูง': 3, 'กลาง': 2, 'ต่ำ': 1 };

function formatThaiDate(d) {
  return d.getDate() + ' ' + THAI_MONTHS_ABBR[d.getMonth()] + ' ' + (d.getFullYear() + 543);
}

async function loadData() {
  try {
    var res = await fetch('data/news.json', { cache: 'no-store' });
    var data = await res.json();
    state.allNews = data.news || [];

    // ทำข้อมูลให้เป็นมาตรฐานตั้งแต่โหลด — การ์ด/ตัวกรอง/กราฟ/CSV ได้ค่าเดียวกันทุกจุด
    // ⚠️ ต้องทำที่นี่จุดเดียว ห้ามไปแปลงซ้ำที่ปลายทาง ไม่งั้นจะหลุดบางจุดเหมือนที่เคยพลาด
    state.allNews.forEach(function (n) {
      n.source = displaySourceName(n.source, n.url);
      n.category = normalizeCategory(n.category);
    });

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

  var values = Array.from(new Set(state.allNews.map(function (n) { return n[field] || '-'; })));
  if (kind === 'category') {
    // เรียงตามลำดับความสำคัญที่ระบบกำหนด ไม่ใช่ตามตัวอักษร
    // หมวดแปลกที่ไม่อยู่ในรายการ (ถ้ามี) ไปต่อท้าย — จะได้เห็นว่ามีของหลุดเข้ามา
    values.sort(function (a, b) {
      var ia = CATEGORY_ORDER.indexOf(a), ib = CATEGORY_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b, 'th');
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  } else {
    values.sort();
  }

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
        title: n.title, summary: n.summary,
        earliestDate: n.datetime, count: 0, negCount: 0, sources: []
      };
    }
    var t = map[code];
    t.count++;
    t.sources.push({ source: n.source, url: n.url, datetime: n.datetime });
    // ⚠️ แก้ 2 ส.ค. 69: เดิมเขียนทับ t.impact ทุกรอบ → ได้ค่าของข่าวชิ้นสุดท้าย ไม่ใช่ระดับสูงสุด
    //    วัดแล้วมี 8 กลุ่มที่ระดับปนกัน (เช่น 'ประธานสภาฯ เสนอยุบ กอ.รมน.' มีทั้ง สูง และ กลาง)
    //    ทำให้ตัวเลขบนเว็บกับในรายงาน LINE ไม่ตรงกัน เพราะฝั่งนั้นเอาค่าสูงสุด
    if (n.isNegative) {
      t.isNegative = true;
      t.negCount++;
      if ((IMPACT_RANK[n.impact] || 0) > (IMPACT_RANK[t.impact] || 0)) t.impact = n.impact;
    }
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
  var onlyNegative = document.getElementById('onlyNegative').checked;
  var sortOrder = document.getElementById('sortOrder').value;

  var todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  var last3DaysStart = new Date(todayStart.getTime() - 2 * 86400000); // รวมวันนี้ + 2 วันก่อนหน้า = 3 วัน

  var filtered = state.allNews.filter(function (n) {
    if (state.selectedCategories.size > 0 && !state.selectedCategories.has(n.category)) return false;
    if (state.selectedSources.size > 0 && !state.selectedSources.has(n.source)) return false;

    // ⭐ ตัวกรองธงข่าวลบ — กรองที่ระดับ "ข่าว" ไม่ใช่ระดับ "ประเด็น"
    //    ผลคือประเด็นที่มีทั้งข่าวลบและไม่ลบ จะเหลือเฉพาะข่าวลบในการ์ด ซึ่งตรงกับที่ผู้ใช้ถาม
    if (onlyNegative && !n.isNegative) return false;

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
  // ⭐ เพิ่ม 2 ส.ค. 69 — ข่าวลบเป็นตัวชี้วัดหลักของทีมโฆษกแล้ว แต่แท็บนี้ไม่เคยแสดง
  //    (แท็บกราฟมีมาตั้งแต่แรก แท็บรายการเพิ่งมี)
  var negTopics = topics.filter(function (t) { return t.isNegative; }).length;
  var negPct = topics.length ? Math.round(100 * negTopics / topics.length) : 0;

  document.getElementById('statGrid').innerHTML =
    '<div class="stat-card"><p class="label">ประเด็นทั้งหมด</p><p class="value">' + topics.length + '</p></div>' +
    '<div class="stat-card"><p class="label">นำเสนอข่าว (ครั้ง)</p><p class="value accent">' + filtered.length + '</p></div>' +
    '<div class="stat-card"><p class="label">ประเด็นข่าวลบ</p><p class="value" style="color:#E05C5C">' + negTopics +
      '<span class="value-sub">' + negPct + '%</span></p></div>' +
    '<div class="stat-card"><p class="label">สำนักข่าว</p><p class="value">' + sourceSet.size + '</p></div>';

  document.getElementById('resultCount').textContent =
    'พบ ' + topics.length + ' ประเด็น (' + filtered.length + ' ข่าว) · ในนั้นเป็นข่าวลบ ' + negTopics + ' ประเด็น';
}

function renderResults(topics) {
  var grid = document.getElementById('resultsGrid');
  if (topics.length === 0) {
    grid.innerHTML = '<div class="empty">ไม่พบข่าวที่ตรงเงื่อนไข</div>';
    return;
  }

  grid.innerHTML = topics.map(function (t) {
    // ⚠️ แก้ 2 ส.ค. 69 (เย็น): เดิมถ้าเป็นข่าวลบ จะยึดสีป้ายหมวดไปเป็นสีแดง
    //    ผลคือข่าวลบเรื่อง จชต. กับข่าวลบเรื่องกัมพูชา หน้าตาเหมือนกันเป๊ะ — เสียข้อมูลหมวดไป
    //    ตอนนี้แยกกัน: ป้ายหมวดคงสีหมวดเสมอ · ความ "ลบ" บอกด้วยกรอบการ์ดแดง + แท็กล่างการ์ด
    var categoryBadgeClass = 'category';
    if (t.category === 'ชายแดนไทย-กัมพูชา') categoryBadgeClass = 'cat-cambodia';
    else if (t.category === 'ความมั่นคงชายแดนอื่น') categoryBadgeClass = 'cat-border-other';
    else if (t.category === 'สถานการณ์ จชต.') categoryBadgeClass = 'cat-jcht';

    var badges = '<span class="badge ' + categoryBadgeClass + '">' + escapeHtml(t.category) + '</span>';

    // ป้าย "ประเด็นร้อน" 3 ระดับ อิงจำนวนลิงก์ที่นำเสนอในประเด็น (t.count นับทุกลิงก์ ซ้ำสำนักได้)
    var attentionClass = '', hotBadge = '';
    if (t.count >= 10) { attentionClass = ' attention-3'; hotBadge = '🔥🔥🔥'; }
    else if (t.count >= 5) { attentionClass = ' attention-2'; hotBadge = '🔥🔥'; }
    else if (t.count >= 3) { attentionClass = ' attention-1'; hotBadge = '🔥'; }
    var hotBadgeHtml = hotBadge
      ? '<span class="hot-badge' + attentionClass + '" title="นำเสนอ ' + t.count + ' ครั้ง">' + hotBadge + '</span>'
      : '';

    var sourcesHtml = t.sources.slice(0, 5).map(function (s) {
      return '<a href="' + s.url + '" target="_blank" rel="noopener">🔗 ' + escapeHtml(s.source) + '</a>';
    }).join('');
    if (t.sources.length > 5) {
      sourcesHtml += '<span style="font-size:12px;color:var(--text-secondary)">และอีก ' + (t.sources.length - 5) + ' แหล่ง</span>';
    }

    var srcCount = uniqueSourceCount(t);
    var metaText = formatThaiDate(new Date(t.earliestDate)) + ' · นำเสนอ ' + t.count + ' ครั้ง · ' + srcCount + ' สำนักข่าว';

    // เนื้อหาย่อ: ตัดแสดง 5 บรรทัด (CSS line-clamp) ถ้ายาวเกิน ~180 ตัวอักษร แสดงปุ่ม "อ่านเพิ่ม"
    var summaryText = t.summary || '';
    var summaryHtml = '<p class="summary">' + escapeHtml(summaryText) + '</p>';
    if (summaryText.length > 180) {
      summaryHtml += '<button type="button" class="read-more" onclick="toggleSummary(this)">อ่านเพิ่ม ▾</button>';
    }

    // ⭐ แท็กข่าวลบ — วางไว้ "ล่างการ์ด" ตามที่ออกแบบไว้ คู่กับกรอบการ์ดสีแดง
    //    ไม่ใช้อิโมจิมุมการ์ด เพราะกรอบแดงเห็นชัดจากระยะไกลอยู่แล้ว
    var negTagHtml = '';
    if (t.isNegative) {
      var impactText = (t.impact && t.impact !== '-') ? ' · ระดับ' + t.impact : '';
      var partial = (t.negCount < t.count) ? ' (' + t.negCount + '/' + t.count + ' ข่าว)' : '';
      negTagHtml = '<div class="neg-tag-row"><span class="badge neg-tag">ข่าวลบ' + impactText + partial + '</span></div>';
    }

    return '<div class="news-card' + attentionClass + (t.isNegative ? ' is-negative' : '') + '">' +
      hotBadgeHtml + badges +
      '<p class="title">' + escapeHtml(t.title) + '</p>' +
      summaryHtml +
      '<p class="meta">' + metaText + '</p>' +
      '<div class="sources">' + sourcesHtml + '</div>' +
      negTagHtml +
      '</div>';
  }).join('');
}

// สลับย่อ/ขยายเนื้อหาย่อในการ์ดข่าว (เรียกจากปุ่ม "อ่านเพิ่ม")
function toggleSummary(btn) {
  var summary = btn.previousElementSibling;
  if (!summary || !summary.classList.contains('summary')) return;
  var expanded = summary.classList.toggle('expanded');
  btn.textContent = expanded ? 'ย่อ ▴' : 'อ่านเพิ่ม ▾';
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

  // ⚠️ ถอดคอลัมน์ "ไทย-กัมพูชา" ออก 2 ส.ค. 69 — ซ้ำ 100% กับคอลัมน์ "หมวด" โดยนิยาม
  //    (ตั้งแต่เปลี่ยนให้คำนวณจากหมวดแทนคอลัมน์ K ที่เลิกใช้แล้ว)
  var headers = ['วันที่เวลา', 'หัวข้อ', 'แหล่งที่มา', 'หมวด', 'ข่าวลบ', 'ระดับผลกระทบ', 'ลิงก์'];
  var lines = [headers.join(',')];

  rows.forEach(function (n) {
    var cells = [
      n.datetime, n.title, n.source, n.category,
      n.isNegative ? 'ลบ' : 'ไม่ลบ', n.impact || '-', n.url
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
  document.getElementById('onlyNegative').checked = false;

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
['searchInput', 'dateFrom', 'dateTo', 'onlyToday', 'onlyLast3Days', 'onlyNegative', 'sortOrder']
  .forEach(function (id) {
    var el = document.getElementById(id);
    el.addEventListener('input', applyFiltersAndRender);
    el.addEventListener('change', applyFiltersAndRender);
  });

document.getElementById('exportBtn').addEventListener('click', exportCsv);
document.getElementById('clearFiltersBtn').addEventListener('click', clearAllFilters);

// ============================================================
// แท็บสลับ: รายการข่าว / กราฟสรุป
// ============================================================
var chartsRendered = false;

function switchTab(tab) {
  var isList = tab === 'list';
  document.getElementById('listView').style.display = isList ? '' : 'none';
  document.getElementById('chartsView').style.display = isList ? 'none' : '';
  document.getElementById('tabListBtn').classList.toggle('active', isList);
  document.getElementById('tabChartsBtn').classList.toggle('active', !isList);

  if (!isList && !chartsRendered) {
    renderCharts();
    chartsRendered = true;
  }
}

document.getElementById('tabListBtn').addEventListener('click', function () { switchTab('list'); });
document.getElementById('tabChartsBtn').addEventListener('click', function () { switchTab('charts'); });

// ============================================================
// ปรับขนาดตัวอักษร (ช่วยผู้ที่มีปัญหาด้านสายตา)
//  - ข้อความทั้งหน้าใช้หน่วย rem จึงขยายตาม font-size ของ <html>
//  - ตัวอักษรในกราฟ Chart.js เป็น px จึงต้องคูณสเกลเองแล้ววาดกราฟใหม่
// ============================================================
var FONT_SCALE_KEY = 'dashboardFontScale';
var fontScale = 1;

/** คืนขนาดฟอนต์สำหรับกราฟตามสเกลปัจจุบัน */
function cfs(base) {
  return Math.round(base * fontScale);
}

function applyFontScale(scale, save) {
  fontScale = parseFloat(scale) || 1;
  document.documentElement.style.fontSize = Math.round(100 * fontScale) + '%';

  var btns = document.querySelectorAll('.fontsize-btn');
  for (var i = 0; i < btns.length; i++) {
    var isActive = parseFloat(btns[i].getAttribute('data-fontscale')) === fontScale;
    btns[i].classList.toggle('active', isActive);
    btns[i].setAttribute('aria-pressed', isActive ? 'true' : 'false');
  }

  if (save) {
    try { localStorage.setItem(FONT_SCALE_KEY, String(fontScale)); } catch (e) { /* เบราว์เซอร์ปิด storage ก็ยังใช้งานได้ปกติ */ }
  }

  if (chartsRendered) renderCharts(); // วาดกราฟใหม่ให้ตัวอักษรในกราฟขยายตาม
}

function initFontScale() {
  var saved = 1;
  try { saved = parseFloat(localStorage.getItem(FONT_SCALE_KEY)) || 1; } catch (e) { saved = 1; }
  applyFontScale(saved, false);

  var btns = document.querySelectorAll('.fontsize-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].addEventListener('click', function () {
      applyFontScale(this.getAttribute('data-fontscale'), true);
    });
  }
}

initFontScale();

// ============================================================
// กราฟสรุป — คำนวณจากข้อมูลทั้งหมด (ไม่ผูกกับตัวกรองของแท็บรายการข่าว)
// ============================================================
function renderCharts() {
  // ทำลายกราฟเดิมก่อนวาดใหม่ (เช่น ตอนเปลี่ยนขนาดตัวอักษร) กันกราฟซ้อนทับกัน
  ['categoryBar', 'sourceBar', 'trendBar'].forEach(function (id) {
    var existing = Chart.getChart(id);
    if (existing) existing.destroy();
  });

  var allTopics = groupIntoTopics(state.allNews);
  var last14DaysNews = getLast14DaysNews();

  renderChartStats(allTopics);
  renderCategoryBar(state.allNews);   // ⚠️ ส่ง "ข่าว" ไม่ใช่ "ประเด็น" — กราฟนี้นับรายข่าว
  renderSourceBar(last14DaysNews);
  renderTrendBar(state.allNews);
}

function getLast14DaysNews() {
  var cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 13); // วันนี้ + ย้อนหลัง 13 วัน = 14 วัน
  return state.allNews.filter(function (n) { return new Date(n.datetime) >= cutoff; });
}

function renderChartStats(allTopics) {
  // ⚠️ นับจากธง isNegative — เดิมนับด้วยหมวด ทำให้ข่าวลบเรื่องกัมพูชาตกหล่น 18%
  var negCount = allTopics.filter(function (t) { return t.isNegative; }).length;
  var camCount = allTopics.filter(function (t) { return t.category === 'ชายแดนไทย-กัมพูชา'; }).length;

  document.getElementById('chartStatGrid').innerHTML =
    '<div class="stat-card"><p class="label">ข่าวทั้งหมด</p><p class="value">' + state.allNews.length + '</p></div>' +
    '<div class="stat-card"><p class="label">ประเด็นทั้งหมด</p><p class="value accent">' + allTopics.length + '</p></div>' +
    '<div class="stat-card"><p class="label">ประเด็นข่าวลบ</p><p class="value" style="color:#E05C5C">' + negCount + '</p></div>' +
    '<div class="stat-card"><p class="label">ประเด็นไทย-กัมพูชา</p><p class="value" style="color:#4CAF6D">' + camCount + '</p></div>';
}
/**
 * กราฟหมวดข่าว — แท่งแนวนอนซ้อน "ข่าวลบ + ข่าวไม่ลบ"
 *
 * ⚠️ เปลี่ยนจากโดนัทเป็นแท่งแนวนอน 2 ส.ค. 69 (เย็น)
 *    โดนัทบอกได้แค่ "หมวดไหนเยอะ" แต่บอกไม่ได้ว่า "หมวดไหนมีข่าวลบเยอะ"
 *    ซึ่งเป็นคำถามหลักของทีมโฆษก
 *
 * ⚠️ ซ้อน "ลบ + ไม่ลบ" ไม่ใช่ "ยอดรวม + ลบ"
 *    เพราะข่าวลบเป็นส่วนหนึ่งของยอดรวมอยู่แล้ว ถ้าซ้อนตรง ๆ จะนับซ้ำ
 *    (จชต. จะยาวเท่ากับ 704 + 448 = 1,152 ทั้งที่มีจริง 704 และแกน X พองตาม)
 *    ซ้อนแบบนี้ความยาวแท่ง = ยอดรวมจริง และท่อนแดง = ข่าวลบพอดี
 *
 * ⚠️ นับเป็น "ข่าว" ไม่ใช่ "ประเด็น" (โดนัทเดิมนับประเด็น) — ตัวเลขต่างกันมาก
 *    เช่น จชต. 704 ข่าว แต่ 322 ประเด็น จึงเขียนกำกับไว้ใต้หัวกราฟ
 *
 * แสดงครบ 10 หมวดรวมหมวดที่เป็น 0 — "หมวดที่เงียบ" ก็เป็นข้อมูล
 */
function renderCategoryBar(newsList) {
  var agg = {};
  CATEGORY_ORDER.forEach(function (k) { agg[k] = { neg: 0, pos: 0 }; });
  newsList.forEach(function (n) {
    var c = normalizeCategory(n.category);
    if (!agg[c]) agg[c] = { neg: 0, pos: 0 };   // หมวดแปลกที่หลุดเข้ามา — ให้เห็น ไม่ให้หาย
    if (n.isNegative) agg[c].neg++; else agg[c].pos++;
  });

  var rows = Object.keys(agg).map(function (k) {
    var a = agg[k];
    return { key: k, neg: a.neg, pos: a.pos, total: a.neg + a.pos };
  }).sort(function (a, b) { return b.total - a.total; });

  new Chart(document.getElementById('categoryBar'), {
    type: 'bar',
    data: {
      labels: rows.map(function (r) { return r.key; }),
      datasets: [
        { label: 'ข่าวลบ', data: rows.map(function (r) { return r.neg; }),
          backgroundColor: '#E05C5C', stack: 'c', borderRadius: 2 },
        { label: 'ข่าวไม่ลบ', data: rows.map(function (r) { return r.pos; }),
          backgroundColor: '#6BA6FF', stack: 'c', borderRadius: 2 }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        subtitle: {
          display: true,
          text: 'นับเป็นจำนวนข่าว · ความยาวแท่ง = ยอดรวมของหมวด',
          color: '#9AA6C0', font: { size: cfs(11) }, padding: { bottom: 6 }
        },
        legend: { position: 'bottom', labels: { color: '#E8EAF0', font: { size: cfs(11) }, boxWidth: 12, padding: 10 } },
        tooltip: {
          callbacks: {
            // เติม "คิดเป็นกี่ % ของหมวด" ให้อ่านค่าได้โดยไม่ต้องคำนวณเอง
            afterBody: function (items) {
              var r = rows[items[0].dataIndex];
              if (!r.total) return '';
              return 'รวม ' + r.total + ' ข่าว · ข่าวลบ ' + Math.round(100 * r.neg / r.total) + '%';
            }
          }
        }
      },
      scales: {
        x: { stacked: true, ticks: { color: '#8891A5', precision: 0 }, grid: { color: '#22304A' } },
        y: { stacked: true, ticks: { color: '#E8EAF0', font: { size: cfs(11) } }, grid: { display: false } }
      }
    }
  });
}

function renderSourceBar(newsList) {
  var bySource = {};
  newsList.forEach(function (n) {
    var s = (n.source || 'ไม่ระบุ').trim() || 'ไม่ระบุ';
    if (!bySource[s]) bySource[s] = { total: 0, cam: 0, neg: 0, other: 0 };
    bySource[s].total++;
    if (n.isNegative) bySource[s].neg++;
    else if (n.category === 'ชายแดนไทย-กัมพูชา') bySource[s].cam++;
    else bySource[s].other++;
  });

  var top = Object.keys(bySource)
    .map(function (s) { return Object.assign({ source: s }, bySource[s]); })
    .sort(function (a, b) { return b.total - a.total; })
    .slice(0, 10);
  // ไม่ต้อง reverse — Chart.js วางรายการแรกของ labels ไว้บนสุดของแท่งแนวนอนอยู่แล้ว

  new Chart(document.getElementById('sourceBar'), {
    type: 'bar',
    data: {
      labels: top.map(function (t) { return t.source; }),
      datasets: [
        { label: 'ไทย-กัมพูชา', data: top.map(function (t) { return t.cam; }), backgroundColor: '#4CAF6D', stack: 's' },
        { label: 'ข่าวลบ', data: top.map(function (t) { return t.neg; }), backgroundColor: '#E05C5C', stack: 's' },
        { label: 'ข่าวทั่วไป', data: top.map(function (t) { return t.other; }), backgroundColor: '#6BA6FF', stack: 's' }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        subtitle: {
          display: true,
          text: 'นับเป็นจำนวนข่าว (14 วันล่าสุด)',
          color: '#9AA6C0',
          font: { size: cfs(11) },
          padding: { bottom: 6 }
        },
        legend: { position: 'bottom', labels: { color: '#E8EAF0', font: { size: cfs(11) }, boxWidth: 12 } }
      },
      scales: {
        x: { stacked: true, ticks: { color: '#8891A5', precision: 0 }, grid: { color: '#22304A' } },
        y: { stacked: true, ticks: { color: '#E8EAF0', font: { size: cfs(11) } }, grid: { display: false } }
      }
    }
  });
}

function renderTrendBar(newsList) {
  var days = [];
  for (var i = 13; i >= 0; i--) {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push(d);
  }

  var camSeries = [], negSeries = [], otherSeries = [];
  var labels = days.map(function (d) { return d.getDate() + ' ' + THAI_MONTHS_ABBR[d.getMonth()]; });

  days.forEach(function (dayStart) {
    var dayEnd = new Date(dayStart.getTime() + 86400000);
    var itemsToday = newsList.filter(function (n) {
      var t = new Date(n.datetime);
      return t >= dayStart && t < dayEnd;
    });
    negSeries.push(itemsToday.filter(function (n) { return n.isNegative; }).length);
    camSeries.push(itemsToday.filter(function (n) { return !n.isNegative && n.category === 'ชายแดนไทย-กัมพูชา'; }).length);
    otherSeries.push(itemsToday.filter(function (n) { return !n.isNegative && n.category !== 'ชายแดนไทย-กัมพูชา'; }).length);
  });

  new Chart(document.getElementById('trendBar'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'ไทย-กัมพูชา', data: camSeries, backgroundColor: '#4CAF6D', stack: 's' },
        { label: 'ข่าวลบ', data: negSeries, backgroundColor: '#E05C5C', stack: 's' },
        { label: 'อื่นๆ', data: otherSeries, backgroundColor: '#6BA6FF', stack: 's' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        subtitle: {
          display: true,
          text: 'นับเป็นจำนวนข่าว',
          color: '#9AA6C0',
          font: { size: cfs(11) },
          padding: { bottom: 6 }
        },
        legend: { position: 'bottom', labels: { color: '#E8EAF0', font: { size: cfs(11) }, boxWidth: 12 } }
      },
      scales: {
        x: { stacked: true, ticks: { color: '#8891A5', font: { size: cfs(10) } }, grid: { display: false } },
        y: { stacked: true, ticks: { color: '#8891A5', precision: 0 }, grid: { color: '#22304A' } }
      }
    }
  });
}

loadData();
