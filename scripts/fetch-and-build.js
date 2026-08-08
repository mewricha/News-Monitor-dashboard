#!/usr/bin/env node
/**
 * ดึงข้อมูลข่าวจากชีต Google Sheet (ผ่านลิงก์ Publish to web แบบ CSV — อ่านอย่างเดียว ไม่แตะชีตต้นทาง)
 * แล้วแปลงเป็น data/news.json ให้เว็บแดชบอร์ด static อ่านนำไปแสดงผล
 *
 * ตำแหน่งคอลัมน์ในชีตต้นทาง (0-based) — ชีตมี 19 คอลัมน์ A-S (อัปเดต 2 ส.ค. 69)
 *  0=A วันที่เวลา   1=B คำค้น        2=C หัวข้อ        3=D แหล่งที่มา   4=E เนื้อหาย่อ
 *  5=F URL          6=G สถานะตรวจสอบ 7=H ผลวิเคราะห์   8=I ระดับผลกระทบ 9=J เหตุผล
 * 10=K ตรวจกัมพูชา 11=L สถานะรายงาน 12=M หมวดประเด็น 13=N รหัสกลุ่มข่าว
 * 14=O รหัสสถานการณ์ 15=P ปั่นกระแส 16=Q ชื่อสถานการณ์ 17=R แกนเหตุการณ์ 18=S จังหวัด
 *
 * ⚠️ ไฟล์นี้อ้างคอลัมน์ด้วย "เลขดัชนี" ล้วน ไม่ได้อ่านจากหัวตาราง
 *    ถ้ามีการลบหรือแทรกคอลัมน์ในชีต ต้องมาแก้ที่นี่ด้วย ไม่งั้นแดชบอร์ดจะแสดงข้อมูลผิด "เงียบ ๆ"
 *    (ลบคอลัมน์ T-W ไป 2 ส.ค. 69 — อยู่หลังดัชนี 18 จึงไม่กระทบไฟล์นี้)
 *    → 4 ส.ค. 69 เพิ่ม assertHeader() มาปิดช่องนี้แล้ว: ถ้าหัวตารางไม่ตรงตำแหน่งที่คาด
 *      สคริปต์จะหยุดพร้อมบอกว่าคอลัมน์ไหนเลื่อน แทนที่จะเขียนข้อมูลผิดลงเว็บเงียบ ๆ
 *
 * ⚠️ คอลัมน์ K (ตรวจกัมพูชา) ไม่ถูกใช้ตัดสินอะไรแล้ว — วัดแล้วพบว่าติดธงมั่ว 17%
 *    และพลาดของจริง 41 แถว จึงเปลี่ยนไปคำนวณจาก "หมวด" (คอลัมน์ M) แทน
 *
 * ============================================================
 * ⭐ ปรับปรุง 4 ส.ค. 69 (ก้อน B) — 4 เรื่อง
 *   S15 ด่านกันข้อมูลพัง : เดิมถ้าชีตคืน HTML (ยกเลิก publish / หน้า login) โดยสถานะ 200
 *                          จะได้ news = [] แล้วเขียนทับไฟล์ดี → เว็บว่างเปล่าโดยไม่มี error
 *                          ตอนนี้ตรวจ 3 ด่านก่อนเขียน ถ้าไม่ผ่าน = exit 1 ไฟล์เดิมอยู่ครบ
 *   S16 relax_column_count : เดิมแถวที่คอลัมน์ไม่ครบทำให้ทั้งรอบล้ม ตอนนี้ข้ามเฉพาะแถวนั้น
 *   S18 ดึงคอลัมน์ R      : ชื่อประเด็นบนเว็บจะตรงกับรายงาน LINE (เดิมเว็บใช้พาดหัวข่าวดิบ)
 *   S19 ไม่เขียนซ้ำ       : ถ้าเนื้อข่าวเหมือนเดิมเป๊ะ จะไม่แตะไฟล์ → GitHub ไม่ commit
 *                          ผลข้างเคียงที่ตั้งใจ: generatedAt = "เวลาที่ข้อมูลเปลี่ยนจริง"
 *                          ไม่ใช่ "เวลาที่รันสคริปต์" → ถ้าต้นทางตาย เวลาบนเว็บจะหยุดนิ่งให้เห็น
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const CSV_URL = process.env.SHEET_CSV_URL;

// อนุญาตให้ข้อมูลหดเกินเพดานได้ ต่อเมื่อสั่งเองโดยตั้งใจ (เช่น เพิ่งลบข่าวซ้ำครั้งใหญ่)
// วิธีใช้: แท็บ Actions > Update news data > Run workflow > ช่อง allow_shrink = true
const ALLOW_SHRINK = String(process.env.ALLOW_SHRINK || '').toLowerCase() === 'true';

// เพดานการหดตัวที่ยอมรับได้โดยไม่ต้องยืนยัน
// อ้างอิงของจริง: การลบข่าวซ้ำครั้งใหญ่สุดที่เคยทำ = 34 แถวจาก 1,851 (1.8%)
// ตั้ง 20% จึงห่างจากของจริงมาก แต่ยังจับ "CSV ขาดครึ่ง" ได้อยู่
const MAX_SHRINK_RATIO = 0.20;

const OUT_PATH = path.join(process.cwd(), 'data', 'news.json');

// ============================================================
// ⭐ S20 — ไฟล์ "ชีพจร" เพิ่ม 8 ส.ค. 69
//
// 🔴 เหตุที่ต้องมี (เรื่องจริง 8 ส.ค. 69 เช้า):
//    เจ้าของระบบเห็นหน้าเว็บค้างที่ 07:37 น. นาน 4 ชั่วโมง จึงแจ้งว่า "เว็บไม่อัปเดต"
//    ไล่ตรวจทุกชั้นแล้วพบว่า **ไม่มีอะไรพังเลย** — เสาร์เช้าข่าวเข้ามา 3 ชิ้น
//    และทั้ง 3 ถูกกรองออกอย่างถูกต้อง (PR_NO_ARMY · GENERAL_NEWS · OTHER_AGENCY)
//    ด่าน S19 จึงไม่เขียนไฟล์ ไม่ commit ตามที่ออกแบบไว้เป๊ะ
//
// 👉 ปัญหาคือ S19 แก้เรื่อง "เว็บโกหกว่าสด" ได้สำเร็จ แต่สร้างอาการใหม่ขึ้นมาแทน:
//    **หน้าเว็บเงียบจนดูเหมือนตาย** ผู้ใช้แยกไม่ออกระหว่าง
//      ① ตรวจแล้ว ไม่มีข่าวใหม่  (ปกติ)      ② ระบบหยุดทำงาน  (ต้องแก้)
//    สองฉากนี้หน้าตาเหมือนกันทุกประการบนหน้าเว็บ
//
// 🔑 ไฟล์นี้จึงตอบคนละคำถามกับ news.json โดยตั้งใจ
//      news.json      → "ข้อมูลล่าสุดเมื่อไร"   (เปลี่ยนเฉพาะตอนมีข่าวใหม่)
//      heartbeat.json → "ตรวจสอบล่าสุดเมื่อไร" (เปลี่ยนทุกรอบที่ตรวจสำเร็จ)
//
// ⚠️ กติกาเหล็กของไฟล์นี้ — ห้ามแก้ให้ผิดไปจากนี้
//   1. **เขียนหลังด่าน S15/S16 ผ่านครบแล้วเท่านั้น**
//      ถ้าด่านไหนล้ม fail() จะ exit(1) ก่อนถึงบรรทัดนี้ → checkedAt ค้างไปด้วย
//      ซึ่งเป็นสิ่งที่ต้องการ เพราะความหมายของมันคือ "ตรวจ**สำเร็จ**ล่าสุด"
//      ไม่ใช่ "รันล่าสุด" — ถ้าเขียนก่อนด่าน มันจะกลายเป็นตัวโกหกอีกตัวหนึ่งทันที
//   2. ต้องเล็กเสมอ (~120 ไบต์) ห้ามใส่รายการข่าวลงไป
//      ที่ยอมให้ commit ทุกชั่วโมงได้ก็เพราะมันเล็ก — เหตุผลจริงของ S19 คือ
//      ไฟล์ 1.9 MB × 17 รอบ/วัน ไม่ใช่ "จำนวน commit"
//   3. หน้าเว็บต้องทนได้เมื่อไม่มีไฟล์นี้ (รอบแรกสุด / โหลดไม่ติด) — ไม่ใช่ error
// ============================================================
const HEARTBEAT_PATH = path.join(process.cwd(), 'data', 'heartbeat.json');

/**
 * เขียนไฟล์ชีพจร — เรียกได้ทั้งเส้นทาง "ข้อมูลเหมือนเดิม" และ "เขียนข้อมูลใหม่"
 * @param {string} result 'no-change' = ตรวจแล้วข่าวเหมือนเดิม · 'updated' = มีข่าวใหม่
 * @param {number} count  จำนวนข่าวที่นับได้ในรอบนี้
 * @param {string} dataAt generatedAt ของ news.json ที่ใช้อยู่ ณ ตอนนี้
 */
