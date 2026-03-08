const {
  fetchAnnouncementList,
  fetchPdfInfo,
  downloadPdf,
  parsePerformanceGrade,
} = require('./scraper');
const { saveAnnouncements, saveGrade, getUnparsedAnnouncements, getGrade } = require('./db');

/**
 * 마이홈포털에서 공고 목록을 수집하여 DB에 저장
 */
async function syncAnnouncements() {
  console.log('[sync] 공고 목록 수집 시작...');
  let total = 0;

  for (const type of ['sale', 'rent']) {
    try {
      const list = await fetchAnnouncementList(1, type);
      if (list.length > 0) {
        saveAnnouncements(list);
        total += list.length;
        console.log(`[sync] ${type}: ${list.length}건 저장`);
      }
    } catch (e) {
      console.log(`[sync] ${type} 수집 실패:`, e.message);
    }
  }

  console.log(`[sync] 공고 총 ${total}건 동기화 완료`);
  return total;
}

/**
 * 아직 파싱하지 않은 공고의 PDF를 다운로드하여 성능등급 파싱
 */
async function syncGrades(limit = 10) {
  const unparsed = getUnparsedAnnouncements();
  const targets = unparsed.slice(0, limit);
  console.log(`[sync] 미파싱 공고 ${unparsed.length}건 중 ${targets.length}건 파싱 시작...`);

  let success = 0;
  let noGrade = 0;

  for (const ann of targets) {
    try {
      const pdfFiles = await fetchPdfInfo(ann.pblancId, ann.detailPage);
      if (pdfFiles.length === 0) {
        saveGrade(ann.pblancId, '', null);
        noGrade++;
        continue;
      }

      const targetPdf = pdfFiles.find(f => f.fileName.includes('공고')) || pdfFiles[0];
      const pdfBuffer = await downloadPdf(targetPdf.atchFileId, targetPdf.fileSn);
      const grades = await parsePerformanceGrade(pdfBuffer);

      saveGrade(ann.pblancId, targetPdf.fileName, grades);

      if (grades) {
        success++;
        console.log(`  [OK] ${ann.name.substring(0, 40)}`);
      } else {
        noGrade++;
        console.log(`  [--] ${ann.name.substring(0, 40)} (성능등급 없음)`);
      }
    } catch (e) {
      console.log(`  [ERR] ${ann.name.substring(0, 40)}: ${e.message}`);
      saveGrade(ann.pblancId, '', null);
      noGrade++;
    }
  }

  console.log(`[sync] 파싱 완료: 성공 ${success}, 등급없음 ${noGrade}`);
  return { success, noGrade };
}

/**
 * 전체 동기화 (공고 수집 + PDF 파싱)
 */
async function fullSync() {
  await syncAnnouncements();
  await syncGrades(50);
}

module.exports = { syncAnnouncements, syncGrades, fullSync };

// 직접 실행 시
if (require.main === module) {
  fullSync().then(() => {
    console.log('[sync] 완료');
    process.exit(0);
  }).catch(e => {
    console.error('[sync] 오류:', e);
    process.exit(1);
  });
}
