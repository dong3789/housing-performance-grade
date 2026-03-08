const express = require('express');
const { getAnnouncementsWithGrades, getRegions, getAnnouncement, getGrade } = require('./db');
const { saveGrade } = require('./db');
const { syncAnnouncements, syncGrades, fullSync } = require('./sync');
const {
  fetchPdfInfo,
  downloadPdf,
  parsePerformanceGrade,
} = require('./scraper');

const app = express();
const PORT = 3456;

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}


const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; background: #f5f5f5; color: #333; }
  .container { max-width: 960px; margin: 0 auto; padding: 20px; }
  h1 { text-align: center; margin: 30px 0 10px; font-size: 24px; }
  h1 em { color: #e74c3c; font-style: normal; }
  .desc { text-align: center; color: #999; margin-bottom: 24px; font-size: 13px; }

  /* 탭 */
  .tabs { display: flex; justify-content: center; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
  .tabs a { padding: 8px 20px; border-radius: 20px; text-decoration: none; font-size: 14px; font-weight: 600; background: #fff; color: #666; box-shadow: 0 1px 4px rgba(0,0,0,0.08); transition: all 0.2s; }
  .tabs a.active { background: #3498db; color: #fff; }
  .tabs a:hover { background: #e8f4fd; color: #3498db; }
  .tabs a.active:hover { background: #2980b9; color: #fff; }

  /* 지역 필터 */
  .region-filter { display: flex; justify-content: center; gap: 6px; margin-bottom: 20px; flex-wrap: wrap; overflow-x: auto; -webkit-overflow-scrolling: touch; padding: 2px 0; }
  .region-filter a { padding: 5px 14px; border-radius: 16px; text-decoration: none; font-size: 12px; font-weight: 500; background: #fff; color: #888; border: 1px solid #e0e0e0; transition: all 0.2s; white-space: nowrap; }
  .region-filter a.active { background: #2c3e50; color: #fff; border-color: #2c3e50; }
  .region-filter a:hover { border-color: #3498db; color: #3498db; }
  .region-filter a.active:hover { background: #34495e; color: #fff; }

  /* 정렬 */
  .sort-bar { display: flex; justify-content: center; gap: 8px; margin-bottom: 16px; }
  .sort-bar a { padding: 5px 14px; border-radius: 16px; text-decoration: none; font-size: 12px; font-weight: 500; background: #fff; color: #888; border: 1px solid #e0e0e0; transition: all 0.2s; }
  .sort-bar a.active { background: #e74c3c; color: #fff; border-color: #e74c3c; }
  .sort-bar a:hover { border-color: #e74c3c; color: #e74c3c; }
  .sort-bar a.active:hover { background: #c0392b; color: #fff; }

  /* 카드 */
  .card { background: #fff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 12px; overflow: hidden; transition: box-shadow 0.2s; }
  .card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.12); }
  .card-header { padding: 14px 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .card { cursor: pointer; }
  .card-header h3 { font-size: 14px; flex: 1; line-height: 1.4; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; white-space: nowrap; }
  .badge-sale { background: #e3f2fd; color: #1565c0; }
  .badge-rent { background: #f3e5f5; color: #7b1fa2; }
  .badge-active { background: #e8f5e9; color: #2e7d32; }
  .badge-closed { background: #fce4ec; color: #c62828; }
  .card-body { padding: 10px 20px 14px; font-size: 13px; color: #666; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; }
  .btn { display: inline-block; padding: 6px 14px; background: #3498db; color: #fff; text-decoration: none; border-radius: 8px; font-size: 12px; transition: background 0.2s; }
  .btn:hover { background: #2980b9; }
  .btn-compare { background: #27ae60; }
  .btn-compare:hover { background: #219a52; }
  .btn-compare.selected { background: #e74c3c; }

  /* 소음등급 미리보기 */
  .noise-preview { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; width: 100%; }
  .noise-badge { display: inline-flex; align-items: center; gap: 2px; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; background: #f8f9fa; border: 1px solid #eee; }
  .noise-badge .nb-star { font-size: 12px; }
  .nb-star-1 { color: #e74c3c; }
  .nb-star-2 { color: #e67e22; }
  .nb-star-3 { color: #f39c12; }
  .nb-star-4 { color: #27ae60; }

  /* 페이지네이션 */
  .pagination { text-align: center; margin: 24px 0; }
  .pagination a { display: inline-block; padding: 8px 14px; margin: 0 4px; background: #fff; border-radius: 8px; text-decoration: none; color: #333; box-shadow: 0 1px 4px rgba(0,0,0,0.1); }
  .pagination a.active { background: #3498db; color: #fff; }

  .empty { text-align: center; padding: 60px; color: #999; }

  /* 상세 페이지 */
  .back { display: inline-block; margin-bottom: 20px; color: #3498db; text-decoration: none; font-size: 14px; }
  .section { background: #fff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 20px; overflow: hidden; }
  .section-title { padding: 14px 20px; font-size: 15px; font-weight: 700; border-bottom: 2px solid; }
  .noise { border-color: #e74c3c; color: #e74c3c; background: #fef2f2; }
  .structure { border-color: #3498db; color: #3498db; background: #eff6ff; }
  .env { border-color: #27ae60; color: #27ae60; background: #f0fdf4; }
  .living { border-color: #f39c12; color: #f39c12; background: #fffbeb; }
  .fire { border-color: #8e44ad; color: #8e44ad; background: #faf5ff; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 10px 20px; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
  td:first-child { color: #555; }
  td:last-child { text-align: right; font-weight: 600; min-width: 120px; }
  .stars { color: #f39c12; font-size: 15px; letter-spacing: 2px; }
  .stars-low { color: #e74c3c; }
  .warn { background: #fff5f5; }
  .no-data { color: #ccc; }
  .loading-msg { text-align: center; padding: 60px; color: #999; }
  .error-msg { text-align: center; padding: 60px; color: #e74c3c; }

  /* 소개 모달 */
  .info-btn { display: inline-block; margin-left: 8px; width: 22px; height: 22px; border-radius: 50%; background: #3498db; color: #fff; text-align: center; line-height: 22px; font-size: 13px; font-weight: 700; cursor: pointer; vertical-align: middle; text-decoration: none; }
  .info-btn:hover { background: #2980b9; }
  .modal-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 200; justify-content: center; align-items: center; }
  .modal-overlay.show { display: flex; }
  .modal { background: #fff; border-radius: 16px; max-width: 640px; width: 90%; max-height: 80vh; overflow-y: auto; padding: 32px; position: relative; box-shadow: 0 8px 32px rgba(0,0,0,0.2); }
  .modal h2 { font-size: 18px; margin-bottom: 16px; color: #2c3e50; }
  .modal h3 { font-size: 14px; margin: 16px 0 8px; color: #e74c3c; }
  .modal p, .modal li { font-size: 13px; line-height: 1.7; color: #555; }
  .modal ul { padding-left: 20px; margin-bottom: 12px; }
  .modal .close-btn { position: absolute; top: 16px; right: 16px; background: none; border: none; font-size: 22px; cursor: pointer; color: #999; }
  .modal .close-btn:hover { color: #333; }
  .modal .grade-example { display: inline-block; background: #fffbeb; border: 1px solid #f39c12; border-radius: 8px; padding: 8px 16px; margin: 8px 0; font-size: 14px; }
  .modal .grade-example .stars { color: #f39c12; letter-spacing: 2px; }
  .btn-download { display: inline-block; margin: 12px 0; padding: 8px 16px; background: #e74c3c; color: #fff; text-decoration: none; border-radius: 8px; font-size: 13px; }
  .btn-download:hover { background: #c0392b; }
  .no-grade-msg { text-align: center; padding: 40px; color: #999; font-size: 14px; }
  .no-grade-msg .reason { color: #e67e22; font-weight: 600; margin-top: 8px; }

  /* 검색 */
  .search-bar { display: flex; justify-content: center; margin-bottom: 20px; gap: 8px; }
  .search-bar input { padding: 10px 16px; border: 1px solid #ddd; border-radius: 10px; font-size: 14px; width: 300px; outline: none; }
  .search-bar input:focus { border-color: #3498db; box-shadow: 0 0 0 3px rgba(52,152,219,0.1); }
  .search-bar button { padding: 10px 20px; background: #3498db; color: #fff; border: none; border-radius: 10px; font-size: 14px; cursor: pointer; }
  .search-bar button:hover { background: #2980b9; }

  /* 비교 */
  .compare-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #2c3e50; color: #fff; padding: 14px 20px; display: none; z-index: 100; text-align: center; font-size: 14px; box-shadow: 0 -4px 16px rgba(0,0,0,0.2); }
  .compare-bar a { color: #3498db; margin-left: 12px; font-weight: 600; text-decoration: none; background: #fff; padding: 6px 16px; border-radius: 8px; }
  .compare-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 20px; }
  .compare-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); min-width: 500px; }
  .compare-table th { padding: 12px 16px; background: #f8f9fa; font-size: 13px; text-align: center; border-bottom: 2px solid #eee; }
  .compare-table td { padding: 10px 16px; font-size: 13px; text-align: center; border-bottom: 1px solid #f0f0f0; }
  .compare-table td:first-child { text-align: left; font-weight: 500; }
  .compare-table .best { background: #f0fdf4; font-weight: 700; }

  /* 모바일 최적화 */
  @media (max-width: 768px) {
    .container { padding: 12px; }
    h1 { font-size: 20px; margin: 20px 0 8px; }
    .desc { font-size: 12px; margin-bottom: 16px; }
    .tabs { gap: 6px; }
    .tabs a { padding: 6px 14px; font-size: 13px; }
    .region-filter { justify-content: flex-start; flex-wrap: nowrap; overflow-x: auto; gap: 6px; padding-bottom: 4px; }
    .region-filter a { flex-shrink: 0; }
    .search-bar { flex-direction: column; align-items: stretch; }
    .search-bar input { width: 100%; }
    .search-bar button { width: 100%; }
    .card { margin-bottom: 10px; }
    .card-header { padding: 12px 14px; gap: 8px; }
    .card-header h3 { font-size: 13px; }
    .card-body { padding: 8px 14px 12px; font-size: 12px; gap: 4px 10px; }
    .badge { font-size: 10px; padding: 2px 8px; }
    .noise-badge { font-size: 10px; padding: 1px 6px; }
    .pagination a { padding: 6px 10px; margin: 0 2px; font-size: 13px; }
    td { padding: 8px 12px; font-size: 12px; }
    .section-title { padding: 12px 14px; font-size: 14px; }
    .modal { padding: 20px; width: 95%; }
    .compare-bar { font-size: 13px; padding: 10px 14px; }
  }
`;

// 소음 항목 이름 → 짧은 라벨 매핑
const NOISE_SHORT_LABELS = {
  '경량충격음 차단성능': '경량',
  '중량충격음 차단성능': '중량',
  '경계벽/차음': '경계벽',
  '교통소음': '교통',
  '급배수 소음': '급배수',
};

// 등급별 색상 클래스
function starColorClass(value) {
  if (value === 1) return 'nb-star-1';
  if (value === 2) return 'nb-star-2';
  if (value === 3) return 'nb-star-3';
  if (value === 4) return 'nb-star-4';
  return 'nb-star-3';
}

// gradeJson에서 소음 미리보기 HTML 생성
function renderNoisePreview(gradeJson) {
  if (!gradeJson) return '';
  try {
    const grades = JSON.parse(gradeJson);
    if (!grades || !grades['소음관련등급']) return '';
    const noise = grades['소음관련등급'];
    const badges = [];
    for (const [name, value] of Object.entries(noise)) {
      if (typeof value !== 'number') continue;
      const shortLabel = NOISE_SHORT_LABELS[name] || name;
      const colorCls = starColorClass(value);
      badges.push(`<span class="noise-badge"><span>${shortLabel}</span><span class="nb-star ${colorCls}">★${value}</span></span>`);
    }
    if (badges.length === 0) return '';
    return `<div class="noise-preview">${badges.join('')}</div>`;
  } catch {
    return '';
  }
}

function renderStars(value, isNoise = false) {
  if (value === '-') return '<span class="no-data">-</span>';
  if (typeof value === 'number') {
    const low = isNoise && value <= 1;
    return `<span class="stars ${low ? 'stars-low' : ''}">${'★'.repeat(value)}${'☆'.repeat(Math.max(0, 4 - value))}</span> <small>(${value}등급)</small>`;
  }
  return String(value);
}

// URL 파라미터 빌더
function buildQuery(params) {
  const { type, page, q, region, sort } = params;
  const parts = [];
  if (type && type !== 'all') parts.push(`type=${encodeURIComponent(type)}`);
  if (page && page > 1) parts.push(`page=${page}`);
  if (q) parts.push(`q=${encodeURIComponent(q)}`);
  if (region) parts.push(`region=${encodeURIComponent(region)}`);
  if (sort && sort !== 'date') parts.push(`sort=${encodeURIComponent(sort)}`);
  return parts.length > 0 ? '?' + parts.join('&') : '/';
}

// === 목록 페이지 ===
app.get('/', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const type = req.query.type || 'all';
  const search = (req.query.q || '').trim();
  const region = (req.query.region || '').trim();
  const sort = req.query.sort || 'date';
  const perPage = 20;

  const { rows: announcements, total } = getAnnouncementsWithGrades({ page, type, perPage, search, region, sort });
  const totalPages = Math.ceil(total / perPage);
  const regions = getRegions();

  // 공통 파라미터 (page 제외)
  const baseParams = { type, q: search, region, sort };

  res.send(`<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>주택성능등급 조회</title><style>${CSS}</style></head>
<body>
<div class="container">
  <h1>공공주택 <em>주택성능등급</em> 조회 <a class="info-btn" href="javascript:void(0)" onclick="document.getElementById('infoModal').classList.add('show')">?</a></h1>
  <p class="desc">입주자모집공고 PDF에서 소음·구조·환경 등급을 자동 추출합니다 (${total}건)</p>

  <div class="modal-overlay" id="infoModal" onclick="if(event.target===this)this.classList.remove('show')">
    <div class="modal">
      <button class="close-btn" onclick="document.getElementById('infoModal').classList.remove('show')">&times;</button>
      <h2>주택성능등급이란?</h2>
      <p>「주택법」 제39조에 따라 1,000세대 이상 공동주택을 공급할 때, 입주자모집공고에 <strong>주택성능등급</strong>을 의무적으로 표시해야 합니다.</p>
      <p>각 항목은 <strong>1등급(최저)~4등급(최고)</strong>으로 평가되며, 별(★) 개수로 표시됩니다.</p>
      <div class="grade-example">
        <span class="stars">★★★★</span> = 4등급(최고) &nbsp;&nbsp;
        <span class="stars" style="color:#e74c3c">★☆☆☆</span> = 1등급(최저)
      </div>

      <h3>소음 관련 등급</h3>
      <ul>
        <li><strong>경량충격음</strong> — 윗집 걸음소리 등 가벼운 충격음 차단 성능</li>
        <li><strong>중량충격음</strong> — 윗집 뛰는 소리 등 무거운 충격음 차단 성능</li>
        <li><strong>경계벽 차음</strong> — 옆집과의 벽 차음 성능</li>
        <li><strong>교통소음</strong> — 도로·철도 소음 차단 성능</li>
        <li><strong>급배수 소음</strong> — 화장실 배수관 소음 차단 성능</li>
      </ul>

      <h3>구조 관련 등급</h3>
      <ul>
        <li><strong>내구성</strong> — 건물 구조체의 내구 연한</li>
        <li><strong>가변성</strong> — 내부 벽체 변경 용이성</li>
        <li><strong>수리용이성</strong> — 설비 교체·보수의 편의성</li>
      </ul>

      <h3>환경 관련 등급</h3>
      <p>에너지 성능, 신재생에너지, 친환경 자재, 녹지율, 실내공기질 등 녹색건축 인증 항목</p>

      <h3>생활환경 등급</h3>
      <p>보행자 도로, 대중교통, 자전거 시설, 커뮤니티 공간, 사회적 약자 배려 등</p>

      <h3>화재·소방 등급</h3>
      <p>감지·경보설비, 제연설비, 내화성능, 피난거리, 피난설비 등</p>

      <p style="margin-top:16px;padding-top:12px;border-top:1px solid #eee;color:#999;font-size:12px;">
        이 서비스는 마이홈포털(myhome.go.kr)의 입주자모집공고 PDF에서 성능등급 테이블을 자동 추출하여 보여줍니다.
      </p>
    </div>
  </div>

  <form class="search-bar" action="/" method="get">
    <input type="text" name="q" placeholder="단지명 검색 (예: 부천대장, 왕숙)" value="${esc(search)}">
    ${type !== 'all' ? `<input type="hidden" name="type" value="${esc(type)}">` : ''}
    ${region ? `<input type="hidden" name="region" value="${esc(region)}">` : ''}
    ${sort !== 'date' ? `<input type="hidden" name="sort" value="${sort}">` : ''}
    <button type="submit">검색</button>
    ${search ? `<a href="${buildQuery({ ...baseParams, q: '' })}" style="padding:10px;color:#999;text-decoration:none;">초기화</a>` : ''}
  </form>

  <div class="tabs">
    <a href="${buildQuery({ ...baseParams, type: 'all', page: 1 })}" class="${type === 'all' ? 'active' : ''}">전체</a>
    <a href="${buildQuery({ ...baseParams, type: 'sale', page: 1 })}" class="${type === 'sale' ? 'active' : ''}">공공분양</a>
    <a href="${buildQuery({ ...baseParams, type: 'rent', page: 1 })}" class="${type === 'rent' ? 'active' : ''}">공공임대</a>
  </div>

  <div class="region-filter">
    <a href="${buildQuery({ ...baseParams, region: '', page: 1 })}" class="${!region ? 'active' : ''}">전체 지역</a>
    ${regions.map(r => `<a href="${buildQuery({ ...baseParams, region: r, page: 1 })}" class="${region === r ? 'active' : ''}">${esc(r)}</a>`).join('')}
  </div>

  <div class="sort-bar">
    <a href="${buildQuery({ ...baseParams, sort: 'date', page: 1 })}" class="${sort === 'date' ? 'active' : ''}">최신순</a>
    <a href="${buildQuery({ ...baseParams, sort: 'noise', page: 1 })}" class="${sort === 'noise' ? 'active' : ''}">소음등급순</a>
  </div>

  ${announcements.length === 0
    ? '<div class="empty">공고를 불러올 수 없습니다.</div>'
    : announcements.map(a => `
      <div class="card" data-id="${esc(a.pblancId)}" onclick="location.href='/grade/${esc(a.pblancId)}?dp=${esc(a.detailPage)}'">
        <div class="card-header">
          <h3>${esc(a.name)}</h3>
          <span class="badge ${a.category === '분양' ? 'badge-sale' : 'badge-rent'}">${esc(a.category)}</span>
          <span class="badge ${a.status === '모집중' ? 'badge-active' : 'badge-closed'}">${esc(a.status) || '-'}</span>
        </div>
        <div class="card-body">
          <span>${esc(a.region) || '-'}</span>
          <span>${esc(a.supplier) || '-'}</span>
          <span>${esc(a.houseType) || '-'}</span>
          <span>${a.announcementDate ? a.announcementDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3') : '-'}</span>
          <a class="btn btn-compare" href="javascript:void(0)" onclick="event.stopPropagation();toggleCompare('${esc(a.pblancId)}','${esc(a.detailPage)}',this)">비교담기</a>
          ${renderNoisePreview(a.gradeJson)}
        </div>
      </div>
    `).join('')}

  <div class="pagination">
    ${page > 1 ? `<a href="${buildQuery({ ...baseParams, page: page - 1 })}">&larr; 이전</a>` : ''}
    <a class="active">${page} / ${totalPages || 1}</a>
    ${page < totalPages ? `<a href="${buildQuery({ ...baseParams, page: page + 1 })}">다음 &rarr;</a>` : ''}
  </div>
</div>

<div class="compare-bar" id="compareBar">
  <span id="compareCount">0</span>개 선택됨
  <a href="javascript:void(0)" onclick="goCompare()">비교하기</a>
</div>

<script>
let compareList = JSON.parse(sessionStorage.getItem('compare') || '[]');
updateBar();

function toggleCompare(id, dp, el) {
  const idx = compareList.findIndex(c => c.id === id);
  if (idx >= 0) { compareList.splice(idx, 1); el.textContent = '비교담기'; el.classList.remove('selected'); }
  else if (compareList.length < 4) { compareList.push({id, dp}); el.textContent = '선택됨'; el.classList.add('selected'); }
  else { alert('최대 4개까지 비교 가능합니다'); return; }
  sessionStorage.setItem('compare', JSON.stringify(compareList));
  updateBar();
}
function updateBar() {
  document.getElementById('compareCount').textContent = compareList.length;
  document.getElementById('compareBar').style.display = compareList.length > 0 ? 'block' : 'none';
  // 버튼 상태 복원
  document.querySelectorAll('.btn-compare').forEach(el => {
    const card = el.closest('.card');
    if (!card) return;
    const id = card.dataset.id;
    if (id && compareList.some(c => c.id === id)) { el.textContent = '선택됨'; el.classList.add('selected'); }
  });
}
function goCompare() {
  if (compareList.length < 2) { alert('2개 이상 선택해주세요'); return; }
  const params = compareList.map(c => c.id + ':' + c.dp).join(',');
  location.href = '/compare?ids=' + params;
}
</script>
</body></html>`);
});

// === 성능등급 상세 ===
app.get('/grade/:pblancId', async (req, res) => {
  const { pblancId } = req.params;
  const detailPage = req.query.dp || 'LttotHouse';

  res.write(`<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>주택성능등급 상세</title><style>${CSS}</style></head>
<body><div class="container">
  <a class="back" href="/">&larr; 목록으로</a>
  <div class="loading-msg" id="status">PDF 다운로드 및 분석 중...</div>
`);

  try {
    const grades = await loadGrade(pblancId, detailPage);

    if (!grades) {
      const ann = getAnnouncement(pblancId);
      const name = ann?.name || '';
      const cached = getGrade(pblancId);
      const pdfName = cached?.pdfName || '';
      const checkText = name + ' ' + pdfName;
      const reExclude = ['예비입주자', '잔여세대', '선착순', '수시모집', '입주자격완화', '동호지정', '추가모집'];
      const matched = reExclude.find(kw => checkText.includes(kw));
      let reason = '이 공고의 PDF에서 주택성능등급 정보를 찾을 수 없습니다.';
      if (matched) {
        reason = `이 공고는 <strong>${esc(matched)}</strong> 공고로, 주택성능등급은 최초 입주자모집공고에만 포함됩니다.`;
      }
      res.end(`<script>document.getElementById("status").innerHTML='<div class="no-grade-msg"><p>${esc(name)}</p><p class="reason">${reason}</p></div>';</script></div></body></html>`);
      return;
    }

    let html = '<script>document.getElementById("status").style.display="none";</script>';
    html += `<h1>${esc(grades._name) || '주택성능등급'}</h1>`;
    html += `<div class="desc">PDF에서 추출한 주택성능등급 정보 <a class="btn-download" href="/pdf/${esc(pblancId)}?dp=${esc(detailPage)}" target="_blank">PDF 원문 다운로드</a></div>`;
    html += renderGradeSections(grades);
    res.end(html + '</div></body></html>');
  } catch (err) {
    res.end(`<div class="error-msg">오류: ${esc(err.message)}</div></div></body></html>`);
  }
});

// === 비교 페이지 ===
app.get('/compare', async (req, res) => {
  const ids = (req.query.ids || '').split(',').filter(Boolean).map(s => {
    const [id, dp] = s.split(':');
    return { id, dp: dp || 'LttotHouse' };
  });

  if (ids.length < 2) {
    res.send('2개 이상 선택해주세요. <a href="/">돌아가기</a>');
    return;
  }

  res.write(`<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>성능등급 비교</title><style>${CSS}</style></head>
<body><div class="container">
  <a class="back" href="/">&larr; 목록으로</a>
  <h1>주택성능등급 <em>비교</em></h1>
  <div class="loading-msg" id="status">PDF 분석 중... (${ids.length}개)</div>
`);

  try {
    const rawGrades = await Promise.all(ids.map(({ id, dp }) => loadGrade(id, dp).catch(() => null)));

    // 성능등급이 없는 공고 필터
    const validIdx = [];
    const allGrades = [];
    const names = [];
    rawGrades.forEach((g, i) => {
      if (g) {
        validIdx.push(i);
        allGrades.push(g);
        // PDF 파일명에서 간결한 단지명 추출
        const raw = g._name || '알 수 없음';
        const short = raw
          .replace(/입주자모집공고문?\(최종\)/, '')
          .replace(/입주자모집\s*공고/, '')
          .replace(/\(공공분양\)/, '')
          .replace(/\.pdf$/i, '')
          .trim();
        names.push(esc(short || raw.substring(0, 20)));
      }
    });

    if (allGrades.length < 2) {
      const msg = allGrades.length === 0
        ? '선택한 공고에서 주택성능등급 정보를 찾을 수 없습니다.'
        : '비교하려면 성능등급이 있는 공고가 2개 이상 필요합니다. (1개만 조회됨)';
      res.end(`<script>document.getElementById("status").innerHTML="${msg}";</script>
        <div style="text-align:center;margin-top:20px"><a class="btn" href="/">목록으로 돌아가기</a></div></div></body></html>`);
      return;
    }

    let html = '<script>document.getElementById("status").style.display="none";</script>';

    const sections = [
      { key: '소음관련등급', title: '소음 관련 등급', cls: 'noise' },
      { key: '구조관련등급', title: '구조 관련 등급', cls: 'structure' },
      { key: '환경관련등급', title: '환경 관련 등급', cls: 'env' },
      { key: '생활환경등급', title: '생활환경 등급', cls: 'living' },
      { key: '화재·소방등급', title: '화재·소방 등급', cls: 'fire' },
    ];

    for (const sec of sections) {
      const allKeys = new Set();
      allGrades.forEach(g => {
        if (g?.[sec.key]) Object.keys(g[sec.key]).forEach(k => allKeys.add(k));
      });
      if (allKeys.size === 0) continue;

      html += `<div class="section-title ${sec.cls}" style="border-radius:12px 12px 0 0; margin-top:20px;">${sec.title}</div>`;
      html += '<div class="compare-table-wrap"><table class="compare-table"><tr><th style="text-align:left">항목</th>';
      names.forEach(n => { html += `<th>${n}</th>`; });
      html += '</tr>';

      for (const key of allKeys) {
        const values = allGrades.map(g => g?.[sec.key]?.[key] ?? '-');
        const numericValues = values.filter(v => typeof v === 'number');
        const maxVal = numericValues.length > 0 ? Math.max(...numericValues) : -1;

        html += '<tr>';
        const isNoise = sec.key === '소음관련등급';
        const isLow = isNoise && numericValues.some(v => v <= 1);
        html += `<td${isLow ? ' class="warn"' : ''}>${key}</td>`;
        values.forEach(v => {
          const isBest = typeof v === 'number' && v === maxVal && numericValues.length > 1;
          html += `<td class="${isBest ? 'best' : ''}">${renderStars(v, isNoise)}</td>`;
        });
        html += '</tr>';
      }
      html += '</table></div>';
    }

    res.end(html + '</div></body></html>');
  } catch (err) {
    res.end(`<div class="error-msg">오류: ${esc(err.message)}</div></div></body></html>`);
  }
});

// === PDF 다운로드 프록시 ===
app.get('/pdf/:pblancId', async (req, res) => {
  const { pblancId } = req.params;
  const detailPage = req.query.dp || 'LttotHouse';

  try {
    const pdfFiles = await fetchPdfInfo(pblancId, detailPage);
    if (pdfFiles.length === 0) {
      res.status(404).send('PDF를 찾을 수 없습니다.');
      return;
    }
    const targetPdf = pdfFiles.find(f => f.fileName.includes('공고')) || pdfFiles[0];
    const pdfBuffer = await downloadPdf(targetPdf.atchFileId, targetPdf.fileSn);

    const fileName = encodeURIComponent(targetPdf.fileName);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${fileName}`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).send('PDF 다운로드 실패: ' + esc(err.message));
  }
});

// === 공통 로직 ===
async function loadGrade(pblancId, detailPage) {
  // DB에서 먼저 조회
  const cached = getGrade(pblancId);
  if (cached && cached.grades) {
    cached.grades._name = cached.pdfName?.replace('.pdf', '') || '';
    return cached.grades;
  }
  if (cached) return null; // 이미 파싱했지만 성능등급 없음

  // DB에 없으면 실시간 파싱
  const pdfFiles = await fetchPdfInfo(pblancId, detailPage);
  if (pdfFiles.length === 0) {
    saveGrade(pblancId, '', null);
    return null;
  }

  const targetPdf = pdfFiles.find(f => f.fileName.includes('공고')) || pdfFiles[0];
  const pdfBuffer = await downloadPdf(targetPdf.atchFileId, targetPdf.fileSn);
  const grades = await parsePerformanceGrade(pdfBuffer);

  saveGrade(pblancId, targetPdf.fileName, grades);

  if (grades) {
    grades._name = targetPdf.fileName.replace('.pdf', '');
  }
  return grades;
}

function renderGradeSections(grades) {
  const sectionConfig = [
    { key: '소음관련등급', title: '소음 관련 등급', cls: 'noise' },
    { key: '구조관련등급', title: '구조 관련 등급', cls: 'structure' },
    { key: '환경관련등급', title: '환경 관련 등급', cls: 'env' },
    { key: '생활환경등급', title: '생활환경 등급', cls: 'living' },
    { key: '화재·소방등급', title: '화재·소방 등급', cls: 'fire' },
  ];

  let html = '';
  for (const { key, title, cls } of sectionConfig) {
    const items = grades[key];
    if (!items || Object.keys(items).length === 0) continue;
    const isNoise = key === '소음관련등급';

    html += `<div class="section"><div class="section-title ${cls}">${title}</div><table>`;
    for (const [name, value] of Object.entries(items)) {
      const low = isNoise && typeof value === 'number' && value <= 1;
      html += `<tr class="${low ? 'warn' : ''}"><td>${name}</td><td>${renderStars(value, isNoise)}</td></tr>`;
    }
    html += '</table></div>';
  }
  return html;
}

app.listen(PORT, async () => {
  console.log(`서버 실행: http://localhost:${PORT}`);

  // 시작 시 공고 수집 + PDF 파싱 (백그라운드)
  try {
    await syncAnnouncements();
    await syncGrades(30);
    console.log('[서버] 초기 동기화 완료');
  } catch (e) {
    console.log('[서버] 초기 동기화 실패:', e.message);
  }

  // 1시간마다 새 공고 확인
  setInterval(async () => {
    try {
      await syncAnnouncements();
      await syncGrades(10);
    } catch (e) { /* ignore */ }
  }, 60 * 60 * 1000);
});
