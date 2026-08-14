#!/usr/bin/env node
/**
 * 🗓️ build-cycle.js — ตัวสร้างหน้ารายงานสรุปตามวงรอบ (รายสัปดาห์/รายเดือน)
 *
 * รับข้อมูลรายงานเป็น JSON แล้วสร้าง
 *    ① reports/<id>.html   หน้ารายงานฉบับเต็ม (ไฟล์เดียว 2 หน้าตา: จอ/มือถือ + โหมดพิมพ์ A4)
 *    ② data/reports.json   ดัชนีให้แท็บ "สรุปข่าวตามวงรอบ" บนแดชบอร์ดอ่าน
 *
 * ── ที่มาของข้อมูล 2 ทาง ───────────────────────────────────────────
 *   ก. ทดสอบ/สั่งเอง : node scripts/build-cycle.js --input data/cycle-input-example.json
 *   ข. ของจริง       : ตั้ง env CYCLE_CSV_URL ชี้ไปแท็บ "รายงานวงรอบ" ที่ Publish เป็น CSV
 *                     คอลัมน์: A=id  B=type  C=from  D=to  E=publishedAt  F=status  G=json
 *                     เอาเฉพาะแถวที่ F = "พร้อมเผยแพร่"
 *
 * ── ทำไมข้อมูลถึงมาทางชีต ไม่ให้ Apps Script เขียนไฟล์เข้า repo ตรง ๆ ──
 *   1. GITHUB_TOKEN ที่ใช้อยู่มีสิทธิ์แค่ Actions — ถ้าเขียนไฟล์ตรงต้องเพิ่ม Contents: write
 *      = ขยายพื้นที่เสี่ยงของ token โดยไม่จำเป็น
 *   2. ตัวสร้าง HTML อยู่ฝั่ง Node เหมือน fetch-and-build.js จึงใช้เครื่องมือชุดเดียวกัน
 *   3. 🔑 JSON ดิบถูกเก็บถาวรในชีต ⇒ วันหน้าเปลี่ยนหน้าตารายงาน "สร้างใหม่ย้อนหลังได้ทุกฉบับ"
 *      โดยไม่ต้องเรียก Gemini ซ้ำ (ไม่เสียเงินซ้ำ · กฎห้ามลบอดีต)
 *
 * ── กติกาเหล็กของไฟล์นี้ ──────────────────────────────────────────
 *   🔴 ห้ามลบไฟล์รายงานเก่า — สร้างทับได้ ลบไม่ได้ (ฉบับที่เคยเผยแพร่ไปแล้วมีคนถือลิงก์อยู่)
 *   🔴 ดัชนีหดตัว = หยุดทันที ไม่เขียนทับ (ยกเว้นสั่ง allow_shrink เอง)
 *      เพราะดัชนีที่หดแปลว่าอ่านชีตได้ไม่ครบ ไม่ใช่ว่ารายงานหายไปจริง
 *   🔴 ไม่เขียนไฟล์ที่เนื้อหาเหมือนเดิมเป๊ะ → GitHub จะไม่ commit รอบนั้น (ยืมวิธี S19)
 *   🔴 เนื้อหาทุกตัวที่มาจากข้อมูลต้องผ่าน esc() ก่อนต่อเป็น HTML เสมอ
 *      ข้อมูลมาจากชีต = ข้อความที่ Gemini เขียน = ถือเป็นค่าจากภายนอกเสมอ
 */

'use strict';
const fs = require('fs');
const path = require('path');

const CSV_URL   = process.env.CYCLE_CSV_URL || '';
const ALLOW_SHRINK = String(process.env.ALLOW_SHRINK || '').toLowerCase() === 'true';
const ROOT      = process.cwd();
const OUT_DIR   = path.join(ROOT, 'reports');
const INDEX_OUT = path.join(ROOT, 'data', 'reports.json');
const READY     = 'พร้อมเผยแพร่';        // ค่าที่ต้องอยู่ในคอลัมน์ F ของชีตจึงจะถูกสร้าง

// ─────────────────────────────────────────────────────────────────
// สีของกราฟ — ทุกตัวเป็นชื่อตัวแปร CSS ไม่ใช่รหัสสีดิบ
// เพราะหน้ารายงานสลับโหมดมืด/สว่างได้ ถ้าฝังรหัสสีลง SVG ตัวหนังสือในกราฟ
// จะจมหายไปกับพื้นดำ (ชุดสีจริงอยู่ในตัวแปร :root / [data-theme=dark] ใน CSS)
// ─────────────────────────────────────────────────────────────────
const C = {
  ink:'var(--ink)', ink2:'var(--ink2)', ink4:'var(--ink4)',
  pine:'var(--pine)', alert:'var(--alert)', alertx:'var(--alertx)',
  rust:'var(--rust)', amber:'var(--amber)', grid:'var(--grid)',
  onalert:'var(--onalert)'
};
const FAM = 'TH Sarabun New';

/** escape สำหรับข้อความที่จะไปอยู่ระหว่างแท็ก HTML และในเนื้อ SVG <text> */
function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
/** ชื่อไฟล์ที่ยอมให้สร้างได้ — กันค่าจากชีตพาไปเขียนไฟล์นอกโฟลเดอร์ reports/ */
function safeId(id) {
  const s = String(id || '').trim();
  return /^[A-Za-z0-9_-]{3,40}$/.test(s) ? s : '';
}
/** ป้ายลูกศรเพิ่ม/ลด — ใช้รูปลูกศรเสมอ ไม่พึ่งสีอย่างเดียว */
function arrow(n) { return n > 0 ? '▲' : '▼'; }
function deltaColor(n, invert) {
  if (!n) return C.ink2;
  const good = invert ? n < 0 : n < 0;   // ทั้งข่าวรวมและข่าวลบ: ลดลง = ดี
  return good ? C.pine : C.rust;
}


