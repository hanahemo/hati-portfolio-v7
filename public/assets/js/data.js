// portfolio / settings fetch + 로컬 폴백
export async function loadData() {
  const [portfolio, settings] = await Promise.all([
    fetch('/api/portfolio').then(r => r.ok ? r.json() : null).catch(() => null),
    fetch('/api/settings').then(r => r.ok ? r.json() : null).catch(() => null),
  ]);
  return {
    portfolio: portfolio || { projects: [] },
    settings: settings || {}
  };
}
