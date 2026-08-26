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

// ═════════════════════════════════════════════════════════════════
// 🔗 การ์ดตัวอย่างลิงก์ (Open Graph) — เพิ่ม 14 ส.ค. 69
//
// ทำไมต้องมี: ข้อความเช้าใน LINE มี URL ยาว ๆ ตัวเดียวโดด ๆ ดูไม่น่ากด
//   ถ้าหน้ามีแท็ก og: LINE จะดึงไปแสดงเป็น "การ์ด" ใต้ข้อความ พร้อมชื่อและคำโปรย
//   ⇒ ได้หน้าตาดีขึ้นมากโดยไม่ต้องแก้ข้อความเลยสักตัวอักษร
//
// ⚠️ ไม่การันตี 100% — LINE ต้องเข้ามาดึงหน้าให้ทัน และบางเครื่องปิดตัวอย่างลิงก์ไว้
// 🔴 SITE_BASE ต้องเป็น URL เต็ม — og: ใช้ path สัมพัทธ์ไม่ได้ ตัวดึงข้อมูลอยู่คนละที่กับหน้า
// 🔴 OG_IMAGE ว่าง = ไม่ใส่แท็กรูป (การ์ดจะขึ้นแต่ชื่อกับคำโปรย ซึ่งยังดีกว่า URL เปล่า)
//    ห้ามชี้ไปไฟล์ที่ไม่มีจริง — LINE จะขึ้นการ์ดที่มีกรอบรูปว่าง ดูแย่กว่าไม่ใส่
// ═════════════════════════════════════════════════════════════════
const SITE_BASE = 'https://mewricha.github.io/News-Monitor-dashboard/';
const OG_IMAGE  = 'assets/og-cover.png';   // 🔴 ต้องมีไฟล์นี้อยู่จริงใน repo ไม่งั้น LINE จะขึ้นการ์ดกรอบรูปว่าง
const OG_W      = 1200, OG_H = 630;

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


/**
 * แท็ก Open Graph + Twitter — ใช้ร่วมกันทั้งรายวันและรายสัปดาห์
 *
 * คำโปรยต้องเป็น "ตัวเลขที่ตัดสินใจได้" ไม่ใช่คำโฆษณา
 * คนอ่านการ์ดใน LINE ควรรู้ตั้งแต่ยังไม่กดว่าเช้านี้ต้องเปิดอ่านไหม
 */