// ═════════════════════════════════════════════════════════════════
// กราฟ — ทุกตัวสร้าง 2 ร่าง: จอกว้าง/พิมพ์ (desk) กับมือถือ (mob)
//
// ทำไมต้อง 2 ร่าง ไม่ใช่ย่อร่างเดียว: ร่างจอวางชื่อไว้ "ซ้ายแท่ง" ซึ่งบนจอ 390px
// จะถูกบีบจนอ่านไม่ออก ร่างมือถือจึงย้ายชื่อขึ้น "เหนือแท่ง" แทน
// (SVG ย่อได้ก็จริง แต่ตัวหนังสือจะย่อตามจนเล็กเกินอ่าน)
// ═════════════════════════════════════════════════════════════════

function legend(x, y, fs) {
  return `<rect x="${x}" y="${y}" width="14" height="14" rx="3" fill="${C.pine}"/>`
       + `<text x="${x + 19}" y="${y + 12}" font-size="${fs}" fill="${C.ink2}">ข่าวปกติ</text>`
       + `<rect x="${x + 110}" y="${y}" width="14" height="14" rx="3" fill="${C.alert}"/>`
       + `<text x="${x + 129}" y="${y + 12}" font-size="${fs}" fill="${C.ink2}">ข่าวลบ</text>`;
}

/** ① ข่าวรายวัน — แท่งตั้งซ้อน */
function chartDaily(daily) {
  const max = Math.max(...daily.map(d => d.total), 1);

  // ร่างจอ/พิมพ์
  let SC = 200 / max, p = [];
  const bw = 72, step = 690 / daily.length;
  for (let g = 0; g <= 4; g++) {
    const v = Math.round(max / 4 * g / 5) * 5 * 4 / 4;
    const yy = 240 - (max / 4 * g) * SC;
    p.push(`<line x1="40" y1="${yy.toFixed(1)}" x2="730" y2="${yy.toFixed(1)}" stroke="${C.grid}" stroke-width="1"/>`);
    p.push(`<text x="34" y="${(yy + 4).toFixed(1)}" font-size="14" fill="${C.ink4}" text-anchor="end">${Math.round(max / 4 * g)}</text>`);
  }
  daily.forEach((d, i) => {
    const x = 50 + i * step, ok = d.total - d.neg;
    const yo = 240 - ok * SC, yn = yo - d.neg * SC;
    p.push(`<rect x="${x.toFixed(1)}" y="${yo.toFixed(1)}" width="${bw}" height="${(ok * SC).toFixed(1)}" rx="3" fill="${C.pine}"/>`);
    if (d.neg) p.push(`<rect x="${x.toFixed(1)}" y="${yn.toFixed(1)}" width="${bw}" height="${(d.neg * SC).toFixed(1)}" rx="3" fill="${C.alert}"/>`);
    p.push(`<text x="${(x + bw / 2).toFixed(1)}" y="${(yn - 8).toFixed(1)}" font-size="16" font-weight="700" fill="${C.ink}" text-anchor="middle">${d.total}</text>`);
    if (d.neg) p.push(`<text x="${(x + bw / 2).toFixed(1)}" y="${(yn + d.neg * SC / 2 + 5).toFixed(1)}" font-size="13" fill="${C.onalert}" text-anchor="middle">ลบ ${d.neg}</text>`);
    p.push(`<text x="${(x + bw / 2).toFixed(1)}" y="262" font-size="15" fill="${C.ink2}" text-anchor="middle">${esc(d.label)}</text>`);
  });
  p.push(legend(50, 280, 14));
  const desk = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 300" font-family="${FAM}">${p.join('')}</svg>`;

  // ร่างมือถือ — กรอบแคบลง ตัวอักษรจึงใหญ่ขึ้นตามสัดส่วน
  SC = 210 / max; p = [];
  const bw2 = 40, gap = 12, x0 = 26;
  daily.forEach((d, i) => {
    const x = x0 + i * (bw2 + gap), ok = d.total - d.neg;
    const yo = 250 - ok * SC, yn = yo - d.neg * SC;
    p.push(`<rect x="${x}" y="${yo.toFixed(1)}" width="${bw2}" height="${(ok * SC).toFixed(1)}" rx="3" fill="${C.pine}"/>`);
    if (d.neg) p.push(`<rect x="${x}" y="${yn.toFixed(1)}" width="${bw2}" height="${Math.max(d.neg * SC - 2, 2).toFixed(1)}" rx="3" fill="${C.alert}"/>`);
    p.push(`<text x="${x + bw2 / 2}" y="${(yn - 6).toFixed(1)}" font-size="17" font-weight="700" fill="${C.ink}" text-anchor="middle">${d.total}</text>`);
    if (d.neg) p.push(`<text x="${x + bw2 / 2}" y="${(yn + d.neg * SC / 2 + 6).toFixed(1)}" font-size="13" fill="${C.onalert}" text-anchor="middle">${d.neg}</text>`);
    const parts = String(d.label).split(' ');
    p.push(`<text x="${x + bw2 / 2}" y="272" font-size="14" fill="${C.ink2}" text-anchor="middle">${esc(parts[0] || '')}</text>`);
    p.push(`<text x="${x + bw2 / 2}" y="288" font-size="12.5" fill="${C.ink4}" text-anchor="middle">${esc(parts[1] || '')}</text>`);
  });
  p.push(`<line x1="20" y1="250" x2="390" y2="250" stroke="${C.grid}" stroke-width="1"/>`);
  p.push(legend(26, 302, 15));
  const mob = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 330" font-family="${FAM}">${p.join('')}</svg>`;
  return { desk, mob };
}

/** แท่งนอนซ้อน 1 แถว — ใช้ร่วมกันระหว่างกราฟหมวดและกราฟสำนักข่าว */
function hbar(p, x0, y, n, neg, SC, h) {
  const ok = n - neg;
  let x = x0;
  if (ok > 0) { p.push(`<rect x="${x.toFixed(1)}" y="${y}" width="${(ok * SC).toFixed(1)}" height="${h}" rx="4" fill="${C.pine}"/>`); x += ok * SC + 2; }
  if (neg > 0) { const w = Math.max(neg * SC, 3); p.push(`<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${h}" rx="4" fill="${C.alert}"/>`); x += w; }
  return x;
}