function writeHeartbeat(result, count, dataAt) {
  try {
    fs.mkdirSync(path.dirname(HEARTBEAT_PATH), { recursive: true });
    fs.writeFileSync(HEARTBEAT_PATH, JSON.stringify({
      checkedAt: new Date().toISOString(),
      result: result,
      count: count,
      dataAt: dataAt || null
    }));
    console.log('💓 เขียน data/heartbeat.json แล้ว (' + result + ')');
  } catch (e) {
    // ⚠️ ห้ามล้มทั้งรอบเพราะไฟล์ชีพจร — ของหลักคือ news.json
    console.log('⚠️ เขียน heartbeat ไม่สำเร็จ (' + e.message + ') — ไม่กระทบ news.json');
  }
}

// ============================================================
// ตำแหน่งคอลัมน์ที่ไฟล์นี้ใช้จริง + ชื่อหัวตารางที่ต้องเจอตรงตำแหน่งนั้น
// ⚠️ ถ้าเปลี่ยนชื่อหัวตารางในชีต ต้องมาแก้ที่นี่ด้วย ไม่งั้นสคริปต์จะหยุดทำงาน
//    (ตั้งใจให้ "หยุดแล้วบ่น" ดีกว่า "เขียนผิดเงียบ ๆ")
// ============================================================
const EXPECTED_HEADERS = {
  0: 'วันที่และเวลา',
  2: 'หัวข้อข่าว',
  3: 'แหล่งที่มา',
  4: 'เนื้อหาโดยย่อ',
  6: 'สถานะตรวจสอบ',
  7: 'ผลวิเคราะห์',
  8: 'ระดับผลกระทบ',
  12: 'หมวดประเด็น',
  13: 'รหัสกลุ่มข่าว',
  17: 'แกนเหตุการณ์'
};

