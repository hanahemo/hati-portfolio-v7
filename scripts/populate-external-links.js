#!/usr/bin/env node
// 빈 externalLink를 media[0].url로 자동 채움 (Drive 링크 등)
// 이미 값이 있는 항목은 건드리지 않음. 1회 실행 후 어드민에서 수동 관리.

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'server', 'data', 'portfolio.json');
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));

let filled = 0;
let skipped = 0;

for (const p of data.projects) {
  if (p.externalLink && p.externalLink.trim()) { skipped++; continue; }
  const firstUrl = p.media && p.media[0] && p.media[0].url;
  if (!firstUrl) continue;
  p.externalLink = firstUrl;
  filled++;
}

// atomic write
const tmp = FILE + '.tmp';
fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
fs.renameSync(tmp, FILE);

console.log(`[populate-external-links] 완료 — 채움: ${filled} / 건너뜀(이미 있음): ${skipped}`);