/** ② ข่าวรายหมวด */
function chartCats(cats, prevLabel) {
  const max = Math.max(...cats.map(c => c.n), 1);

  let SC = 340 / max, y = 14, p = [];
  cats.forEach(c => {
    p.push(`<text x="250" y="${y + 19}" font-size="16" fill="${C.ink}" text-anchor="end">${esc(c.name)}</text>`);
    let x = hbar(p, 262, y, c.n, c.neg, SC, 26) + 8;
    p.push(`<text x="${x.toFixed(1)}" y="${y + 19}" font-size="16" font-weight="700" fill="${C.ink}">${c.n}</text>`);
    x += 18 + 9 * String(c.n).length;
    if (c.neg) { p.push(`<text x="${x.toFixed(1)}" y="${y + 19}" font-size="14" fill="${C.alertx}">(ลบ ${c.neg})</text>`); x += 30 + 9 * String(c.neg).length + 14; }
    if (c.delta) p.push(`<text x="${x.toFixed(1)}" y="${y + 19}" font-size="14" fill="${deltaColor(c.delta)}">${arrow(c.delta)}${Math.abs(c.delta)}</text>`);
    y += 44;
  });
  p.push(legend(262, y + 2, 14));
  const desk = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 ${y + 26}" font-family="${FAM}">${p.join('')}</svg>`;

  SC = 275 / max; y = 6; p = [];
  cats.forEach(c => {
    p.push(`<text x="0" y="${y + 14}" font-size="16" fill="${C.ink}">${esc(c.name)}</text>`);
    let x = hbar(p, 0, y + 22, c.n, c.neg, SC, 20) + 7;
    p.push(`<text x="${x.toFixed(1)}" y="${y + 38}" font-size="16" font-weight="700" fill="${C.ink}">${c.n}</text>`);
    x += 12 + 9 * String(c.n).length;
    if (c.neg) { p.push(`<text x="${x.toFixed(1)}" y="${y + 38}" font-size="14" fill="${C.alertx}">ลบ ${c.neg}</text>`); x += 32 + 9 * String(c.neg).length; }
    if (c.delta) p.push(`<text x="${x.toFixed(1)}" y="${y + 38}" font-size="14" fill="${deltaColor(c.delta)}">${arrow(c.delta)}${Math.abs(c.delta)}</text>`);
    y += 56;
  });
  p.push(legend(0, y + 2, 15));
  const mob = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 470 ${y + 26}" font-family="${FAM}">${p.join('')}</svg>`;
  return { desk, mob };
}

/** ③ 10 อันดับสำนักข่าว — มีสัดส่วนข่าวลบเป็น % ต่อท้าย (ตัวเลขที่ใช้เฝ้าระวังได้จริง) */
function chartOutlets(outlets) {
  const max = Math.max(...outlets.map(o => o.n), 1);
  const pct = o => Math.round(o.neg * 100 / o.n);

  let SC = 300 / max, y = 14, p = [];
  outlets.forEach(o => {
    p.push(`<text x="250" y="${y + 19}" font-size="16" fill="${C.ink}" text-anchor="end">${esc(o.src)}</text>`);
    let x = hbar(p, 262, y, o.n, o.neg, SC, 26) + 8;
    p.push(`<text x="${x.toFixed(1)}" y="${y + 19}" font-size="16" font-weight="700" fill="${C.ink}">${o.n}</text>`);
    x += 16 + 9 * String(o.n).length;
    p.push(`<text x="${x.toFixed(1)}" y="${y + 19}" font-size="14" fill="${C.alertx}">ลบ ${o.neg} (${pct(o)}%)</text>`);
    y += 44;
  });
  p.push(legend(262, y + 2, 15));
  const desk = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 ${y + 28}" font-family="${FAM}">${p.join('')}</svg>`;

  SC = 265 / max; y = 6; p = [];
  outlets.forEach(o => {
    p.push(`<text x="0" y="${y + 14}" font-size="16" fill="${C.ink}">${esc(o.src)}</text>`);
    let x = hbar(p, 0, y + 22, o.n, o.neg, SC, 20) + 7;
    p.push(`<text x="${x.toFixed(1)}" y="${y + 38}" font-size="16" font-weight="700" fill="${C.ink}">${o.n}</text>`);
    x += 12 + 9 * String(o.n).length;
    p.push(`<text x="${x.toFixed(1)}" y="${y + 38}" font-size="14" fill="${C.alertx}">ลบ ${o.neg} (${pct(o)}%)</text>`);
    y += 56;
  });
  p.push(legend(0, y + 2, 15));
  const mob = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 470 ${y + 28}" font-family="${FAM}">${p.join('')}</svg>`;
  return { desk, mob };
}


