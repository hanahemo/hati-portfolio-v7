// Phase 1: 최소 어드민 인증 스캐폴딩 (세션 기반)
// Phase 2에서 기존 reference/portfolio/server.js의 Supabase 세션 연동 병합 예정
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  return res.redirect('/admin/login');
}

module.exports = { requireAdmin };