function ogTags(d) {
  const S = d.stats || {};
  const isDaily = d.type === 'daily';
  const title = cycleLabel(d.type) + ' · ' + (d.cardPeriod || d.periodLabel || '');

  const bits = [];
  if (S.news != null) bits.push('ข่าว ' + S.news);
  if (S.topics != null) bits.push('ประเด็น ' + S.topics);
  if (S.neg != null) bits.push('ข่าวลบ ' + S.neg + (S.negPct != null ? ' (' + S.negPct + '%)' : ''));
  if (isDaily && S.watchCount != null) {
    bits.push(S.watchCount ? 'ต้องเฝ้าติดตาม ' + S.watchCount + ' ประเด็น' : 'ไม่มีประเด็นต้องเฝ้าติดตาม');
  }
  const desc = (d.isMockup ? '[ฉบับตัวอย่าง] ' : '') + bits.join(' · ');

  const url = SITE_BASE + 'reports/' + d.id + '.html';
  let t =
    `<meta property="og:type" content="article">` +
    `<meta property="og:site_name" content="ระบบติดตามข่าวสารกองทัพบก">` +
    `<meta property="og:locale" content="th_TH">` +
    `<meta property="og:title" content="${esc(title)}">` +
    `<meta property="og:description" content="${esc(desc)}">` +
    `<meta property="og:url" content="${esc(url)}">` +
    `<meta name="description" content="${esc(desc)}">`;
  if (OG_IMAGE) {
    t += `<meta property="og:image" content="${esc(SITE_BASE + OG_IMAGE)}">` +
         `<meta property="og:image:width" content="${OG_W}">` +
         `<meta property="og:image:height" content="${OG_H}">` +
         `<meta name="twitter:card" content="summary_large_image">`;
  } else {
    // ไม่มีรูป = การ์ดแบบย่อ ยังขึ้นชื่อกับคำโปรย ดีกว่าปล่อยเป็น URL เปล่า
    t += `<meta name="twitter:card" content="summary">`;
  }
  return t;
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


/**
 * ④ แนวโน้มปริมาณข่าวย้อนหลัง 14 วัน (ใช้เฉพาะรายงานประจำวัน)
 *
 * ทำไมไม่ใช้ chartDaily ตัวเดิม: ตัวนั้นออกแบบสำหรับ 7 แท่ง (แท่งกว้าง 72px)
 * ใส่ 14 แท่งแล้วแท่งจะซ้อนทับกัน — ตัวนี้จึงคุมความกว้างตามจำนวนวันจริง
 *
 * หลักการอ่าน: เส้นประ = ค่าเฉลี่ยของช่วง · แท่งขวาสุด = เมื่อวาน (วันที่รายงานนี้พูดถึง)
 * ป้ายตัวเลขติดเฉพาะ "วันที่มากที่สุด" กับ "เมื่อวาน" เท่านั้น — ติดทุกแท่งจะอ่านไม่ออก
 */
function chartTrend(trend) {
  const T = (trend || []).slice(-14);
  if (!T.length) return { desk: '', mob: '' };
  const max = Math.max(...T.map(d => d.total), 1);
  const avg = T.reduce((a, b) => a + b.total, 0) / T.length;
  const maxIdx = T.reduce((bi, d, i) => (d.total > T[bi].total ? i : bi), 0);
  const lastIdx = T.length - 1;

  function draw(W, H, base, top, x0, x1, bw, fsLab, fsVal, showDow) {
    const SC = (base - top) / max, p = [];
    for (let g = 0; g <= 4; g++) {
      const yy = base - (max / 4 * g) * SC;
      p.push(`<line x1="${x0 - 8}" y1="${yy.toFixed(1)}" x2="${x1}" y2="${yy.toFixed(1)}" stroke="${C.grid}" stroke-width="1"/>`);
      p.push(`<text x="${x0 - 12}" y="${(yy + 4).toFixed(1)}" font-size="${fsLab}" fill="${C.ink4}" text-anchor="end">${Math.round(max / 4 * g)}</text>`);
    }
    const step = (x1 - x0) / T.length;
    T.forEach((d, i) => {
      const x = x0 + i * step + (step - bw) / 2, ok = d.total - d.neg;
      const yo = base - ok * SC, yn = yo - d.neg * SC;
      const dim = i === lastIdx ? 1 : 0.82;                 // แท่งเมื่อวานเข้มกว่าเพื่อนเล็กน้อย
      if (ok > 0) p.push(`<rect x="${x.toFixed(1)}" y="${yo.toFixed(1)}" width="${bw}" height="${(ok * SC).toFixed(1)}" rx="3" fill="${C.pine}" opacity="${dim}"/>`);
      // 🔴 เว้นช่อง 2px ระหว่างสีเขียวกับสีแดง ไม่งั้น 2 สีติดกันจะอ่านเป็นแท่งเดียว
      if (d.neg > 0) p.push(`<rect x="${x.toFixed(1)}" y="${(yn - 2).toFixed(1)}" width="${bw}" height="${Math.max(d.neg * SC, 3).toFixed(1)}" rx="3" fill="${C.alert}" opacity="${dim}"/>`);
      if (i === maxIdx || i === lastIdx) {
        p.push(`<text x="${(x + bw / 2).toFixed(1)}" y="${(Math.min(yn, yo) - 9).toFixed(1)}" font-size="${fsVal}" font-weight="700" fill="${C.ink}" text-anchor="middle">${d.total}</text>`);
      }
      const parts = String(d.label).split(' ');
      if (showDow) {
        p.push(`<text x="${(x + bw / 2).toFixed(1)}" y="${base + 18}" font-size="${fsLab}" fill="${C.ink2}" text-anchor="middle">${esc(parts[0] || '')}</text>`);
        p.push(`<text x="${(x + bw / 2).toFixed(1)}" y="${base + 33}" font-size="${fsLab - 1.5}" fill="${C.ink4}" text-anchor="middle">${esc(parts[1] || '')}</text>`);
      } else if (i % 2 === lastIdx % 2) {
        p.push(`<text x="${(x + bw / 2).toFixed(1)}" y="${base + 18}" font-size="${fsLab}" fill="${C.ink4}" text-anchor="middle">${esc(parts[1] || '')}</text>`);
      }
    });
    const ya = base - avg * SC;
    p.push(`<line x1="${x0 - 8}" y1="${ya.toFixed(1)}" x2="${x1}" y2="${ya.toFixed(1)}" stroke="${C.ink3}" stroke-width="2" stroke-dasharray="7 5"/>`);
    // 🔴 ป้าย "เฉลี่ย" ต้องอยู่ในแถบคำอธิบายด้านล่าง ห้ามวางลอยบนเส้น
    //    บทเรียน 14 ส.ค. 69: วางไว้ปลายเส้นแล้วมันทับเลขของแท่งขวาสุดพอดี (ค่าเฉลี่ยกับเมื่อวานมักใกล้กัน)
    // จอกว้างวางต่อท้ายแถวเดียวกันได้ · มือถือแคบเกิน ต้องขึ้นบรรทัดใหม่ ไม่งั้นข้อความล้นขอบ
    const wide = W > 500;
    const ly = wide ? H - 20 : H - 38;
    p.push(legend(x0 - 8, ly, fsLab));
    const lx = wide ? x0 - 8 + 236 : x0 - 8;
    const ly2 = wide ? ly + 7 : ly + 25;
    p.push(`<line x1="${lx}" y1="${ly2}" x2="${lx + 26}" y2="${ly2}" stroke="${C.ink3}" stroke-width="2" stroke-dasharray="7 5"/>`);
    p.push(`<text x="${lx + 32}" y="${ly2 + 5}" font-size="${fsLab}" fill="${C.ink2}">เฉลี่ย ${Math.round(avg)} ข่าว/วัน</text>`);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="${FAM}">${p.join('')}</svg>`;
  }

  return {
    desk: draw(760, 320, 246, 40, 44, 744, 34, 14, 16, true),
    mob:  draw(400, 318, 232, 34, 30, 392, 18, 12.5, 14, false)
  };
}

/**
 * ⑤ ⏱️ แถบเวลาของประเด็นเฝ้าระวัง — ประเด็นนี้ "มีข่าวมาแล้วกี่วัน"
 * เล็ก ๆ แต่เป็นสิ่งที่รายงานตัวอื่นในระบบไม่เคยบอก: เรื่องนี้ใหม่หรือลากมานาน
 */
function ageBar(age, maxAge) {
  const n = Math.max(1, Math.min(age, 10)), m = Math.max(maxAge, n, 3);
  const W = 120, cell = W / m, p = [];
  for (let i = 0; i < m; i++) {
    p.push(`<rect x="${(i * cell).toFixed(1)}" y="0" width="${(cell - 2).toFixed(1)}" height="10" rx="2" ` +
           `fill="${i < n ? C.pine : C.grid}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 10" width="${W}" height="10" ` +
         `role="img" aria-label="มีข่าวมาแล้ว ${n} วัน">${p.join('')}</svg>`;
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
/* ═══ สไตล์เฉพาะรายงานประจำวัน (รุ่น -64) — ต่อท้าย ไม่แตะของรายสัปดาห์ ═══ */
const TPL_STYLE_DAILY = `.wcard{background:var(--surf3);border:1px solid var(--line);border-left:5px solid var(--amber);border-radius:0 12px 12px 0;padding:12px 18px;margin:12px 0;break-inside:avoid;page-break-inside:avoid}
.wcard.hot{border-left-color:var(--alert);background:var(--mockbg)}
.wtop{display:flex;align-items:baseline;gap:10px}
.wrank{flex:none;background:var(--pine);color:var(--paper);font-size:12.5pt;font-weight:700;border-radius:50%;width:26px;height:26px;line-height:26px;text-align:center}
.wcard.hot .wrank{background:var(--alertx)}
.wname{font-size:16.5pt;font-weight:600;line-height:1.4;margin:0}
.wtags{margin:6px 0 2px}
.wtag{display:inline-block;font-size:12pt;color:var(--ink2);background:var(--surf2);border:1px solid var(--line);border-radius:14px;padding:1px 11px;margin:3px 5px 0 0}
.wtag.a{color:var(--alertx);border-color:var(--alert)}
.wwhy{font-size:14.5pt;color:var(--ink);margin:7px 0 4px}
.wmeta{display:flex;align-items:center;gap:9px;font-size:12pt;color:var(--ink3);margin-top:6px}
.wmore{font-size:13pt;color:var(--ink2);margin:3px 0}
.attn{background:var(--surf2);border:1px solid var(--line);border-radius:12px;padding:10px 18px;margin:12px 0}
.attn .ai{font-size:14.5pt;margin:5px 0}
.attn .an{color:var(--ink4);font-weight:700;margin-right:6px}
.quiet{background:var(--surfw);border:1.5px dashed var(--amber);border-radius:12px;padding:10px 18px;font-size:14pt;color:var(--amber2);margin:12px 0}
.autoflag{font-size:12pt;color:var(--ink3);margin-top:6px}
.cmpn{font-size:13.5pt;color:var(--ink3);margin:-6px 0 12px}
a.src{color:var(--forest);text-decoration:none;border-bottom:1px dotted var(--line2)}
@media screen{.wname{font-size:19px}.wwhy{font-size:17px}.wtag{font-size:14px}.attn .ai{font-size:17px}.quiet{font-size:16px}.wmeta,.autoflag{font-size:14px}.cmpn{font-size:15px}.wmore{font-size:15px}}
@media print{.wcard{background:var(--surf3)!important}}`;

// ═════════════════════════════════════════════════════════════════
// 📆 สไตล์เฉพาะหน้ารายงานประจำเดือน (S24 · 26 ส.ค. 69)
//
// 🔴 สีหมวด 5 สี — ความหมายผูกตายตัว ห้ามสลับ:
//    เหลือง/amber สงวนให้ "ไทย-กัมพูชา" (กติกาสีของทั้งเว็บ) · เขียว = จชต.
//    ม่วง = ยาเสพติด · ฟ้า = ช่วยเหลือ ปชช. · เทา = หมวดอื่น
//    ทุกจุดที่ใช้สี มีชื่อหมวดเป็นข้อความกำกับเสมอ — สีเป็นแค่ตัวช่วย (กัน CVD)
// ═════════════════════════════════════════════════════════════════
const TPL_STYLE_MONTHLY = `:root{--mcJct:#1B593C;--mcCam:#8A5A00;--mcDrug:#5B4B8A;--mcHelp:#20617E;--mcBdr:#8C3B1E;--mcEtc:#67716B}
html[data-theme="dark"]{--mcJct:#5FB88A;--mcCam:#E0A93F;--mcDrug:#B9A9E8;--mcHelp:#7FC4E0;--mcBdr:#E8926B;--mcEtc:#9AA6A0}
.mchip{display:inline-block;font-size:12pt;font-weight:700;border:1.5px solid;border-radius:14px;padding:0 10px;white-space:nowrap}
.exb{margin:0;padding-left:22px}.exb li{font-size:15pt;margin-bottom:6px}
.ainote{background:var(--surfw);border:1.5px dashed var(--amber);border-radius:12px;padding:8px 16px;font-size:12.5pt;color:var(--amber2);margin:10px 0}
.mst{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}
.mst .c{background:var(--surf2);border:1px solid var(--line);border-radius:10px;padding:8px 14px}
.mst .l{font-size:12pt;color:var(--ink3)}.mst .v{font-size:20pt;font-weight:700}.mst .v.neg{color:var(--alertx)}
.mst .d{font-size:12pt;color:var(--ink3)}.mst .d b{color:var(--ink2)}
.vtl{position:relative;margin:6px 0;padding:0;list-style:none}
.vtl::before{content:'';position:absolute;left:8px;top:12px;bottom:12px;width:2px;background:var(--line2)}
.vday{position:relative;padding:0 0 8px 32px;break-inside:avoid;page-break-inside:avoid}
.vdot{position:absolute;left:1px;margin-top:4px;width:15px;height:15px;border-radius:50%;border:2px solid var(--paper);background:var(--line2);box-shadow:0 0 0 1.5px var(--ink4)}
.vdate{font-weight:700;font-size:15pt}.vdow{font-weight:400;color:var(--ink3);font-size:12.5pt}.vmeta{font-size:12.5pt;color:var(--ink3);margin-left:8px}
.mev{display:flex;gap:9px;align-items:baseline;padding:2px 0 2px 9px;margin-left:-12px;border-left:3.5px solid transparent;font-size:14pt}
.mev .t{flex:1;line-height:1.45}.mev .n{font-size:12pt;color:var(--ink3);white-space:nowrap}.mev .n b{color:var(--alertx)}
.mgap{padding:2px 0 10px 32px;font-size:12.5pt;color:var(--ink4)}
.man{border-left:4px solid var(--line2);padding:2px 0 4px 14px;margin:12px 0 20px;break-inside:avoid;page-break-inside:avoid}
.man .h{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.man h3{margin:0}
.man .nums{font-size:12.5pt;color:var(--ink3)}
.man p{font-size:14pt;margin:7px 0}.man p b.who{color:var(--ink)}
.mkm{background:var(--surf2);border-radius:10px;padding:8px 14px;margin-top:8px;font-size:14pt}
.manfail{background:var(--mockbg);color:var(--mockink);border-radius:10px;padding:10px 16px;font-size:13.5pt}
table.mtb{border-collapse:collapse;width:100%;font-size:13.5pt}
table.mtb th{text-align:left;color:var(--ink3);font-weight:700;padding:5px 8px;border-bottom:1.5px solid var(--line2);font-size:12.5pt}
table.mtb td{padding:5px 8px;border-bottom:1px solid var(--line);vertical-align:top}
table.mtb td.num,table.mtb th.num{text-align:right;white-space:nowrap}
.mbar{height:6px;border-radius:99px;background:var(--surf2);overflow:hidden;min-width:60px}
.mbar i{display:block;height:100%;background:var(--alert);border-radius:99px}
.mtag{font-size:11.5pt;color:var(--ink3)}
.mchart{overflow-x:auto}.mchart svg{width:100%;min-width:620px;height:auto}
.hm{min-width:680px;border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:var(--surf3)}
.hmrow{display:flex;align-items:center;gap:8px;padding:1.5px 0}
.hmlab{flex:0 0 172px;font-size:12pt;color:var(--ink2);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hmdot{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:6px;vertical-align:baseline}
.hmcells{display:flex;gap:2px;flex:1}
.hmc{flex:1;aspect-ratio:1/1.15;max-height:24px;min-height:17px;background:var(--surf2);border-radius:3px;position:relative;overflow:hidden}
.hmc.na{background:transparent;border:1px dashed var(--line)}
.hmc i{position:absolute;inset:0;border-radius:3px}
.hmc u{position:absolute;left:15%;right:15%;bottom:1.5px;height:2.5px;border-radius:2px;background:var(--alert)}
.hmd{flex:1;text-align:center;font-size:10.5pt;color:var(--ink4)}
.hmhead{padding-bottom:2px}
.hmsum{flex:0 0 118px;font-size:11.5pt;color:var(--ink3);text-align:right;white-space:nowrap}
.hmsum b{color:var(--alertx)}
@media screen{.hmlab{font-size:14px}.hmsum{font-size:13px}.hmd{font-size:11px}}
@media screen{.exb li{font-size:17px}.mev{font-size:16px}.vdate{font-size:17px}.man p,.mkm{font-size:16px}table.mtb{font-size:15px}.mchip{font-size:13px}}
@media print{.vtl::before{background:#999}}`;

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
/**
 * ☀️ หน้ารายงานประจำวัน — โครงคนละแบบกับรายสัปดาห์โดยตั้งใจ
 *
 * รายสัปดาห์ตอบว่า "สัปดาห์ที่ผ่านมาภาพรวมเป็นอย่างไร" → เดินตามหมวด
 * รายวันตอบว่า "เมื่อวานปิดยังไง วันนี้ต้องเฝ้าอะไร" → เดินตามประเด็นที่ยังไม่จบ
 *
 * 🔴 ห้ามทำให้กลายเป็นรายการข่าว — รายการข่าวมีรายงาน 3 รอบ/วันอยู่แล้ว
 *    ถ้าหน้านี้กลายเป็นรายการ ผู้อ่านจะเลิกอ่านเพราะเห็นของซ้ำ
 */
function renderDaily(d) {
  const S = d.stats || {};
  const W = d.watch || [];
  const trend = chartTrend(d.trend || []);
  const catsCh = chartCats((d.cats || []).map(c => ({ name: c.name, n: c.n, neg: c.neg, delta: 0 })), '');

  const fig = (ch, cap) => (!ch || !ch.desk) ? '' :
    `<div class="figure"><div class="chart d-desk">${ch.desk}</div>` +
    `<div class="chart d-mob">${ch.mob}</div>` +
    `<div class="cap">${esc(cap)}</div></div>`;

  const dPct = S.newsDeltaPct || 0;
  const kpi = [
    { n: S.news, l: 'ข่าวเมื่อวาน' + (S.avgNews != null ? ` (${arrow(dPct)}${Math.abs(dPct)}% จากค่าเฉลี่ย)` : '') },
    { n: S.topics, l: 'ประเด็นข่าว' },
    { n: S.neg, l: `ข่าวลบ (${S.negPct}%)`, cls: ' neg' },
    { n: S.watchCount || 0, l: 'ประเด็นต้องเฝ้าติดตาม', cls: (S.watchCount || 0) > 0 ? ' neg' : ' up' }
  ].map(k => `<div class="kpi${k.cls || ''}"><div class="n">${esc(k.n)}</div><div class="l">${esc(k.l)}</div></div>`).join('');

  const cmp = S.avgNews != null
    ? `<div class="cmpn">เทียบค่าเฉลี่ย ${esc(S.avgDays || 7)} วันก่อนหน้า: ${esc(S.avgNews)} ข่าว/วัน · ` +
      `ข่าวลบ ${esc(S.avgNegPct)}% (เมื่อวาน ${esc(S.negPct)}% — ` +
      `${(S.negPctDelta || 0) >= 0 ? 'สูงกว่า' : 'ต่ำกว่า'} ${Math.abs(S.negPctDelta || 0)} จุด)</div>` : '';

  // ── ประเด็นเฝ้าระวัง = หัวใจของฉบับ ──
  const maxAge = W.reduce((m, w) => Math.max(m, w.age || 1), 1);
  const watchHtml = W.length ? W.map((w, i) => {
    const hot = (w.neg || 0) > 0;
    const tags = (w.tags || []).map(t =>
      `<span class="wtag${/ลบ|🔴|ผลกระทบสูง/.test(t) ? ' a' : ''}">${esc(t)}</span>`).join('');
    const why = w.why ? `<p class="wwhy">${esc(w.why)}</p>` : '';
    const link = w.url ? ` <a class="src" href="${esc(w.url)}" target="_blank" rel="noopener">อ่านข่าวต้นทาง ↗</a>` : '';
    return `<div class="wcard${hot ? ' hot' : ''}">` +
      `<div class="wtop"><span class="wrank">${i + 1}</span>` +
      `<h3 class="wname">${esc(w.emoji)} ${esc(w.name)}</h3></div>` +
      `<div class="wtags">${tags}</div>${why}` +
      `<div class="wmeta">${ageBar(w.age || 1, maxAge)} มีข่าวมาแล้ว ${esc(w.age || 1)} วัน · ` +
      `${esc(w.srcCount)} สำนัก${w.impact ? ' · ระดับ' + esc(w.impact) : ''}${link}</div></div>`;
  }).join('') : `<div class="quiet">ไม่มีประเด็นที่เข้าเกณฑ์เฝ้าติดตามต่อเนื่องจากข่าวเมื่อวาน</div>`;

  const more = (d.watchMore || []).length
    ? `<div class="watchbox"><div class="lbl wt">ประเด็นรองที่เข้าเกณฑ์ (${d.watchMore.length})</div>` +
      d.watchMore.map(m => `<div class="wmore">• ${esc(m.name)} <span class="rm">— ${esc(m.tags)}</span></div>`).join('') +
      `</div>` : '';

  const attn = (d.attention || []).length
    ? `<h2>ประเด็นที่สื่อพูดถึงมากที่สุด</h2>` +
      `<div class="attn">` + d.attention.map((a, i) =>
        `<div class="ai"><span class="an">${i + 1}.</span>${esc(a.name)} <span class="rm">— ${esc(a.meta)}</span>` +
        (a.url ? ` <a class="src" href="${esc(a.url)}" target="_blank" rel="noopener">↗</a>` : '') + `</div>`).join('') +
      `</div>` : '';

  const totalTopics = (d.appendix || []).reduce((s2, g) => s2 + g.items.length, 0);
  const appendix = (d.appendix || []).map(g =>
    `<details class="apg"><summary>${esc(g.emoji)} ${esc(g.cat)} (${g.items.length})</summary>` +
    g.items.map(it => `<div class="ap">• ${esc(it.name)} <span class="rm">${esc(it.meta)}</span></div>`).join('') +
    `</details>`).join('');

  // 🔴 ฉบับตัวอย่างต้องมีป้ายบอกเสมอ ไม่งั้นอ่านแล้วเข้าใจว่าเป็นข่าวจริง
  const mock = d.isMockup
    ? `<div class="mock">🧪 <b>MOCKUP</b> — ${esc(d.mockNote || 'ฉบับตัวอย่างสำหรับตรวจหน้าตา ตัวเลขและเนื้อหาไม่ใช่ของจริง')}</div>` : '';

  const quiet = d.quiet
    ? `<div class="quiet">🌙 วันข่าวเบาบาง — เมื่อวานมีข่าวเพียง ${esc(S.news)} ข่าว ` +
      `ฉบับนี้จึงสั้นกว่าปกติโดยตั้งใจ ไม่ใช่ระบบเก็บข่าวไม่ครบ</div>` : '';

  const autoFlag = d.execAuto
    ? `<div class="autoflag">ℹ️ บทสรุปฉบับนี้เขียนจากการคำนวณของระบบ (ตัวช่วยวิเคราะห์เรียกไม่สำเร็จหรือไม่ผ่านด่านตรวจอ้างอิง) — ตัวเลขทุกตัวยังถูกต้องตามชีต</div>` : '';

  return `<!doctype html><html lang="th"><head><meta charset="utf-8">` +
    `<title>${esc(d.title)} · ${esc(d.cardPeriod || d.periodLabel)}</title>` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    ogTags(d) +
    TPL_BOOT + `<style>${TPL_STYLE}${TPL_STYLE_DAILY}</style></head><body>

<div class="toolbar"><button type="button" class="tb tb-close" onclick="closeThisPage()">✕ ปิดหน้านี้</button><button type="button" class="tb tb-theme" id="themeBtn" onclick="toggleTheme()"></button><button type="button" class="tb tb-pdf" onclick="window.print()">🖨️ บันทึกเป็น PDF</button></div>${mock}

<div class="banner"><span class="tag">${esc(cycleLabel(d.type))} · ฉบับที่ ${esc(d.no)}</span>
<h1>${esc(d.title)}</h1>
<div class="sub">${esc(d.periodLabel)} · จัดทำโดยระบบติดตามข่าวอัตโนมัติ</div></div>

${quiet}
<div class="kpis">${kpi}</div>
${cmp}

<h2>สรุปภาพรวม</h2>
<div class="exec"><p>${esc(d.exec)}</p>${autoFlag}</div>

<h2>ประเด็นที่ต้องเฝ้าติดตามวันนี้</h2>
<div class="cmpn">เรียงตามคะแนนที่ระบบคำนวณจากข้อเท็จจริงที่วัดได้ — ความต่อเนื่อง ระดับผลกระทบ จำนวนสำนักที่นำเสนอ และการเติบโตจากวันก่อน</div>
${watchHtml}
${more}

${attn}

<h2 class="pb">ตัวเลขประกอบ</h2>
${fig(trend, `ภาพที่ 1 — ${esc(d.trendLabel || 'แนวโน้มปริมาณข่าวย้อนหลัง')} · เส้นประ = ค่าเฉลี่ยของช่วง · แท่งขวาสุดคือวันที่รายงานฉบับนี้พูดถึง`)}
${fig(catsCh, 'ภาพที่ 2 — จำนวนข่าวเมื่อวานรายหมวด แยกข่าวปกติ/ข่าวลบ')}

<h2 class="pb">ภาคผนวก — ประเด็นข่าวทั้งหมดของวัน (${totalTopics} ประเด็น)</h2>
<div class="apx">${appendix}</div>

<footer>${esc(d.footNote || '')}</footer>
${TPL_TAIL}</body></html>`;
}

// ── สีหมวดของรายงานเดือน — ป้ายมีข้อความกำกับเสมอ สีเป็นแค่ตัวช่วย ──
function mcatKey(cat) {
  const c = String(cat || '');
  if (c.indexOf('จชต') >= 0) return 'Jct';
  if (c.indexOf('กัมพูชา') >= 0) return 'Cam';
  if (c.indexOf('ยาเสพติด') >= 0) return 'Drug';
  if (c.indexOf('ช่วยเหลือ') >= 0) return 'Help';
  if (c.indexOf('ความมั่นคงชายแดน') >= 0) return 'Bdr';
  return 'Etc';
}
function mcatVar(cat) { return 'var(--mc' + mcatKey(cat) + ')'; }
function mchip(cat) {
  const v = mcatVar(cat);
  return `<span class="mchip" style="border-color:${v};color:${v}">${esc(cat)}</span>`;
}

/**
 * 📆 หน้ารายงานประจำเดือน (S24) — โครงตามแบบที่เจ้าของระบบอนุมัติ 26 ส.ค. 69
 * ① บทสรุป ② ตัวเลขเทียบเดือนก่อน ③ กราฟเส้น 5 หมวด ④ เส้นเรื่องแนวตั้ง
 * ⑤ วิเคราะห์ narrative รายหมวด ⑥ 10 ประเด็น ⑦ ยกยอด ⑧ สำนักข่าวเสนอต่าง
 * 🔴 ส่วนที่ AI เขียน (①⑤) มีป้ายกำกับเสมอ · หมวดที่ไม่ผ่านด่านตรวจ = ประกาศงดแสดงตรง ๆ
 */
const M_DOW = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
/** ชื่อวันในสัปดาห์ของ "วันที่ dd" ของเดือนนั้น — คำนวณจาก d.from แบบ UTC ไม่พึ่งโซนเวลาผู้ชม */
function mDow(fromIso, dd) {
  const a = String(fromIso || '').split('-');
  if (a.length !== 3) return '';
  const dt = new Date(Date.UTC(Number(a[0]), Number(a[1]) - 1, dd));
  return isNaN(dt.getTime()) ? '' : M_DOW[dt.getUTCDay()];
}

function renderMonthly(d) {
  const S = d.stats || {};
  const dim = d.dim || 31;
  const series = d.seriesCats || [];
  const negDay = d.negDay || [];
  const negMax = Math.max.apply(null, negDay.concat([1]));

  // ── ② การ์ดตัวเลข ──
  // 🔄 26 ส.ค. (รอบ 2): ตัดการ์ดวันเงียบสุด · เหลือ 4 ใบ จัด 2 แถว แถวละ 2
  const st = [
    { l: 'ข่าวทั้งหมด', v: S.news, d: `${esc(d.prevMonthLabel)} <b>${S.prevNews}</b>` },
    { l: 'ประเด็น', v: S.topics, d: `${esc(d.prevMonthLabel)} <b>${S.prevTopics}</b>` },
    { l: 'ข่าวลบ', v: `${S.neg} · ${S.negPct}%`, neg: 1,
      d: `เดือนก่อน <b>${S.prevNeg} · ${S.prevNegPct}%</b> ${arrow(S.negPctDelta)}${Math.abs(S.negPctDelta)} จุด` },
    { l: 'วันหนักสุด', v: `${S.peakDay} ${esc((d.monthLabel || '').split(' ')[0] || '')}`,
      d: `<b>${S.peakN} ข่าว</b>${S.peakNote ? ' · ' + esc(S.peakNote).slice(0, 40) : ''}` }
  ].map(k => `<div class="c"><div class="l">${k.l}</div><div class="v${k.neg ? ' neg' : ''}">${k.v}</div><div class="d">${k.d}</div></div>`).join('');

  // ── ③ กราฟเส้น SVG ──
  const W = 860, H = 300, L = 40, R = 128, T = 14, B = 30;
  const ymaxRaw = Math.max.apply(null, series.map(sr => Math.max.apply(null, sr.days.concat([0]))).concat([10]));
  const YMAX = Math.ceil(ymaxRaw / 25) * 25;
  const X = i => L + (W - L - R) * i / (dim - 1);
  const Y = v => T + (H - T - B) * (1 - v / YMAX);
  let ch = '';
  for (let g = 0; g <= YMAX; g += Math.max(25, Math.ceil(YMAX / 4 / 25) * 25)) {
    ch += `<line x1="${L}" y1="${Y(g)}" x2="${W - R}" y2="${Y(g)}" stroke="${C.grid}" stroke-width="1"/>` +
          `<text x="${L - 6}" y="${Y(g) + 4}" text-anchor="end" font-size="12" font-family="${FAM}" fill="${C.ink4}">${g}</text>`;
  }
  for (let dd = 1; dd <= dim; dd++) if (dd === 1 || dd % 5 === 0)
    ch += `<text x="${X(dd - 1)}" y="${H - 8}" text-anchor="middle" font-size="12" font-family="${FAM}" fill="${C.ink4}">${dd}</text>`;
  // ป้ายปลายเส้น: กันชนกัน + กันหลุดขอบ (บทเรียนจากแบบร่าง)
  const labels = series.map(sr => ({ k: sr.cat, y: Y(sr.days[dim - 1] || 0) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++)
    if (labels[i].y - labels[i - 1].y < 17) labels[i].y = labels[i - 1].y + 17;
  if (labels.length && labels[labels.length - 1].y > H - 8) {
    labels[labels.length - 1].y = H - 8;
    for (let j = labels.length - 2; j >= 0; j--)
      if (labels[j + 1].y - labels[j].y < 17) labels[j].y = labels[j + 1].y - 17;
  }
  const labelY = {}; labels.forEach(l => { labelY[l.k] = l.y; });
  series.forEach(sr => {
    const col = mcatVar(sr.cat);
    const pts = sr.days.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v || 0).toFixed(1)).join('');
    ch += `<path d="${pts}" fill="none" stroke="${col}" stroke-width="1.4" stroke-linejoin="round"/>`;
    ch += `<text x="${W - R + 8}" y="${(labelY[sr.cat] || Y(0)) + 4}" font-size="13" font-weight="700" font-family="${FAM}" fill="${col}">${esc(sr.cat)}</text>`;
    sr.days.forEach((v, i) => { if (v >= 20)
      ch += `<circle cx="${X(i)}" cy="${Y(v)}" r="3.5" fill="${col}" stroke="${C.grid}" stroke-width="1"><title>${i + 1} · ${esc(sr.cat)} ${v} ข่าว</title></circle>`; });
  });
  const lineChart = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="กราฟเส้นจำนวนข่าวรายวันแยกหมวด">${ch}</svg>`;

  // ── ④ สถิติข่าวตามหมวด: ตารางความร้อน แถว=หมวด × คอลัมน์=วัน ──
  //    ตามภาพตัวอย่างที่เจ้าของระบบส่งมา 26 ส.ค. · ความเข้มเทียบกับค่าสูงสุดของแถวตัวเอง
  //    (แต่ละหมวดปริมาณต่างกันมาก ถ้าใช้สเกลรวม หมวดเล็กจะจางจนมองไม่เห็นทั้งแถว)
  const catDays = d.catDays || [];
  let catHeat = '';
  if (catDays.length) {
    let head = '<div class="hmrow hmhead"><div class="hmlab"></div><div class="hmcells">';
    for (let dd = 1; dd <= 31; dd++)
      head += `<div class="hmd">${dd <= dim && (dd === 1 || dd % 5 === 0) ? dd : ''}</div>`;
    head += '</div><div class="hmsum"></div></div>';
    const rowsH = catDays.map(c => {
      const rowMax = Math.max.apply(null, (c.days || [0]).concat([1]));
      const col = mcatVar(c.cat);
      let cells = '';
      for (let dd = 1; dd <= 31; dd++) {
        if (dd > dim) { cells += '<div class="hmc na"></div>'; continue; }
        const v = (c.days || [])[dd - 1] || 0;
        const ng = (c.negs || [])[dd - 1] || 0;
        const op = v ? (0.2 + 0.8 * Math.sqrt(v / rowMax)).toFixed(2) : 0;
        cells += `<div class="hmc" title="${dd} ${esc((d.monthLabel || '').split(' ')[0] || '')} · ${esc(c.cat)} · ${v} ข่าว${ng ? ' (ลบ ' + ng + ')' : ''}">` +
          (v ? `<i style="background:${col};opacity:${op}"></i>` : '') +
          (ng ? '<u></u>' : '') + '</div>';
      }
      return `<div class="hmrow"><div class="hmlab"><span class="hmdot" style="background:${col}"></span>${esc(c.cat)}</div>` +
        `<div class="hmcells">${cells}</div>` +
        `<div class="hmsum">${c.n} ข่าว${c.neg ? ' · <b>ลบ ' + c.neg + '</b>' : ''}</div></div>`;
    }).join('');
    catHeat = `<div class="hm">${head}${rowsH}</div>`;
  } else {
    catHeat = '<div class="manfail">— ไม่มีข้อมูลรายหมวดรายวันในฉบับนี้ —</div>';
  }

  // ── ⑤ เส้นเรื่องแนวตั้ง ──
  const tlByDay = {};
  (d.timeline || []).forEach(e => { (tlByDay[e.d] = tlByDay[e.d] || []).push(e); });
  const gapAfter = {};
  (d.gaps || []).forEach(g => { gapAfter[g.from] = g; });
  let vtl = '';
  Object.keys(tlByDay).map(Number).sort((a, b) => a - b).forEach(dd => {
    // ช่วงเงียบที่จบก่อนวันนี้
    (d.gaps || []).forEach(g => {
      if (g.to === dd - 1 || (g.from < dd && g.to < dd && !g.done)) {
        if (!g.done) { vtl += `<li class="mgap">— วันที่ ${g.from}-${g.to} ไม่มีประเด็นเด่น (ข่าวรวม ${g.news}) —</li>`; g.done = true; }
      }
    });
    const evs = tlByDay[dd];
    const total = evs.reduce((s2, e) => s2 + e.n, 0);
    const ng = negDay[dd - 1] || 0;
    const op = ng ? (0.25 + 0.75 * Math.sqrt(ng / negMax)).toFixed(2) : 0;
    const dot = ng
      ? ` style="background:${C.alert};opacity:${op};box-shadow:0 0 0 1.5px ${C.alert}"` : '';
    // 🔄 ปรับ 26 ส.ค. 69 (คำสั่งเจ้าของระบบ: "ต้องการให้ดูสะอาด")
    //    ตัดตัวเลขหัววัน + ตัวเลขท้ายประเด็นออกจากหน้ากระดาษ — ยังอยู่ครบใน tooltip
    //    (ตัวเลขไม่หาย แค่ย้ายไปชั้นที่ต้องเอาเมาส์ชี้ · จุดแดงยังไล่เข้มตามข่าวลบเหมือนเดิม)
    vtl += `<li class="vday"><span class="vdot"${dot} title="วันที่ ${dd}: ข่าวลบทั้งวัน ${ng} · ประเด็นเด่น ${evs.length} (${total} ข่าว)"></span>` +
      `<span class="vdate">${dd} ${esc((d.monthLabel || '').split(' ')[0] || '')} <span class="vdow">(${mDow(d.from, dd)})</span></span>` +
      evs.map(e =>
        `<div class="mev" style="border-left-color:${mcatVar(e.cat)}" title="${e.n} ข่าว${e.neg ? ' · ลบ ' + e.neg : ''}">${mchip(e.cat)}` +
        `<span class="t">${esc(e.name)}</span></div>`
      ).join('') + '</li>';
  });

  // ── ⑤ บทวิเคราะห์ ──
  const analysis = (d.analysis || []).map(a => {
    const head = `<div class="h">${mchip(a.cat)}<h3>${esc(a.cat)}</h3>` +
      `<span class="nums">${a.n} ข่าว · ลบ ${a.neg} (${a.negPct}%)</span></div>`;
    if (!a.ok) {
      return `<div class="man" style="border-left-color:${mcatVar(a.cat)}">${head}` +
        `<div class="manfail">⚠️ บทวิเคราะห์หมวดนี้งดแสดง — ผลจาก AI ไม่ผ่านการตรวจสอบอ้างอิง/ตัวเลขอัตโนมัติ ` +
        `(ระบบเลือกไม่แสดงดีกว่าแสดงข้อมูลที่ยืนยันไม่ได้)</div></div>`;
    }
    const side = (who, txt) => txt ? `<p><b class="who">▸ ${who}:</b> ${esc(txt)}</p>` : '';
    // 🔄 โครงใหม่ 26 ส.ค. 69 (คำสั่งเจ้าของระบบ) — 4 หัวข้อต่อหมวด
    //    ช่อง "(ถ้ามี)" ที่ Gemini ตอบ "ไม่มี"/ว่าง จะไม่ถูกแสดง — ไม่บังคับให้มีของเติม (กันกุ)
    if (a.events || a.suggest) {
      const opt = t => (t && !/^ไม่มี/.test(String(t).trim())) ? t : '';
      return `<div class="man" style="border-left-color:${mcatVar(a.cat)}">${head}` +
        side('เหตุการณ์สำคัญที่เกิดขึ้น', a.events) +
        side('ประเด็นเชิงลบที่สังคมกล่าวถึง', opt(a.negatives)) +
        side('การชี้แจงของกองทัพบก', opt(a.response)) +
        '</div>';
    }
    // payload รุ่นเก่า (-74 ก่อนปรับ) ยังเปิดอ่านได้ — กฎห้ามลบอดีต
    return `<div class="man" style="border-left-color:${mcatVar(a.cat)}">${head}` +
      side('ฝ่ายกองทัพ/รัฐ', a.army) + side('สื่อ/สังคม', a.media) +
      side('ฝ่ายการเมือง/ผู้เห็นต่าง', a.critics) +
      (a.weak ? `<p><b class="who">⚠️</b> ${esc(a.weak)}</p>` : '') +
      (a.keyMessage ? `<div class="mkm">🔑 <b>Key message:</b> ${esc(a.keyMessage)}</div>` : '') +
      '</div>';
  }).join('');

  const mock = d.isMockup ? `<div class="mock">🧪 <b>MOCKUP</b> — ${esc(d.mockNote || '')}</div>` : '';

  return `<!doctype html><html lang="th"><head><meta charset="utf-8">` +
    `<title>${esc(d.title)} · ${esc(d.periodLabel)}</title>` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    ogTags(d) + TPL_BOOT + `<style>${TPL_STYLE}${TPL_STYLE_MONTHLY}</style></head><body>

<div class="toolbar"><button type="button" class="tb tb-close" onclick="closeThisPage()">✕ ปิดหน้านี้</button><button type="button" class="tb tb-theme" id="themeBtn" onclick="toggleTheme()"></button><button type="button" class="tb tb-pdf" onclick="window.print()">🖨️ บันทึกเป็น PDF</button></div>${mock}

<div class="banner"><span class="tag">${esc(cycleLabel(d.type))} · ฉบับที่ ${esc(d.no)}</span>
<h1>${esc(d.title)}</h1>
<div class="sub">${esc(d.periodLabel)} · จัดทำโดยระบบติดตามข่าวอัตโนมัติ</div></div>

<h2>① บทสรุปผู้บริหาร</h2>
<ul class="exb">${(d.exec && d.exec.bullets || []).map(b => `<li>${esc(b)}</li>`).join('')}</ul>
<div class="ainote">🤖 ${esc(d.aiNote || '')}</div>

<h2>② ตัวเลขเดือนนี้ เทียบเดือนก่อน</h2>
<div class="mst">${st}</div>

<h2 class="pb">③ แนวโน้มรายวัน ${series.length} หมวดหลักสูงสุด</h2>
<div class="cap">แกนนอน = วันที่ · แกนตั้ง = จำนวนข่าว/วัน · ชื่อหมวดกำกับที่ปลายเส้น · จุดวงกลม = วันที่หมวดนั้นมีข่าว ≥ 20</div>
<div class="mchart">${lineChart}</div>

<h2 class="pb">④ สถิติข่าวตามหมวด</h2>
<div class="cap">แถว = หมวด (ทุกหมวดที่มีข่าวเดือนนี้ เรียงมาก→น้อย) · คอลัมน์ = วันที่ · สีเข้ม = ข่าวมากของหมวดนั้น · ขีดแดงใต้ช่อง = วันนั้นมีข่าวลบ · ชี้ที่ช่องดูตัวเลข</div>
<div class="mchart">${catHeat}</div>

<h2 class="pb">⑤ เหตุการณ์สำคัญในเดือนนี้</h2>
<div class="cap">เส้นเวลาเดียวไล่จากต้นเดือน · เฉพาะประเด็นเด่น (≥ ${d.tlMin || 4} ข่าว) · สีป้าย = หมวด (มีชื่อกำกับเสมอ) · จุดวงกลมแดงเข้ม = วันนั้นข่าวลบมาก (ตัวเลขกำกับทุกวัน)</div>
<ul class="vtl">${vtl}</ul>

<h2 class="pb">⑥ บทสรุปรายหมวด</h2>
<div class="ainote">🤖 ส่วนนี้ AI เขียนจากชื่อประเด็นจริงในระบบ ผ่านด่านตรวจอ้างอิงและตัวเลข · หมวดที่ไม่ผ่านด่านจะงดแสดงและประกาศตรง ๆ</div>
${analysis || '<div class="manfail">— เดือนนี้ไม่มีหมวดที่เข้าเกณฑ์วิเคราะห์ —</div>'}

<footer>${esc(d.footNote || d.aiNote || '')}</footer>
${TPL_TAIL}</body></html>`;
}

function renderReport(d) {
  // ☀️ รุ่น -64: รายงานประจำวันใช้โครงคนละแบบ — แยกทางตั้งแต่บรรทัดแรก
  if (d.type === 'daily') return renderDaily(d);
  // 📆 S24: รายเดือนแบบใหม่ (มีธง mschema) ใช้โครงของตัวเอง
  //    payload เก่า/อื่นที่ type=monthly แต่ไม่มีธง ยังใช้โครงรายสัปดาห์เดิมได้
  if (d.type === 'monthly' && d.mschema) return renderMonthly(d);
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
    ogTags(d) +
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
  if (t === 'daily') return 'รายงานประจำวัน';
  if (t === 'monthly') return 'รายงานประจำเดือน';
  return 'รายงานประจำสัปดาห์';
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
      // 📦 JSON อาจถูกแตกเก็บหลายเซลล์ (G, H, I, …) เพราะเซลล์ชีตรับได้ 50,000 ตัวอักษร
      //    ต่อกลับตามลำดับคอลัมน์ — แถวเก่าที่มีเซลล์เดียว join แล้วได้ค่าเดิมเป๊ะ
      //    🔴 ต้องวางฝั่งนี้ "ก่อน" ฝั่ง Apps Script เสมอ ไม่งั้นจะอ่านได้แค่ก้อนแรก
      const payload = JSON.parse(r.slice(6).map(c => String(c == null ? '' : c)).join(''));
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
      newsDelta: S.newsDelta, negPctDelta: S.negPctDelta,
      // ☀️ รุ่น -64 — เฉพาะรายงานประจำวัน (ฉบับรายสัปดาห์จะเป็น undefined แล้วหายไปตอน stringify)
      watchCount: S.watchCount
    },
    topCat: d.topCat,
    // ☀️ การ์ดรายวันไม่มี cardHighlights — ใช้ชื่อประเด็นเฝ้าระวัง 3 อันดับแรกแทน
    highlights: (d.cardHighlights && d.cardHighlights.length
      ? d.cardHighlights
      : (d.watch || []).map(w => w.name)).slice(0, 3),
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