// ═════════════════════════════════════════════════════════════════
// แม่แบบหน้ารายงาน — CSS / สคริปต์ตั้งธีม / สคริปต์ท้ายหน้า
// ยกมาจากไฟล์ mockup ที่เจ้าของระบบอนุมัติแล้ว "ทั้งก้อนโดยไม่แก้"
// 🔴 ถ้าจะปรับหน้าตา ให้แก้ที่นี่ที่เดียว — แล้วสร้างใหม่ทุกฉบับด้วย --all
// ═════════════════════════════════════════════════════════════════
const TPL_STYLE = `@font-face{font-family:'TH Sarabun New';font-style:normal;font-weight:400;font-display:swap;src:url(../fonts/sarabun-400.woff) format('woff')}@font-face{font-family:'TH Sarabun New';font-style:normal;font-weight:700;font-display:swap;src:url(../fonts/sarabun-700.woff) format('woff')}@font-face{font-family:'TH Sarabun New';font-style:italic;font-weight:400;font-display:swap;src:url(../fonts/sarabun-400i.woff) format('woff')}@font-face{font-family:'TH Sarabun New';font-style:italic;font-weight:700;font-display:swap;src:url(../fonts/sarabun-700i.woff) format('woff')}:root{--ink:#122017;--ink2:#4A5751;--ink3:#67716B;--ink4:#8B958F;--pine:#1B593C;--forest:#10402E;--alert:#F05152;--alertx:#C0392B;--rust:#A03318;--amber:#8A5A00;--amber2:#5C4A12;--yellow:#FCBA54;--surf2:#F2F6F4;--surf3:#F7FAF8;--surfw:#FDF6E8;--line:#DFE6E2;--line2:#CBD5CF;--grid:#E3E8E5;--onbanner:#B9CBC0;--mockbg:#FBEDEB;--mockink:#7B2A1D;--page:#EDF1EF;--paper:#FFFFFF;--bannerbg:#122017;--banneron:#FFFFFF;--onalert:#FFFFFF}html[data-theme="dark"]{--ink:#E8EDEA;--ink2:#B6C1BB;--ink3:#9AA6A0;--ink4:#7E8A84;--pine:#3E9E6E;--forest:#5FB88A;--alert:#FF6B6C;--alertx:#FF8B84;--rust:#FF9270;--amber:#E0A93F;--amber2:#E0C070;--yellow:#FCBA54;--surf2:#1C2621;--surf3:#18211D;--surfw:#2A2416;--line:#39443E;--line2:#39443E;--grid:#2E3833;--onbanner:#B9CBC0;--mockbg:#33201C;--mockink:#F0A79A;--page:#0D120F;--paper:#131A16;--bannerbg:#0A0E0C;--banneron:#EDF2EF;--onalert:#3A0F10}





@page{size:A4;margin:13mm 13mm 15mm}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);font-family:'TH Sarabun New',sans-serif;font-weight:400;color:var(--ink);font-size:16.5pt;line-height:1.62}
.banner{background:var(--bannerbg);color:var(--banneron);border-radius:14px;padding:22px 28px 20px;margin-bottom:22px}
.banner .tag{display:inline-block;background:var(--yellow);color:var(--ink);font-size:12.5pt;font-weight:600;padding:1px 14px;border-radius:20px;margin-bottom:8px}
.banner h1{margin:0;font-size:26pt;font-weight:600;line-height:1.35}
.banner .sub{color:var(--onbanner);font-size:13.5pt;margin-top:4px}
.kpis{display:flex;gap:10px;margin:18px 0}
.kpi{flex:1;background:var(--surf2);border:1px solid var(--line);border-radius:12px;padding:12px 16px;text-align:center}
.kpi .n{font-size:24pt;font-weight:600;line-height:1.2}
.kpi .l{font-size:12.5pt;color:var(--ink2)}
.kpi.up .n{color:var(--pine)} .kpi.neg .n{color:var(--rust)}
h2{font-size:20pt;font-weight:600;margin:0 0 8px;padding-bottom:6px;border-bottom:3px solid var(--yellow)}
h3{font-size:15.5pt;font-weight:600;margin:12px 0 5px}
p{margin:8px 0}
.exec{background:var(--surf3);border-left:5px solid var(--pine);border-radius:0 12px 12px 0;padding:14px 20px;margin:14px 0}
.watchbox{background:var(--surfw);border-left:5px solid var(--yellow);border-radius:0 12px 12px 0;padding:12px 20px;margin:14px 0}
.watchbox ol{margin:6px 0 2px;padding-left:26px} .watchbox li{margin:5px 0}
.chart{margin:12px 0 4px} .chart svg{width:100%;height:auto}
.cap{font-size:13pt;color:var(--ink3);margin:2px 0 14px}
.cat{margin:0 0 18px}
.cstat{font-size:14pt;color:var(--ink2);background:var(--surf2);border-radius:8px;padding:6px 14px;margin:8px 0;display:inline-block}
.sum{margin:10px 0}
.lbl{font-weight:600;font-size:15.5pt;margin-top:10px;color:var(--pine)}
.lbl.wt{color:var(--amber)}
ul{margin:3px 0 6px;padding-left:24px} li{margin:3px 0}
ul.wl li{color:var(--amber2)}
.rf{color:var(--pine);font-size:12.5pt;font-weight:500}
.reftab{border-top:1px dashed var(--line2);margin-top:8px;padding-top:6px;column-count:1}
.rr{font-size:12pt;color:var(--ink2);line-height:1.45;margin:2px 0}
.rn{color:var(--pine);font-weight:600} .rm{color:var(--ink4)}
/* กฎการขึ้นหน้าใหม่ (เพิ่ม 13 ส.ค. 69) - ห้ามตัดกลางหัวข้อสำคัญ */h1,h2,h3{break-after:avoid;page-break-after:avoid;break-inside:avoid;page-break-inside:avoid}.lbl{break-after:avoid;page-break-after:avoid}.blk{break-inside:avoid;page-break-inside:avoid;padding-top:7px;margin-top:-7px}.ap{break-inside:avoid;page-break-inside:avoid;padding-top:6px;margin-top:-5px;display:flow-root}li{break-inside:avoid;page-break-inside:avoid;padding-top:7px;margin-top:-6px}.cathead{padding-top:7px}.cathead,.figure,.chart,.exec,.watchbox,.kpis,.kpi,table.neg,tr,li,.cstat,.mock,.banner{break-inside:avoid;page-break-inside:avoid}.apx details.apg>summary{padding-top:7px;margin-top:5px}.cap{break-before:avoid;page-break-before:avoid}.lbl+ul{break-before:avoid;page-break-before:avoid}p,li,.ap,.sum,.rr{orphans:2;widows:2}.cat{break-inside:auto}.page-break{page-break-before:always}h2.pb{break-before:page;page-break-before:always;padding-top:9px;margin-top:0}
table.neg{width:100%;border-collapse:collapse;font-size:14.5pt;margin:10px 0}
table.neg th,table.neg td{border:1px solid var(--line);padding:6px 12px;text-align:center}
table.neg th{background:var(--surf2);font-weight:600}
.two{display:flex;gap:18px} .two>div{flex:1}
.ap{font-size:11.5pt;line-height:1.42;margin:1px 0}
.mock{background:var(--mockbg);border:1.5px dashed var(--alertx);border-radius:10px;padding:8px 16px;font-size:13pt;color:var(--mockink);margin-bottom:16px}
footer{font-size:12pt;color:var(--ink4);margin-top:26px;border-top:1px solid var(--line);padding-top:8px}

@media screen{
 html{background:var(--page)}
 body{max-width:880px;margin:0 auto;padding:14px 18px 44px;background:var(--paper);font-size:19px;line-height:1.64}
 .d-mob{display:none}
 .toolbar{display:flex;gap:8px;margin:0 0 12px}
 .tb{flex:1;font-family:inherit;font-size:16px;font-weight:600;border-radius:11px;
  padding:11px 6px;cursor:pointer;border:1px solid var(--line2);
  background:var(--surf2);color:var(--ink)}
 .tb-pdf{background:var(--pine);color:var(--paper);border-color:var(--pine)}
 .tb:focus-visible{outline:3px solid var(--yellow);outline-offset:2px}
 .banner h1{font-size:27px} .banner .sub{font-size:15px} .banner .tag{font-size:14px}
 h2{font-size:23px} h3{font-size:19px} .kpi .n{font-size:29px} .kpi .l{font-size:14px}
 .cap{font-size:15px} .cstat{font-size:16px} .lbl{font-size:19px}
 .ap{font-size:15px} .mock{font-size:14px} footer{font-size:14px} table.neg{font-size:17px}
 .apx{column-count:2;column-gap:22px}
 .toc{display:none}
 details.apg>summary{cursor:pointer;font-weight:600;color:var(--pine);font-size:18px;margin:12px 0 4px;list-style:none}
 details.apg>summary::before{content:'▸ ';color:var(--ink4)}
 details.apg[open]>summary::before{content:'▾ '}
}
@media screen and (max-width:720px){
 body{padding:10px 13px 34px}
 .d-desk{display:none} .d-mob{display:block}
 .kpis{flex-wrap:wrap} .kpi{flex:1 1 44%}
 .apx{column-count:1}
 .banner{padding:16px 18px;border-radius:12px} .banner h1{font-size:23px;line-height:1.32}
 h2{font-size:21px} .cstat{font-size:15.5px;display:block} .ap{font-size:16px}
 .two{display:block}
 table.neg{font-size:16px} table.neg td,table.neg th{padding:5px 7px}
 .toc{display:block;background:var(--surf2);border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin:10px 0 16px}
 .toc .tocl{font-size:14px;color:var(--ink3);margin-bottom:6px}
 .toc a{display:inline-block;font-size:15px;color:var(--forest);background:var(--paper);border:1px solid var(--line2);
  border-radius:16px;padding:4px 11px;margin:3px 4px 3px 0;text-decoration:none}
 .exec,.watchbox{padding:12px 14px}
 details.apg[open]{margin-bottom:10px}
}
@media print{
 .d-mob,.toolbar,.toc{display:none!important}
 .d-desk{display:block!important}
 .apx{column-count:2;column-gap:22px}
 details.apg>summary{list-style:none;font-weight:600;font-size:15.5pt;margin:12px 0 5px;
  break-after:avoid;page-break-after:avoid;padding-top:7px}
 details.apg>*{display:block!important}
}
@media print{html,html[data-theme="dark"]{--ink:#122017;--ink2:#4A5751;--ink3:#67716B;--ink4:#8B958F;--pine:#1B593C;--forest:#10402E;--alert:#F05152;--alertx:#C0392B;--rust:#A03318;--amber:#8A5A00;--amber2:#5C4A12;--yellow:#FCBA54;--surf2:#F2F6F4;--surf3:#F7FAF8;--surfw:#FDF6E8;--line:#DFE6E2;--line2:#CBD5CF;--grid:#E3E8E5;--onbanner:#B9CBC0;--mockbg:#FBEDEB;--mockink:#7B2A1D;--page:#EDF1EF;--paper:#FFFFFF;--bannerbg:#122017;--banneron:#FFFFFF;--onalert:#FFFFFF}}`;
const TPL_BOOT  = `<script>
/* ⚠️ ต้องอยู่ก่อน <style> และเป็น inline — ถ้าไปตั้งธีมทีหลัง ผู้ใช้โหมดมืดจะเห็น
   "แฟลชขาว" ทุกครั้งที่เปิดหน้า เพราะเบราว์เซอร์วาดพื้นสว่างไปแล้วก่อนสคริปต์รัน
   ลำดับตัดสิน: ค่าที่ผู้ใช้เคยเลือก → ค่าของเครื่อง (OS) → สว่าง
   คีย์ dashboardTheme = คีย์เดียวกับแดชบอร์ด จึงจำค่าร่วมกันทั้งเว็บ */
(function(){var t=null;try{t=localStorage.getItem('dashboardTheme');}catch(e){t=null;}
if(t!=='dark'&&t!=='light'){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}
document.documentElement.setAttribute('data-theme',t);})();
</script>`;
const TPL_TAIL  = `<script>
/* ปุ่มสลับโหมด — เขียนค่าลงคีย์เดียวกับแดชบอร์ด ผู้อ่านจึงตั้งครั้งเดียวใช้ทั้งเว็บ */
function paintThemeBtn(){
  var dark = document.documentElement.getAttribute('data-theme') === 'dark';
  var b = document.getElementById('themeBtn');
  if (b) b.textContent = dark ? '☀️ โหมดสว่าง' : '🌙 โหมดมืด';
}
function toggleTheme(){
  var dark = document.documentElement.getAttribute('data-theme') === 'dark';
  var next = dark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('dashboardTheme', next); } catch (e) {}
  paintThemeBtn();
}
paintThemeBtn();

/* ปุ่มปิดหน้า — หน้านี้เปิดมาเป็นแท็บใหม่เสมอ window.close() จึงใช้ได้
   แต่ถ้าผู้อ่านเปิดตรงจากลิงก์ LINE เบราว์เซอร์จะไม่ยอมให้ปิด → ถอยไปหน้าแดชบอร์ดแทน
   ไม่ปล่อยให้ "กดแล้วไม่มีอะไรเกิดขึ้น" ซึ่งผู้ใช้จะนึกว่าเว็บเสีย */
function closeThisPage(){
  var before = Date.now();
  window.close();
  setTimeout(function(){
    if (Date.now() - before < 1200 && !document.hidden) {
      location.href = '../index.html#cycles';
    }
  }, 250);
}

/* กางภาคผนวกทั้งหมดก่อนพิมพ์ ไม่งั้นหมวดที่พับอยู่จะหายไปจาก PDF */
addEventListener('beforeprint', function(){
  document.querySelectorAll('details').forEach(function(d){ d.open = true; });
});
</script>`;