// ชื่อคอลัมน์แบบ A, B, C ... สำหรับข้อความแจ้งเตือน (ดัชนี 0 = A)
function colLetter(i) {
  return String.fromCharCode(65 + i);
}

/**
 * แปลงสตริงวันที่แบบไทย "d/M/yyyy, H:mm:ss" (วัน/เดือน/ปี) เป็น Date object ที่ถูกต้อง
 * เขียนเองแทนการใช้ new Date(str) เพราะ JavaScript ตีความสตริงรูปแบบ xx/xx/xxxx
 * เป็นเดือน/วันแบบอเมริกันเสมอ ทำให้วัน/เดือนสลับกันถ้าต้นฉบับเป็นไทย
 * เวลาไทยคือ UTC+7 ตลอดปี (ไม่มี DST) จึงลบ 7 ชม. เพื่อคำนวณเวลา UTC ที่ถูกต้องเสมอ
 * ไม่ว่าเซิร์ฟเวอร์ที่รันสคริปต์นี้จะอยู่โซนเวลาใดก็ตาม
 */
function parseThaiDatetime(str) {
  var m = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  var day = parseInt(m[1], 10);
  var month = parseInt(m[2], 10);
  var year = parseInt(m[3], 10);
  var hour = parseInt(m[4], 10);
  var minute = parseInt(m[5], 10);
  var second = parseInt(m[6], 10);
  var utcMillis = Date.UTC(year, month - 1, day, hour, minute, second) - 7 * 3600 * 1000;
  return new Date(utcMillis);
}

/** หยุดทั้งรอบพร้อมข้อความที่บอกได้ว่า "ต้องไปแก้ตรงไหน" */
function fail(code, message, hint) {
  console.error('');
  console.error('⛔ [' + code + '] ' + message);
  if (hint) console.error('   ▸ ' + hint);
  console.error('   ▸ ไฟล์ data/news.json เดิมไม่ถูกแตะ เว็บยังแสดงข้อมูลชุดล่าสุดที่ดีอยู่');
  console.error('');
  process.exit(1);
}

