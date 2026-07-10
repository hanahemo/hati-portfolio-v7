// 영구 저장소 경로 해석 — Railway 볼륨이 붙어 있으면 데이터/업로드를 그 볼륨에서 읽고 쓴다.
// 볼륨이 없으면(로컬 개발) 기존 번들 경로(server/data, public/uploads)를 그대로 사용 → 개발 동작 불변.
// 재배포 시 컨테이너 파일시스템은 초기화되므로, 어드민이 바꾼 데이터/업로드가 남으려면 볼륨이 필수.
const fs = require('fs');
const path = require('path');

// Railway가 볼륨 마운트 시 주입하는 경로. (수동 오버라이드용 DATA_ROOT도 허용)
const VOL = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DATA_ROOT || null;

// 번들 기본값(이미지/리포에 커밋된 것) — 볼륨 최초 부팅 시 시드 원본
const BUNDLED_DATA = path.join(__dirname, 'data');
const BUNDLED_UPLOADS = path.join(__dirname, '..', 'public', 'uploads');

// 실제 사용 경로 — 볼륨 있으면 볼륨 하위, 없으면 번들 위치
const DATA_DIR = VOL ? path.join(VOL, 'data') : BUNDLED_DATA;
const UPLOADS_DIR = VOL ? path.join(VOL, 'uploads') : BUNDLED_UPLOADS;

function ensureDir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }
function seedFile(src, dest) {
  try { if (fs.existsSync(src) && !fs.existsSync(dest)) fs.copyFileSync(src, dest); } catch (_) {}
}
function seedDir(srcDir, destDir) {
  ensureDir(destDir);
  try {
    for (const f of fs.readdirSync(srcDir)) {
      if (f.startsWith('.')) continue;               // ._* / .DS_Store 제외
      const s = path.join(srcDir, f);
      if (fs.statSync(s).isFile()) seedFile(s, path.join(destDir, f));
    }
  } catch (_) {}
}

// 볼륨이 붙어 있으면: 비어 있을 때만 기본값 시드(기존 어드민 데이터는 절대 덮지 않음).
if (VOL) {
  ensureDir(DATA_DIR);
  seedFile(path.join(BUNDLED_DATA, 'portfolio.json'), path.join(DATA_DIR, 'portfolio.json'));
  seedFile(path.join(BUNDLED_DATA, 'settings.json'), path.join(DATA_DIR, 'settings.json'));
  seedDir(BUNDLED_UPLOADS, UPLOADS_DIR);
  console.log('[hati/persist] 볼륨 활성 →', VOL, '(데이터/업로드 영구 저장)');
} else {
  console.log('[hati/persist] 볼륨 없음 — 번들 경로 사용(로컬/임시). 재배포 시 어드민 변경 초기화됨');
}

module.exports = { VOL, DATA_DIR, UPLOADS_DIR, BUNDLED_DATA, BUNDLED_UPLOADS };