// ═════════════════════════════════════════════════════════════════
// ประกอบหน้ารายงาน
// ═════════════════════════════════════════════════════════════════
function renderReport(d) {
  const S = d.stats || {};
  const daily   = chartDaily(d.daily || []);
  const catsCh  = chartCats(d.cats || [], d.prevPeriodLabel || '');
  const outCh   = chartOutlets(d.outlets || []);

  const fig = (ch, cap) =>
    `<div class="figure"><div class="chart d-desk">${ch.desk}</div>` +
    `<div class="chart d-mob">${ch.mob}</div>` +
    `<div class="cap">${esc(cap)}</div></div>`;

  // ── การ์ดตัวเลขหัวรายงาน ──
  const kpi = [
    { n: S.news,   l: 'ข่าวทั้งหมด' + (S.newsDeltaPct != null ? ` (${arrow(S.newsDeltaPct)}${Math.abs(S.newsDeltaPct)}%)` : '') },
    { n: S.topics, l: 'ประเด็นข่าว' },
    { n: S.neg,    l: `ข่าวลบ (${S.negPct}%)`, cls: ' neg' },
    { n: `${arrow(S.negPctDelta)}${Math.abs(S.negPctDelta)}`, l: 'จุด — สัดส่วนข่าวลบ' + (S.negPctDelta < 0 ? 'ลดลง' : 'เพิ่มขึ้น'), cls: S.negPctDelta < 0 ? ' up' : ' neg' }
  ].map(k => `<div class="kpi${k.cls || ''}"><div class="n">${esc(k.n)}</div><div class="l">${esc(k.l)}</div></div>`).join('');

  // ── บล็อกสถิติ 2 คอลัมน์ ──
  const impact = (d.impact || []).map(i =>
    `<tr><td>${esc(({ 'สูง': '🔴', 'กลาง': '🟠', 'ต่ำ': '🟡' })[i.level] || '•')} ${esc(i.level)}</td>` +
    `<td>${esc(i.n)}</td><td>${esc(i.cat)}</td></tr>`).join('');
  const provs = (d.provinces || []).map((p2, i) =>
    `${i + 1}. ${esc(p2.name)} — ${esc(p2.n)}${i === 0 ? ' ข่าว' : ''}`);
  const provHtml = [provs.slice(0, 2), provs.slice(2)].filter(a => a.length)
    .map(a => `<div class="ap">${a.join(' &nbsp; ')}</div>`).join('');
  const hot = (d.hotTopics || []).map((t, i) =>
    `<div class="ap">${i + 1}. ${esc(t.name)} — ${esc(t.meta)}</div>`).join('');

  // ── บทวิเคราะห์รายหมวด ──
  const A = d.analysis || [];
  const toc = A.length
    ? `<nav class="toc"><div class="tocl">ไปที่หมวด</div>` +
      A.map((a, i) => `<a href="#cat${i}">${esc(a.cat)}</a>`).join('') + `</nav>`
    : '';

  const listBlock = (label, arr, cls) => (!arr || !arr.length) ? '' :
    `<div class="blk"><div class="lbl${cls || ''}">${esc(label)}</div><ul${cls ? ' class="wl"' : ''}>` +
    arr.map(x => `<li>${esc(x)}</li>`).join('') + `</ul></div>`;

  const sections = A.map((a, i) => {
    const stat = [
      `${a.topics} ประเด็น`,
      `${a.news} ข่าว` + (a.delta ? ` (${arrow(a.delta)}${Math.abs(a.delta)} จากสัปดาห์ก่อน)` : ''),
      a.neg ? `ข่าวลบ ${a.neg} ข่าว` : 'ไม่มีข่าวลบ'
    ].join(' · ') + (a.note ? ` — ${a.note}` : '');
    return `<section class="cat"><div class="cathead" id="cat${i}">` +
      `<h2>${esc(a.emoji)} ${esc(a.cat)}</h2>` +
      `<div class="cstat">${esc(stat)}</div>` +
      `<p class="sum">${esc(a.summary)}</p></div>` +
      listBlock('ประเด็นเด่น', a.highlights) +
      listBlock('ประเด็นต่อเนื่อง', a.continuing) +
      listBlock('⚠️ สัญญาณควรจับตา', a.watch, ' wt') +
      `</section>`;
  }).join('');

  // ── ภาคผนวก (พับเก็บบนจอ · กางเองตอนพิมพ์) ──
  const totalTopics = (d.appendix || []).reduce((s, g) => s + g.items.length, 0);
  const appendix = (d.appendix || []).map(g =>
    `<details class="apg"><summary>${esc(g.emoji)} ${esc(g.cat)} (${g.items.length})</summary>` +
    g.items.map(it => `<div class="ap">• ${esc(it.name)} <span class="rm">${esc(it.meta)}</span></div>`).join('') +
    `</details>`).join('');

  const mock = d.isMockup
    ? `<div class="mock">🧪 <b>MOCKUP</b> — ${esc(d.mockNote || '')}</div>` : '';

  return `<!doctype html><html lang="th"><head><meta charset="utf-8">` +
    `<title>${esc(d.title)} · ${esc(d.cardPeriod || d.periodLabel)}</title>` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    TPL_BOOT + `<style>${TPL_STYLE}</style></head><body>

<div class="toolbar"><button type="button" class="tb tb-close" onclick="closeThisPage()">✕ ปิดหน้านี้</button><button type="button" class="tb tb-theme" id="themeBtn" onclick="toggleTheme()"></button><button type="button" class="tb tb-pdf" onclick="window.print()">🖨️ บันทึกเป็น PDF</button></div>${mock}

<div class="banner"><span class="tag">${esc(cycleLabel(d.type))} · ฉบับที่ ${esc(d.no)}</span>
<h1>${esc(d.title)}</h1>
<div class="sub">${esc(d.periodLabel)} · จัดทำโดยระบบติดตามข่าวอัตโนมัติ</div></div>

<div class="kpis">${kpi}</div>

<h2>บทสรุปผู้บังคับบัญชา</h2>
<div class="exec"><p>${esc(d.exec)}</p></div>
<div class="watchbox"><div class="lbl wt">ประเด็นเฝ้าระวัง${d.type === 'monthly' ? 'เดือนหน้า' : 'สัปดาห์หน้า'}</div>
<ol>${(d.nextWatch || []).map(x => `<li>${esc(x)}</li>`).join('')}</ol></div>

${fig(daily, `ภาพที่ 1 — จำนวนข่าวรายวัน แยกข่าวปกติ/ข่าวลบ${d.peakNote ? ` (${d.peakNote})` : ''}`)}

<h2 class="pb">สถิติ${d.type === 'monthly' ? 'ประจำเดือน' : 'สัปดาห์'}</h2>
${fig(catsCh, `ภาพที่ 2 — จำนวนข่าวรายหมวด แยกข่าวปกติ/ข่าวลบ · ▲▼ = เทียบ${d.type === 'monthly' ? 'เดือน' : 'สัปดาห์'}ก่อน (${d.prevPeriodLabel || ''})`)}

<div class="two"><div>
<h3>ข่าวลบแยกระดับผลกระทบ</h3>
<table class="neg"><tr><th>ระดับ</th><th>จำนวน</th><th>หมวดหลัก</th></tr>${impact}</table>
<h3>พื้นที่ข่าวเด่น</h3>
${provHtml}
</div>
<div>
<h3>ประเด็นที่สื่อเล่นแรงที่สุด</h3>
${hot}
</div></div>

<div style="page-break-inside:avoid"><h3>10 อันดับสำนักข่าวของ${d.type === 'monthly' ? 'เดือน' : 'สัปดาห์'}</h3>
<div class="chart d-desk">${outCh.desk}</div><div class="chart d-mob">${outCh.mob}</div>
<div class="cap">ภาพที่ 3 — 10 อันดับสำนักข่าวตามจำนวนข่าวที่นำเสนอ แยกข่าวปกติ/ข่าวลบ · ตัวเลขในวงเล็บ = สัดส่วนข่าวลบของสำนักนั้น</div></div>

<h2 class="pb">บทวิเคราะห์รายหมวด</h2>${toc}
${sections}

<h2 class="pb">ภาคผนวก — ประเด็นข่าวทั้ง${d.type === 'monthly' ? 'เดือน' : 'สัปดาห์'} (${totalTopics} ประเด็น)</h2>
<div class="apx">${appendix}</div>

<footer>${esc(d.footNote || '')}</footer>
${TPL_TAIL}</body></html>`;
}