// ============================================================
// S15 ด่านที่ 1 — เนื้อหาที่ได้ต้องเป็น CSV ไม่ใช่หน้าเว็บ
// ============================================================
function assertLooksLikeCsv(res, text) {
  var ctype = (res.headers.get('content-type') || '').toLowerCase();
  if (ctype.indexOf('html') !== -1) {
    fail('S15-HTML', 'ชีตคืนหน้าเว็บ (content-type: ' + ctype + ') ไม่ใช่ไฟล์ CSV',
         'สาเหตุที่พบบ่อยที่สุดคือลิงก์ Publish to web ถูกยกเลิก — ไปที่ ไฟล์ > แชร์ > เผยแพร่ทางเว็บ แล้วเผยแพร่ใหม่');
  }
  var head = text.slice(0, 500).trim().toLowerCase();
  if (head.indexOf('<!doctype html') === 0 || head.indexOf('<html') === 0 || head.indexOf('<head') === 0) {
    fail('S15-HTML', 'เนื้อหาที่ได้ขึ้นต้นด้วยแท็ก HTML ไม่ใช่ CSV',
         'มักเป็นหน้าเข้าสู่ระบบของ Google — แปลว่าลิงก์ที่ตั้งไว้ไม่ใช่ลิงก์เผยแพร่สาธารณะแล้ว');
  }
  if (text.trim().length === 0) {
    fail('S15-EMPTY', 'ชีตคืนเนื้อหาว่างเปล่า (0 ไบต์)', 'ลองเปิด SHEET_CSV_URL ในเบราว์เซอร์ดูว่าได้อะไร');
  }
}

// ============================================================
// S15 ด่านที่ 2 — หัวตารางต้องอยู่ตรงตำแหน่งที่โค้ดนี้คาดไว้
// ปิดช่อง "มีคนแทรก/ลบคอลัมน์ในชีต แล้วเว็บแสดงข้อมูลผิดช่องแบบเงียบ ๆ"
// ============================================================
function assertHeader(headerRow) {
  if (!headerRow || headerRow.length < 18) {
    fail('S15-COLS', 'หัวตารางมี ' + (headerRow ? headerRow.length : 0) +
         ' คอลัมน์ แต่ต้องมีอย่างน้อย 18 (ถึงคอลัมน์ R)',
         'ถ้าเพิ่งลบคอลัมน์ในชีต ต้องมาแก้เลขดัชนีในไฟล์นี้ให้ตรงด้วย');
  }
  var wrong = [];
  Object.keys(EXPECTED_HEADERS).forEach(function (idx) {
    var i = parseInt(idx, 10);
    var got = (headerRow[i] || '').toString().trim();
    if (got !== EXPECTED_HEADERS[i]) {
      wrong.push('ช่องที่ ' + i + ' (' + colLetter(i) + ') คาดว่า "' +
                 EXPECTED_HEADERS[i] + '" แต่เจอ "' + got + '"');
    }
  });
  if (wrong.length > 0) {
    console.error('');
    console.error('⛔ [S15-HEADER] หัวตารางในชีตไม่ตรงกับที่โค้ดนี้คาดไว้ ' + wrong.length + ' ช่อง:');
    wrong.forEach(function (w) { console.error('     • ' + w); });
    fail('S15-HEADER', 'หยุดก่อนเขียนข้อมูล เพราะถ้าเขียนต่อ เว็บจะแสดงข้อมูลผิดช่องโดยไม่มีใครรู้',
         'ถ้าตั้งใจเปลี่ยนโครงชีตจริง ให้มาแก้ EXPECTED_HEADERS กับเลขดัชนีในไฟล์นี้พร้อมกัน');
  }
}

// ============================================================
// S15 ด่านที่ 3 — จำนวนข่าวต้องไม่เป็นศูนย์ และต้องไม่หดผิดปกติเทียบรอบก่อน
// ============================================================
function readPreviousOutput() {
  try {
    if (!fs.existsSync(OUT_PATH)) return null;
    var obj = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
    if (!obj || !Array.isArray(obj.news)) return null;
    return obj;
  } catch (e) {
    console.log('ℹ️ อ่าน data/news.json เดิมไม่ได้ (' + e.message + ') — ถือว่าเป็นรอบแรก');
    return null;
  }
}

