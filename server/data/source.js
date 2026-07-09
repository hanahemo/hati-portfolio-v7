// 데이터 소스 추상화 레이어
// .env에 SUPABASE_URL + (SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY)가 있고
// @supabase/supabase-js 모듈이 설치되어 있으면 Supabase 사용,
// 그 외에는 로컬 JSON (server/data/*.json) 폴백. 기본 동작은 파일 기반.

const fs = require('fs');
const path = require('path');

const DATA_DIR = __dirname;
const PORTFOLIO_FILE = path.join(DATA_DIR, 'portfolio.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// ── 파일 기반 I/O (동기) ──
function readJSONSync(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (_) { return null; }
}
function writeJSONSync(file, obj) {
  // 원자적 교체: tmp에 쓴 뒤 rename (크래시 시 부분 쓰기 방지)
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

// ── Supabase 선택적 로드 ──
let supabase = null;
let useSupabase = false;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (SB_URL && SB_KEY) {
  try {
    const mod = require('@supabase/supabase-js'); // 미설치 시 throw
    supabase = mod.createClient(SB_URL, SB_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    useSupabase = true;
    console.log('[hati/data] supabase connected →', SB_URL);
  } catch (err) {
    useSupabase = false;
    console.warn('[hati/data] supabase 설정 감지했으나 로드 실패, 로컬 JSON으로 폴백:', err.message);
  }
} else {
  console.log('[hati/data] 로컬 JSON 모드 (SUPABASE_URL / KEY 미설정)');
}

// ── 파일 구현체 ──
const fileSource = {
  async readPortfolio() {
    return readJSONSync(PORTFOLIO_FILE) || { projects: [] };
  },
  async writePortfolio(data) {
    writeJSONSync(PORTFOLIO_FILE, data);
    return data;
  },
  async readSettings() {
    return readJSONSync(SETTINGS_FILE) || {};
  },
  async writeSettings(data) {
    writeJSONSync(SETTINGS_FILE, data);
    return data;
  }
};

// ── Supabase 구현체 — 단일 테이블 data_store(key text pk, value jsonb, updated_at timestamptz) ──
// 읽기/쓰기 경로 동일. 혼동 방지를 위해 스키마 단일화.
async function sbRead(key, fallback) {
  const { data, error } = await supabase.from('data_store')
    .select('value').eq('key', key).maybeSingle();
  if (error) {
    console.warn(`[hati/data] data_store 읽기 실패 (${key}):`, error.message);
    return fallback;
  }
  return (data && data.value) || fallback;
}
async function sbWrite(key, value) {
  const { error } = await supabase.from('data_store')
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) {
    throw new Error(`[Supabase] data_store 저장 실패 (${key}): ${error.message} — 테이블 존재 여부와 RLS 정책을 확인하세요`);
  }
  return value;
}

const sbSource = {
  readPortfolio: () => sbRead('portfolio', { projects: [] }),
  writePortfolio: (payload) => sbWrite('portfolio', payload),
  readSettings: () => sbRead('settings', {}),
  writeSettings: (payload) => sbWrite('settings', payload)
};

const source = useSupabase ? sbSource : fileSource;

module.exports = {
  useSupabase,
  readPortfolio: () => source.readPortfolio(),
  writePortfolio: (data) => source.writePortfolio(data),
  readSettings: () => source.readSettings(),
  writeSettings: (data) => source.writeSettings(data)
};
