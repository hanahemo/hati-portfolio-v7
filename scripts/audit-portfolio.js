#!/usr/bin/env node
// 포트폴리오 데이터 정적 감사
// 실행: node scripts/audit-portfolio.js
// 수정하지 않음 — 리포트만 출력

const fs = require('fs');
const path = require('path');

const PORTFOLIO = path.join(__dirname, '..', 'server', 'data', 'portfolio.json');
const SETTINGS = path.join(__dirname, '..', 'server', 'data', 'settings.json');

const portfolio = JSON.parse(fs.readFileSync(PORTFOLIO, 'utf8'));
const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));

const CATS = new Set(['photo', 'graphic', 'video']);
const projects = portfolio.projects;

const issues = { critical: [], major: [], minor: [] };
const stats = {
  total: projects.length,
  byCategory: { photo: 0, graphic: 0, video: 0 },
  withDescription: 0,
  withExternalLink: 0,
  withMedia: 0,
  totalMedia: 0,
};

const urlSeen = new Map(); // url → [id]
const titleSeen = new Map();

for (const p of projects) {
  // 카테고리
  if (!CATS.has(p.category)) issues.critical.push(`#${p.id} 잘못된 카테고리: "${p.category}"`);
  else stats.byCategory[p.category]++;

  // 필수 필드
  if (!p.title || !p.title.trim()) issues.critical.push(`#${p.id} title 비어있음`);
  if (!p.description || !p.description.trim()) issues.minor.push(`#${p.id} description 비어있음 ("${p.title}")`);
  else stats.withDescription++;

  if (p.externalLink) stats.withExternalLink++;

  // media
  if (!Array.isArray(p.media) || p.media.length === 0) {
    issues.major.push(`#${p.id} media 비어있음 ("${p.title}")`);
  } else {
    stats.withMedia++;
    stats.totalMedia += p.media.length;
    for (const m of p.media) {
      if (!m || !m.url) {
        issues.major.push(`#${p.id} media 항목에 url 없음`);
        continue;
      }
      const key = m.url;
      if (!urlSeen.has(key)) urlSeen.set(key, []);
      urlSeen.get(key).push(p.id);
    }
  }

  // title 중복
  if (p.title) {
    const k = p.title.trim();
    if (!titleSeen.has(k)) titleSeen.set(k, []);
    titleSeen.get(k).push(p.id);
  }
}

// 중복 URL (2개 이상 프로젝트가 같은 미디어)
for (const [url, ids] of urlSeen) {
  if (ids.length > 1) {
    const uniqIds = [...new Set(ids)];
    if (uniqIds.length > 1) {
      issues.minor.push(`중복 미디어 URL (${uniqIds.length}개 프로젝트 공유) #${uniqIds.join(',')}: ${url.slice(0, 80)}...`);
    }
    // 같은 프로젝트 내 중복은 warn
    const dupIn = ids.filter((id, i, a) => a.indexOf(id) !== i);
    if (dupIn.length) issues.minor.push(`#${[...new Set(dupIn)].join(',')} 내부 중복 미디어: ${url.slice(0, 80)}...`);
  }
}

// 중복 title
for (const [title, ids] of titleSeen) {
  if (ids.length > 1) issues.major.push(`중복 제목 "${title}" — #${ids.join(', ')}`);
}

// featuredProjectIds 유효성
const ids = new Set(projects.map(p => p.id));
for (const fid of settings.featuredProjectIds || []) {
  if (!ids.has(fid)) issues.critical.push(`featuredProjectIds에 존재하지 않는 ID #${fid}`);
}

// ── 출력 ──
const fmt = (label, arr) => {
  if (!arr.length) return `\n[${label}] 없음\n`;
  return `\n[${label}] ${arr.length}건\n` + arr.map((x, i) => `  ${i + 1}. ${x}`).join('\n') + '\n';
};

console.log('='.repeat(60));
console.log('Hati Portfolio — 데이터 감사 리포트');
console.log('='.repeat(60));
console.log(`\n총 프로젝트: ${stats.total}개`);
console.log(`카테고리: photo ${stats.byCategory.photo} / graphic ${stats.byCategory.graphic} / video ${stats.byCategory.video}`);
console.log(`description 있는 프로젝트: ${stats.withDescription}/${stats.total} (${Math.round(stats.withDescription / stats.total * 100)}%)`);
console.log(`externalLink 채워짐: ${stats.withExternalLink}/${stats.total}`);
console.log(`media 있는 프로젝트: ${stats.withMedia}/${stats.total}`);
console.log(`총 미디어 개수: ${stats.totalMedia}`);
console.log(`featured: ${(settings.featuredProjectIds || []).length}개 → [${(settings.featuredProjectIds || []).join(', ')}]`);

console.log(fmt('CRITICAL', issues.critical));
console.log(fmt('MAJOR', issues.major));
console.log(fmt('MINOR', issues.minor));

const total = issues.critical.length + issues.major.length + issues.minor.length;
console.log('='.repeat(60));
console.log(`결론: ${total === 0 ? '이상 없음 ✓' : `총 ${total}건 (critical ${issues.critical.length} / major ${issues.major.length} / minor ${issues.minor.length})`}`);
console.log('='.repeat(60));