function assertRowCount(news, prev) {
  if (news.length === 0) {
    fail('S15-ZERO', 'แปลง CSV แล้วได้ 0 ข่าว',
         'CSV อ่านได้แต่ไม่มีแถวไหนผ่านเงื่อนไข "มีสถานะตรวจสอบ + มีวันที่" — ตรวจว่าชีตยังมีข้อมูลอยู่จริง');
  }
  if (!prev || prev.news.length === 0) return;

  var before = prev.news.length;
  var shrink = (before - news.length) / before;
  if (shrink > MAX_SHRINK_RATIO) {
    if (ALLOW_SHRINK) {
      console.log('⚠️ ข้อมูลหด ' + Math.round(shrink * 100) + '% (' + before + ' → ' + news.length +
                  ' ข่าว) แต่สั่ง allow_shrink=true ไว้ จึงเขียนต่อ');
      return;
    }
    fail('S15-SHRINK', 'ข้อมูลหดจาก ' + before + ' เหลือ ' + news.length + ' ข่าว (' +
         Math.round(shrink * 100) + '% เกินเพดาน ' + Math.round(MAX_SHRINK_RATIO * 100) + '%)',
         'ถ้าเพิ่งลบข่าวจำนวนมากในชีตเองและตั้งใจให้เป็นแบบนี้ ให้กดรันซ้ำที่ ' +
         'Actions > Update news data > Run workflow แล้วตั้ง allow_shrink = true');
  }
}

