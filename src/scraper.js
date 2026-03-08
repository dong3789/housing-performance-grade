const axios = require('axios');
const cheerio = require('cheerio');
const pdfParse = require('pdf-parse');

const BASE_URL = 'https://www.myhome.go.kr';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

const EXCLUDE_KEYWORDS = [
  '잔여세대', '매각', '전세임대', '예비입주자', '선착순', '동호지정',
  '무순위', '취소', '정정', '변경', '재공고', '재게시', '든든전세', '든든주택',
  '매입임대', '기존주택', '전환', '특별공급', '추가모집', '추가 모집', '공가세대',
  '선착순계약', '수의계약', '자격완화', '예비자', '예비 입주',
];

function isNewConstruction(name) {
  if (!name) return false;
  return !EXCLUDE_KEYWORDS.some(kw => name.includes(kw));
}

function mapItem(item, category, detailPage) {
  return {
    pblancId: item.pblancId,
    name: item.pblancNm,
    region: item.brtcCodeNm,
    supplier: item.suplyInsttNm,
    houseType: item.houseTyNm,
    announcementDate: item.rcritPblancDe,
    status: item.prgrStts,
    atchFileId: item.atchFileId,
    url: item.url,
    category,
    detailPage,
  };
}

/**
 * 공고 목록 조회 (분양 + 임대, 과거 공고 포함)
 */
