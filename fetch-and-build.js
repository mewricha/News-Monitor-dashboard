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
 *    โดยไม่มี error ให้เห็น (ลบคอลัมน์ T-W ไป 2 ส.ค. 69 — อยู่หลัง 18 จึงไม่กระทบ)
 *
 * ⚠️ คอลัมน์ K (ตรวจกัมพูชา) ไม่ถูกใช้ตัดสินอะไรแล้ว — วัดแล้วพบว่าติดธงมั่ว 17%
 *    และพลาดของจริง 41 แถว จึงเปลี่ยนไปคำนวณจาก "หมวด" (คอลัมน์ M) แทน
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const CSV_URL = process.env.SHEET_CSV_URL;

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

  const rows = parse(csvText, { skip_empty_lines: true });
  const dataRows = rows.slice(1); // แถวแรกเป็นหัวตาราง ข้ามไป

  const news = [];
  for (const row of dataRows) {
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
      // คำนวณจากหมวด ไม่ใช่คอลัมน์ K — ให้ตรงกับที่ระบบใช้ตัดสินจริงทุกที่
      isThailandCambodia: ((row[12] || '').trim() === 'ชายแดนไทย-กัมพูชา'),
      eventGroup: (row[13] || '').trim()
    });
  }

  news.sort(function (a, b) { return new Date(b.datetime) - new Date(a.datetime); });

  const output = {
    generatedAt: new Date().toISOString(),
    count: news.length,
    news: news
  };

  const outDir = path.join(process.cwd(), 'data');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'news.json'), JSON.stringify(output));

  console.log('เขียน data/news.json สำเร็จ: ' + news.length + ' ข่าว');
}

main().catch(function (err) {
  console.error('เกิดข้อผิดพลาด:', err.message);
  process.exit(1);
});
