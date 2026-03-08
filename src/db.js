const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data.db');
const db = new Database(DB_PATH);

// WAL 모드로 성능 향상
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS announcements (
    pblancId TEXT PRIMARY KEY,
    name TEXT,
    region TEXT,
    supplier TEXT,
    houseType TEXT,
    announcementDate TEXT,
    status TEXT,
    atchFileId TEXT,
    url TEXT,
    category TEXT,
    detailPage TEXT,
    hasGrade INTEGER DEFAULT 0,
    createdAt TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS grades (
    pblancId TEXT PRIMARY KEY,
    pdfName TEXT,
    gradeJson TEXT,
    parsedAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (pblancId) REFERENCES announcements(pblancId)
  );

  CREATE INDEX IF NOT EXISTS idx_ann_date ON announcements(announcementDate DESC);
  CREATE INDEX IF NOT EXISTS idx_ann_grade ON announcements(hasGrade);
`);

const stmts = {
  upsertAnnouncement: db.prepare(`
    INSERT INTO announcements (pblancId, name, region, supplier, houseType, announcementDate, status, atchFileId, url, category, detailPage)
    VALUES (@pblancId, @name, @region, @supplier, @houseType, @announcementDate, @status, @atchFileId, @url, @category, @detailPage)
    ON CONFLICT(pblancId) DO UPDATE SET
      name=excluded.name, region=excluded.region, supplier=excluded.supplier,
      houseType=excluded.houseType, announcementDate=excluded.announcementDate,
      status=excluded.status, atchFileId=excluded.atchFileId, url=excluded.url,
      category=excluded.category, detailPage=excluded.detailPage
  `),

  upsertGrade: db.prepare(`
    INSERT OR REPLACE INTO grades (pblancId, pdfName, gradeJson)
    VALUES (@pblancId, @pdfName, @gradeJson)
  `),

  markHasGrade: db.prepare(`UPDATE announcements SET hasGrade = @hasGrade WHERE pblancId = @pblancId`),

  getGrade: db.prepare(`SELECT * FROM grades WHERE pblancId = @pblancId`),

  getAnnouncement: db.prepare(`SELECT * FROM announcements WHERE pblancId = @pblancId`),

  getUnparsed: db.prepare(`
    SELECT a.* FROM announcements a LEFT JOIN grades g ON a.pblancId = g.pblancId
    WHERE g.pblancId IS NULL AND a.atchFileId IS NOT NULL
    ORDER BY a.announcementDate DESC
  `),
};

function saveAnnouncements(list) {
  const tx = db.transaction((items) => {
    for (const item of items) {
      stmts.upsertAnnouncement.run(item);
    }
  });
  tx(list);
}

function saveGrade(pblancId, pdfName, grades) {
  stmts.upsertGrade.run({ pblancId, pdfName, gradeJson: JSON.stringify(grades) });
  stmts.markHasGrade.run({ pblancId, hasGrade: grades ? 1 : 0 });
}

function _buildWhereAndParams({ type, search, region }) {
  const conditions = ['a.hasGrade = 1'];
  const params = {};

  if (type && type !== 'all') {
    conditions.push('a.category = @category');
    params.category = type === 'sale' ? '분양' : '임대';
  }

  if (search) {
    conditions.push('a.name LIKE @search');
    params.search = `%${search}%`;
  }

  if (region) {
    conditions.push('a.region = @region');
    params.region = region;
  }

  return { where: conditions.join(' AND '), params };
}

function _parseNoiseAvg(gradeJson) {
  try {
    const grades = JSON.parse(gradeJson);
    if (!grades || typeof grades !== 'object') return Infinity;
    const noise = grades['소음관련등급'];
    if (!noise || typeof noise !== 'object') return Infinity;
    const values = Object.values(noise).filter(v => typeof v === 'number');
    if (values.length === 0) return Infinity;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  } catch {
    return Infinity;
  }
}

function getAnnouncementsWithGrades({ page = 1, type = 'all', perPage = 20, search = '', region = '', sort = 'date' } = {}) {
  const { where, params } = _buildWhereAndParams({ type, search, region });

  // Count query
  const countSql = `SELECT COUNT(*) as cnt FROM announcements a WHERE ${where}`;
  const { cnt: total } = db.prepare(countSql).get(params);

  if (sort === 'noise') {
    // For noise sort, fetch all matching rows with grades, sort in JS, then paginate
    const dataSql = `
      SELECT a.*, g.gradeJson
      FROM announcements a
      LEFT JOIN grades g ON a.pblancId = g.pblancId
      WHERE ${where}
      ORDER BY a.announcementDate DESC
    `;
    const allRows = db.prepare(dataSql).all(params);

    allRows.sort((a, b) => {
      const avgA = _parseNoiseAvg(a.gradeJson);
      const avgB = _parseNoiseAvg(b.gradeJson);
      return avgA - avgB;
    });

    const offset = (page - 1) * perPage;
    const rows = allRows.slice(offset, offset + perPage);
    return { rows, total };
  }

  // Default: sort by date
  const offset = (page - 1) * perPage;
  Object.assign(params, { limit: perPage, offset });

  const dataSql = `
    SELECT a.*, g.gradeJson
    FROM announcements a
    LEFT JOIN grades g ON a.pblancId = g.pblancId
    WHERE ${where}
    ORDER BY a.announcementDate DESC
    LIMIT @limit OFFSET @offset
  `;
  const rows = db.prepare(dataSql).all(params);
  return { rows, total };
}

function getRegions() {
  const rows = db.prepare(`
    SELECT DISTINCT region FROM announcements WHERE hasGrade = 1 AND region IS NOT NULL
  `).all();
  const REGION_ORDER = [
    '서울', '경기', '인천',
    '부산', '대구', '대전', '광주', '울산', '세종',
  ];
  function regionPriority(name) {
    const idx = REGION_ORDER.findIndex(prefix => name.startsWith(prefix));
    return idx >= 0 ? idx : REGION_ORDER.length;
  }
  return rows.map(r => r.region).sort((a, b) => {
    const diff = regionPriority(a) - regionPriority(b);
    if (diff !== 0) return diff;
    return a.localeCompare(b, 'ko');
  });
}

function getGrade(pblancId) {
  const row = stmts.getGrade.get({ pblancId });
  if (!row) return null;
  return { pdfName: row.pdfName, grades: JSON.parse(row.gradeJson) };
}

function getAnnouncement(pblancId) {
  return stmts.getAnnouncement.get({ pblancId });
}

function getUnparsedAnnouncements() {
  return stmts.getUnparsed.all();
}

module.exports = {
  saveAnnouncements,
  saveGrade,
  getAnnouncementsWithGrades,
  getAnnouncement,
  getGrade,
  getRegions,
  getUnparsedAnnouncements,
};
