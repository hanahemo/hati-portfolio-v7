// og-image.svg → og-image.png (1200×630)
// @resvg/resvg-js가 설치되어 있으면 변환, 없으면 안내 후 종료.
// 실행: node scripts/convert-og-image.js (src/ 디렉토리에서)
const fs = require('fs');
const path = require('path');

const SVG = path.join(__dirname, '..', 'public', 'assets', 'images', 'og-image.svg');
const PNG = path.join(__dirname, '..', 'public', 'assets', 'images', 'og-image.png');

function tryResvg() {
  const { Resvg } = require('@resvg/resvg-js');
  const svg = fs.readFileSync(SVG);
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
  const png = resvg.render().asPng();
  fs.writeFileSync(PNG, png);
  console.log('[og] wrote', PNG);
}

function trySharp() {
  const sharp = require('sharp');
  return sharp(SVG, { density: 300 })
    .resize(1200, 630)
    .png()
    .toFile(PNG)
    .then(() => console.log('[og] wrote', PNG));
}

(async () => {
  try { tryResvg(); return; } catch (_) {}
  try { await trySharp(); return; } catch (_) {}
  console.error('\n[og] 변환 라이브러리 없음.');
  console.error('다음 중 하나로 설치 후 재실행:');
  console.error('  npm i -D @resvg/resvg-js');
  console.error('  npm i -D sharp');
  console.error('또는 브라우저/Figma에서 og-image.svg를 1200×630 PNG로 내보내 같은 경로에 저장.');
  process.exit(1);
})();