async function main() {
  if (!CSV_URL) {
    throw new Error('ไม่พบ SHEET_CSV_URL — ต้องตั้งค่าเป็น GitHub Secret หรือ environment variable ก่อนรัน');
  }

  console.log('กำลังดึง CSV จากชีต...');
  const res = await fetch(CSV_URL);
  if (!res.ok) {
    throw new Error('ดึง CSV ไม่สำเร็จ: HTTP ' + res.status);
  }
  const csvText = await res.text();

  assertLooksLikeCsv(res, csvText);   // ⭐ S15 ด่านที่ 1

  // ⭐ S16: relax_column_count — แถวที่คอลัมน์ไม่ครบจะถูกอ่านเป็นแถวสั้น ไม่ทำให้ทั้งรอบล้ม
  //    (เดิม csv-parse โยน error ทันทีที่เจอแถวแรกที่จำนวนช่องไม่เท่าหัวตาราง)
  //    แถวสั้นจะถูกนับแล้วข้ามในลูปข้างล่าง เพื่อไม่ให้หลุดไปอ่านคอลัมน์ผิดตำแหน่ง
  let rows;
  try {
    rows = parse(csvText, { skip_empty_lines: true, relax_column_count: true });
  } catch (e) {
    fail('S16-PARSE', 'อ่าน CSV ไม่สำเร็จ: ' + e.message, 'ดูว่าเนื้อหาที่ชีตคืนมาเป็น CSV จริงหรือไม่');
  }

  if (rows.length < 2) {
    fail('S15-ZERO', 'CSV มีแค่ ' + rows.length + ' แถว (ต้องมีหัวตาราง + ข้อมูลอย่างน้อย 1 แถว)');
  }

  assertHeader(rows[0]);              // ⭐ S15 ด่านที่ 2

  const dataRows = rows.slice(1); // แถวแรกเป็นหัวตาราง ข้ามไป

  const news = [];
  let skippedShort = 0;
  for (const row of dataRows) {
    // แถวที่สั้นกว่า 18 ช่อง = ข้อมูลไม่ครบถึงคอลัมน์ R — นับไว้รายงาน แล้วข้าม
    if (row.length < 18) { skippedShort++; continue; }

    const status = (row[6] || '').trim();
    const datetimeRaw = (row[0] || '').trim();
    if (!status || !datetimeRaw) continue; // เอาเฉพาะข่าวที่วิเคราะห์ครบแล้วและมีวันที่

    const dt = parseThaiDatetime(datetimeRaw);
    if (!dt || isNaN(dt.getTime())) continue; // ข้ามแถวที่รูปแบบวันที่อ่านไม่ได้

    news.push({
      datetime: dt.toISOString(),
      title: (row[2] || '').trim(),
      source: (row[3] || '').trim(),
      summary: (row[4] || '').trim(),
      url: (row[5] || '').trim(),
      category: (row[12] || '').trim() || 'อื่นๆ',
      isNegative: (row[7] || '').trim() === 'ลบ',
      impact: (row[8] || '').trim() || '-',
      // ⚠️ ถอดฟิลด์ isThailandCambodia ออก 2 ส.ค. 69 — ซ้ำ 100% กับ category โดยนิยาม
      //    ฝั่งเว็บเช็ค category === 'ชายแดนไทย-กัมพูชา' ตรง ๆ อยู่แล้วทุกจุด
      eventGroup: (row[13] || '').trim(),
      // ⭐ S18: แกนเหตุการณ์ (คอลัมน์ R) = ชื่อประเด็นชุดเดียวกับที่รายงาน LINE ใช้
      //    ต้องส่งมาให้เว็บ ไม่งั้นเว็บจะโชว์ "พาดหัวข่าวดิบ" ซึ่งมีชื่อสำนักข่าวห้อยท้าย
      //    และมีคำเร้าอารมณ์ ทำให้ผู้ใช้เห็นประเด็นเดียวกันคนละชื่อใน 2 ช่องทาง
      //    วัดกับข้อมูลจริง 4 ส.ค. 69: กรอกครบ 1,851/1,851 แถว (100%)
      //    และไม่มีกลุ่มไหนเลยที่สมาชิกให้ค่าคอลัมน์ R ขัดกัน (0/994 กลุ่ม)
      eventTitle: (row[17] || '').trim()
    });
  }

  if (skippedShort > 0) {
    console.log('⚠️ ข้าม ' + skippedShort + ' แถวที่ข้อมูลไม่ครบถึงคอลัมน์ R (ปกติควรเป็น 0)');
  }

  news.sort(function (a, b) { return new Date(b.datetime) - new Date(a.datetime); });

  const prev = readPreviousOutput();
  assertRowCount(news, prev);         // ⭐ S15 ด่านที่ 3

  // ============================================================
  // ⭐ S19 — เขียนไฟล์ก็ต่อเมื่อ "เนื้อข่าว" เปลี่ยนจริง
  //
  // เดิม generatedAt เปลี่ยนทุกรอบ ไฟล์จึงต่างทุกรอบ ตัวกัน "commit เฉพาะเมื่อเปลี่ยน"
  // ใน workflow จึงไม่เคยได้ทำงานเลย → commit 17 ครั้ง/วัน ไฟล์ละ ~1.9 MB
  //
  // ⚠️ ผลข้างเคียงที่ "ตั้งใจให้เกิด": generatedAt = เวลาที่ข้อมูลเปลี่ยนจริง
  //    ไม่ใช่เวลาที่สคริปต์รัน ดังนั้นถ้าต้นทาง (Apps Script) หยุดเก็บข่าว
  //    เวลาบนหน้าเว็บจะหยุดนิ่งให้เห็น แทนที่จะขยับทุกชั่วโมงทั้งที่ข่าวไม่มาแล้ว
  //    นี่คือของที่ต้องการ — เดิมหน้าเว็บ "โกหกว่าสด" ได้ตลอดไป
  // ============================================================
  const newsJson = JSON.stringify(news);
  if (prev && JSON.stringify(prev.news) === newsJson) {
    console.log('⏸️ ข้อมูลข่าวเหมือนรอบก่อนทุกประการ (' + news.length + ' ข่าว) — ไม่เขียนไฟล์ ไม่ commit');
    console.log('   generatedAt เดิมยังเป็น ' + prev.generatedAt);
    console.log('   ℹ️ ถ้าขึ้นข้อความนี้ติดกันหลายรอบหลายชั่วโมง แปลว่าต้นทางหยุดเก็บข่าว ไม่ใช่เว็บพัง');
    // ⭐ S20 — ถึงจะไม่เขียน news.json ก็ต้องบอกหน้าเว็บว่า "รอบนี้ตรวจแล้วนะ"
    //    ไม่งั้นผู้ใช้แยกไม่ออกว่า "ไม่มีข่าวใหม่" หรือ "ระบบตาย"
    writeHeartbeat('no-change', news.length, prev.generatedAt);
    return;
  }

  const diff = prev ? news.length - prev.news.length : news.length;
  const output = {
    generatedAt: new Date().toISOString(),
    count: news.length,
    news: news
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output));

  console.log('✅ เขียน data/news.json สำเร็จ: ' + news.length + ' ข่าว' +
              (prev ? ' (เปลี่ยนแปลงสุทธิ ' + (diff >= 0 ? '+' : '') + diff + ')' : ' (รอบแรก)'));

  // ⭐ S20 — เขียนชีพจรในเส้นทางนี้ด้วย ไม่งั้นรอบที่ "มีข่าวใหม่" จะไม่มีชีพจรอัปเดต
  writeHeartbeat('updated', news.length, output.generatedAt);
}

main().catch(function (err) {
  console.error('เกิดข้อผิดพลาด:', err.message);
  process.exit(1);
});
