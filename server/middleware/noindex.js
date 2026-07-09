// 프라이빗 포트폴리오: 검색엔진 크롤링 차단 헤더
module.exports = function noindex(req, res, next) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  next();
};