function cycleLabel(t) {
  return t === 'monthly' ? 'รายงานประจำเดือน' : 'รายงานประจำสัปดาห์';
}

// ═════════════════════════════════════════════════════════════════
// อ่านข้อมูลเข้า — 2 ทาง (ไฟล์สำหรับทดสอบ · ชีตสำหรับของจริง)
// ═════════════════════════════════════════════════════════════════

/**
 * ⚠️ ด่านกันข้อมูลพัง (ยืมบทเรียน S15 จาก fetch-and-build.js)
 * ถ้าลิงก์ Publish ถูกยกเลิก Google จะคืนหน้า HTML พร้อมสถานะ 200
 * ถ้าไม่ตรวจ เราจะ parse ได้ 0 แถว แล้วเขียนดัชนีว่างทับของดี = รายงานหายทั้งหมด
 */
function assertLooksLikeCsv(text) {
  const head = text.slice(0, 400).toLowerCase();
  if (head.includes('<!doctype html') || head.includes('<html')) {
    throw new Error('ต้นทางคืนหน้า HTML ไม่ใช่ CSV — ลิงก์ Publish to web ถูกยกเลิก หรือชีตถูกตั้งเป็นส่วนตัว');
  }
  if (!text.trim()) throw new Error('ต้นทางคืนข้อมูลว่าง');
}

