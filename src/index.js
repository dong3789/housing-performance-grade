const {
  fetchAnnouncementList,
  fetchPdfInfo,
  downloadPdf,
  parsePerformanceGrade,
} = require('./scraper');

async function main() {
  console.log('=== 마이홈포털 입주자모집공고 스크래핑 테스트 ===\n');

  // 1. 공고 목록 조회
  console.log('[1] 공고 목록 조회 중...');
  const announcements = await fetchAnnouncementList();
  console.log(`  → ${announcements.length}건 조회됨`);

  if (announcements.length === 0) {
    console.log('  공고를 찾지 못했습니다. 페이지 구조 확인 필요.');
    return;
  }

  for (const ann of announcements.slice(0, 3)) {
    console.log(`  - [${ann.pblancId}] ${ann.name}`);
  }

  // 2. 과천주암 C1블록 공고로 테스트 (주택성능등급이 있는 공고)
  const testId = '1333';
  console.log(`\n[2] 테스트 공고 상세 조회 (pblancId=${testId})`);
  const pdfFiles = await fetchPdfInfo(testId);
  console.log(`  → PDF ${pdfFiles.length}건 발견`);
  for (const pdf of pdfFiles) {
    console.log(`  - ${pdf.fileName} (${pdf.atchFileId}/${pdf.fileSn})`);
  }

  if (pdfFiles.length === 0) {
    console.log('  PDF를 찾지 못했습니다.');
    return;
  }

  // 3. PDF 다운로드
  const targetPdf = pdfFiles.find(f => f.fileName.includes('공고')) || pdfFiles[0];
  console.log(`\n[3] PDF 다운로드: ${targetPdf.fileName}`);
  const pdfBuffer = await downloadPdf(targetPdf.atchFileId, targetPdf.fileSn);
  console.log(`  → ${(pdfBuffer.length / 1024).toFixed(1)}KB 다운로드 완료`);

  // 4. 주택성능등급 파싱
  console.log('\n[4] 주택성능등급 파싱 중...');
  const grades = await parsePerformanceGrade(pdfBuffer);

  if (grades) {
    console.log('\n=== 주택성능등급 결과 ===');
    console.log(JSON.stringify(grades, null, 2));
  } else {
    console.log('  주택성능등급 정보를 찾지 못했습니다.');
    console.log('  (PDF에 해당 섹션이 없거나 파싱 패턴이 맞지 않을 수 있습니다)');
  }
}

main().catch(err => {
  console.error('에러 발생:', err.message);
});