async function fetchAnnouncementList(page = 1, type = 'all') {
  const results = [];
  const PER_PAGE = 5; // 마이홈포털 고정 페이지 사이즈

  // 여러 마이홈 페이지를 순회하며 신축 공고만 수집
  const targetCount = 20;
  let myhomePage = (page - 1) * 10 + 1; // 우리 page 1 → 마이홈 page 1~10
  let attempts = 0;

  // 공공분양
  if (type === 'all' || type === 'sale') {
    while (results.length < targetCount && attempts < 60) {
      try {
        const { data } = await axios.post(
          `${BASE_URL}/hws/portal/sch/selectLttotHouseList.do`,
          `pageIndex=${myhomePage}`,
          { headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' } },
        );
        if (!data?.resultList?.length) break;
        for (const item of data.resultList) {
          if (item.atchFileId && isNewConstruction(item.pblancNm)) {
            results.push(mapItem(item, '분양', 'LttotHouse'));
          }
        }
      } catch (e) { break; }
      myhomePage++;
      attempts++;
    }
  }

  // 공공임대
  if (type === 'all' || type === 'rent') {
    let rentPage = (page - 1) * 10 + 1;
    attempts = 0;
    while (results.length < targetCount * 2 && attempts < 60) {
      try {
        const { data } = await axios.post(
          `${BASE_URL}/hws/portal/sch/selectRsdtRcritNtcList.do`,
          `pageIndex=${rentPage}&srchSuplyTy=`,
          { headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' } },
        );
        if (!data?.resultList?.length) break;
        for (const item of data.resultList) {
          if (item.atchFileId && isNewConstruction(item.pblancNm)) {
            results.push(mapItem(item, '임대', 'RsdtRcritNtc'));
          }
        }
      } catch (e) { break; }
      rentPage++;
      attempts++;
    }
  }

  // 중복 제거 (같은 pblancId)
  const seen = new Set();
  const unique = results.filter(a => {
    const key = a.category + a.pblancId;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 날짜 최신순 정렬
  unique.sort((a, b) => (b.announcementDate || '').localeCompare(a.announcementDate || ''));
  return unique;
}

/**
 * 공고 상세 페이지에서 PDF 첨부파일 정보 추출
 */
async function fetchPdfInfo(pblancId, detailPage = 'LttotHouse') {
  const viewName = detailPage === 'RsdtRcritNtc' ? 'selectRsdtRcritNtcDetailView' : 'selectLttotHouseDetailView';
  const url = `${BASE_URL}/hws/portal/sch/${viewName}.do?pblancId=${pblancId}`;
  const { data } = await axios.get(url, { headers: HEADERS });
  const $ = cheerio.load(data);

  const pdfFiles = [];

  // fnDownFile('atchFileId', 'fileSn') 패턴 추출
  $('a[href*="fnDownFile"], a[onclick*="fnDownFile"]').each((_, el) => {
    const onclick = $(el).attr('href') || $(el).attr('onclick') || '';
    const match = onclick.match(/fnDownFile\s*\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/);
    const fileName = $(el).text().trim();
    if (match) {
      pdfFiles.push({
        atchFileId: match[1],
        fileSn: match[2],
        fileName,
      });
    }
  });

  // a 태그 내부 텍스트에서도 검색
  if (pdfFiles.length === 0) {
    const scriptContent = data;
    const regex = /fnDownFile\s*\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g;
    let match;
    while ((match = regex.exec(scriptContent)) !== null) {
      pdfFiles.push({
        atchFileId: match[1],
        fileSn: match[2],
        fileName: 'unknown.pdf',
      });
    }
  }

  return pdfFiles;
}

/**
 * PDF 파일 다운로드
 */
async function downloadPdf(atchFileId, fileSn) {
  const url = `${BASE_URL}/hws/com/fms/cvplFileDownload.do`;
  const { data } = await axios.post(url, `atchFileId=${atchFileId}&fileSn=${fileSn}`, {
    headers: {
      ...HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    responseType: 'arraybuffer',
  });
  return Buffer.from(data);
}

/**
 * PDF에서 주택성능등급 테이블 파싱
 */
async function parsePerformanceGrade(pdfBuffer) {
  const { text } = await pdfParse(pdfBuffer);

  // "주택성능등급" ~ "마감자재" 사이 전체를 파싱 대상으로 (생활환경/화재소방이 친환경 섹션에 포함)
  const startIdx = text.indexOf('주택성능등급');
  if (startIdx === -1) return null;

  // 섹션 끝 감지: 여러 종료 키워드 중 가장 가까운 것
  const endKeywords = ['마감자재', '친환경주택의 성능', '분양가상한제', '분양가격의 산정', '택지비 감정'];
  let endIdx = -1;
  for (const kw of endKeywords) {
    const idx = text.indexOf(kw, startIdx + 10);
    if (idx > 0 && (endIdx === -1 || idx < endIdx)) endIdx = idx;
  }
  const section = endIdx > 0
    ? text.substring(startIdx, endIdx)
    : text.substring(startIdx, startIdx + 5000);

  // 텍스트를 줄 단위로 분리하여 항목-등급 쌍 추출
  // PDF 텍스트에서 항목명 다음 줄에 ★ 또는 - 가 나오는 패턴
  const lines = section.split('\n').map(l => l.trim()).filter(Boolean);

  const result = {
    소음관련등급: {},
    구조관련등급: {},
    환경관련등급: {},
    생활환경등급: {},
    '화재·소방등급': {},
  };

  const categoryMap = {
    '소음 관련 등급': '소음관련등급',
    '소음관련 등급': '소음관련등급',
    '소음관련등급': '소음관련등급',
    '구조 관련 등급': '구조관련등급',
    '구조관련 등급': '구조관련등급',
    '구조관련등급': '구조관련등급',
    '환경 관련 등급': '환경관련등급',
    '환경관련 등급': '환경관련등급',
    '환경관련등급': '환경관련등급',
    '생활환경 등급': '생활환경등급',
    '생활환경등급': '생활환경등급',
    '생활 환경 등급': '생활환경등급',
    '화재': '화재·소방등급',
  };

  let currentCategory = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 카테고리 감지
    for (const [key, cat] of Object.entries(categoryMap)) {
      if (line.includes(key)) {
        currentCategory = cat;
        break;
      }
    }

    // 등급 값 라인인지 확인 (★로만 이루어지거나 - 또는 해당없음)
    const isGradeLine = /^[★]+$/.test(line) || line === '-' || line === '해당없음';
    if (isGradeLine && currentCategory && i > 0) {
      // 바로 앞 줄이 항목명
      const itemName = lines[i - 1];
      // 카테고리명, 헤더, 페이지번호 등 제외
      if (!Object.keys(categoryMap).some(k => itemName.includes(k))
          && !itemName.includes('성능부문')
          && !itemName.includes('성능항목')
          && !itemName.includes('성능등급')
          && !/^-\s*\d+/.test(itemName)
          && !/^\d+$/.test(itemName)
          && !/^[- ]+\d+\s*$/.test(itemName)
          && itemName.length > 2) {
        const starCount = (line.match(/★/g) || []).length;
        result[currentCategory][itemName] = starCount > 0 ? starCount : '-';
      }
    }

    // 같은 줄에 항목명과 별이 함께 있는 경우
    const inlineMatch = line.match(/^(.+?)\s*(★+|-|해당없음)\s*$/);
    if (inlineMatch && currentCategory) {
      const itemName = inlineMatch[1].trim();
      // 페이지 번호 패턴 제외
      if (!/^[-\s]*\d+$/.test(itemName) && itemName.length > 2) {
        const value = inlineMatch[2].trim();
        const starCount = (value.match(/★/g) || []).length;
        result[currentCategory][itemName] = starCount > 0 ? starCount : '-';
      }
    }
  }

  const hasAny = Object.values(result).some(cat => Object.keys(cat).length > 0);
  return hasAny ? result : null;
}

module.exports = {
  fetchAnnouncementList,
  fetchPdfInfo,
  downloadPdf,
  parsePerformanceGrade,
};