async function readFromSheet(url) {
  const { parse } = require('csv-parse/sync');
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error('ดึงชีตไม่สำเร็จ: HTTP ' + res.status);
  const text = await res.text();
  assertLooksLikeCsv(text);

  const rows = parse(text, { skip_empty_lines: true, relax_column_count: true });
  const out = [], skipped = [];
  rows.slice(1).forEach((r, i) => {          // แถวแรกเป็นหัวตาราง
    const status = String(r[5] || '').trim();
    if (status !== READY) return;            // ยังเป็นร่าง = ยังไม่เอา
    try {
      const payload = JSON.parse(r[6]);
      payload.id = payload.id || String(r[0] || '').trim();
      payload.type = payload.type || String(r[1] || '').trim();
      payload.from = payload.from || String(r[2] || '').trim();
      payload.to = payload.to || String(r[3] || '').trim();
      payload.publishedAt = payload.publishedAt || String(r[4] || '').trim();
      out.push(payload);
    } catch (e) {
      // ⚠️ แถวเดียวพัง ไม่ควรทำให้ทั้งรอบล้ม (บทเรียน S16) — แต่ต้อง "ดังพอให้เห็น"
      skipped.push(`แถว ${i + 2} (id=${r[0] || '?'}): ${e.message}`);
    }
  });
  if (skipped.length) {
    console.error('⚠️ ข้ามแถวที่อ่าน JSON ไม่ได้ ' + skipped.length + ' แถว:');
    skipped.forEach(s => console.error('   · ' + s));
  }
  // ทุกแถวพังหมด = ต้นทางเปลี่ยนรูปแบบ ไม่ใช่แค่แถวเดียวเสีย → หยุด อย่าเขียนทับ
  if (!out.length && skipped.length) throw new Error('อ่าน JSON ไม่ได้เลยสักแถว — รูปแบบข้อมูลต้นทางน่าจะเปลี่ยน');
  return out;
}

