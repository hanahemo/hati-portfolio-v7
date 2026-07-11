// Phase 1: 최소 어드민 인증 스캐폴딩 (세션 기반)
// Phase 2에서 기존 reference/portfolio/server.js의 Supabase 세션 연동 병합 예정
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  // router.use('/api', requireAdmin) 로 마운트되면 req.path 는 마운트 경로가 잘린 값('/portfolio' 등)이라
  // '/api/' 로 시작하지 않는다 — originalUrl 로 판정해야 API 가 302 HTML 대신 401 JSON 을 받는다.
  if ((req.originalUrl || req.path).includes('/api/')) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  return res.redirect('/admin/login');
}

module.exports = { requireAdmin };