function readFromFile(p) {
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  return Array.isArray(raw) ? raw : [raw];
}

// ═════════════════════════════════════════════════════════════════
// เขียนไฟล์ — เขียนเฉพาะเมื่อเนื้อหาต่างจริง (ยืมวิธี S19)
// เหตุผล: ถ้าเขียนทุกรอบ ไฟล์จะต่างทุกรอบ → GitHub commit ทุกรอบ
//         ประวัติ repo จะเต็มไปด้วย commit ที่ไม่มีอะไรเปลี่ยน
// ═════════════════════════════════════════════════════════════════
function writeIfChanged(file, content) {
  try {
    if (fs.readFileSync(file, 'utf8') === content) return false;
  } catch (e) { /* ยังไม่มีไฟล์ = ต้องเขียน */ }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

/** ดัชนี 1 รายการ — เก็บเฉพาะที่การ์ดบนแดชบอร์ดต้องใช้ ไม่เอาเนื้อรายงานมาด้วย */
function indexEntry(d) {
  const S = d.stats || {};
  return {
    type: d.type, id: d.id, no: d.no,
    title: d.title,
    periodLabel: d.cardPeriod || d.periodLabel,
    from: d.from, to: d.to,
    url: 'reports/' + d.id + '.html',
    stats: {
      news: S.news, topics: S.topics, neg: S.neg, negPct: S.negPct,
      newsDelta: S.newsDelta, negPctDelta: S.negPctDelta
    },
    topCat: d.topCat,
    highlights: (d.cardHighlights || []).slice(0, 3),
    isMockup: !!d.isMockup,
    publishedAt: d.publishedAt
  };
}

// ═════════════════════════════════════════════════════════════════
// main
// ═════════════════════════════════════════════════════════════════
async function main() {
  const argv = process.argv.slice(2);
  const inputAt = argv.indexOf('--input');
  const inputFile = inputAt > -1 ? argv[inputAt + 1] : '';

  let payloads;
  if (inputFile) {
    console.log('📄 อ่านจากไฟล์: ' + inputFile);
    payloads = readFromFile(inputFile);
  } else if (CSV_URL) {
    console.log('🌐 อ่านจากชีต (CYCLE_CSV_URL)');
    payloads = await readFromSheet(CSV_URL);
  } else {
    throw new Error('ไม่รู้จะอ่านข้อมูลจากไหน — ใส่ --input <ไฟล์> หรือตั้ง env CYCLE_CSV_URL');
  }
  if (!payloads.length) {
    console.log('⏸️ ไม่มีรายงานที่สถานะ "' + READY + '" — ไม่มีอะไรต้องทำ');
    return;
  }

  // ── สร้างหน้ารายงานทีละฉบับ ──
  let wrote = 0;
  const entries = [];
  for (const d of payloads) {
    const id = safeId(d.id);
    if (!id) { console.error('❌ ข้าม: id ไม่ถูกต้อง (' + d.id + ') — ยอมเฉพาะ A-Z a-z 0-9 _ - ยาว 3-40'); continue; }
    d.id = id;
    const html = renderReport(d);
    const file = path.join(OUT_DIR, id + '.html');
    if (writeIfChanged(file, html)) { wrote++; console.log('✅ สร้าง reports/' + id + '.html (' + Math.round(html.length / 1024) + ' KB)'); }
    else console.log('⏸️ reports/' + id + '.html เหมือนเดิม ไม่เขียนทับ');
    entries.push(indexEntry(d));
  }
  if (!entries.length) throw new Error('ไม่มีรายงานที่สร้างได้เลย — ไม่แตะดัชนี');

  // ── รวมกับดัชนีเดิม: ฉบับเก่าที่ไม่ได้อยู่ในรอบนี้ต้องไม่หาย (กฎห้ามลบอดีต) ──
  let old = [];
  try { old = (JSON.parse(fs.readFileSync(INDEX_OUT, 'utf8')).reports) || []; } catch (e) { old = []; }
  const byId = new Map();
  old.forEach(r => byId.set(r.id, r));
  entries.forEach(r => byId.set(r.id, r));     // รอบนี้ทับของเดิมที่ id เดียวกัน
  const merged = Array.from(byId.values())
    .sort((a, b) => String(b.to).localeCompare(String(a.to)));

  // 🔴 ด่านกันดัชนีหด — ดัชนีที่สั้นลงแปลว่าอ่านต้นทางได้ไม่ครบ ไม่ใช่รายงานหายจริง
  if (merged.length < old.length && !ALLOW_SHRINK) {
    throw new Error(`ดัชนีจะหดจาก ${old.length} เหลือ ${merged.length} รายการ — หยุดไว้ก่อน ` +
                    `(ถ้าตั้งใจจริง สั่ง Run workflow แล้วติ๊ก allow_shrink)`);
  }

  const index = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    reports: merged
  };
  // ⚠️ เทียบ "เฉพาะรายการ" ไม่รวม generatedAt — ไม่งั้นไฟล์ต่างทุกรอบและ commit ทุกรอบ
  let same = false;
  try {
    same = JSON.stringify(JSON.parse(fs.readFileSync(INDEX_OUT, 'utf8')).reports) === JSON.stringify(merged);
  } catch (e) { same = false; }
  if (same) console.log('⏸️ ดัชนีเหมือนเดิม ไม่เขียนทับ');
  else { fs.mkdirSync(path.dirname(INDEX_OUT), { recursive: true }); fs.writeFileSync(INDEX_OUT, JSON.stringify(index, null, 1)); console.log('✅ อัปเดต data/reports.json (' + merged.length + ' ฉบับ)'); }

  console.log(`\n📊 สรุป: สร้างหน้ารายงาน ${wrote}/${payloads.length} ฉบับ · ดัชนีรวม ${merged.length} ฉบับ`);
}

main().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
