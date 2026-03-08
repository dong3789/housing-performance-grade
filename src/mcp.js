const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { getAnnouncementsWithGrades, getGrade, getRegions, getAnnouncement } = require('./db');
const { syncAnnouncements, syncGrades } = require('./sync');

const server = new McpServer({
  name: 'housing-performance-grade',
  version: '1.0.0',
});

// 공고 검색
server.tool(
  'search_announcements',
  '공공주택 입주자모집공고를 검색합니다. 단지명, 지역, 유형(분양/임대)으로 필터링 가능합니다.',
  {
    query: z.string().optional().describe('단지명 검색어 (예: 부천대장, 왕숙)'),
    region: z.string().optional().describe('지역 필터 (예: 서울, 경기)'),
    type: z.enum(['all', 'sale', 'rent']).optional().describe('유형: all(전체), sale(분양), rent(임대)'),
    page: z.number().optional().describe('페이지 번호 (기본 1)'),
    sort: z.enum(['date', 'noise']).optional().describe('정렬: date(최신순), noise(소음점수순)'),
  },
  async ({ query, region, type, page, sort }) => {
    const { rows, total } = getAnnouncementsWithGrades({
      page: page || 1,
      type: type || 'all',
      search: query || '',
      region: region || '',
      sort: sort || 'date',
      perPage: 10,
    });

    const results = rows.map(a => {
      const grade = a.gradeJson ? JSON.parse(a.gradeJson) : null;
      const noiseGrades = grade?.['소음관련등급'] || null;
      return {
        pblancId: a.pblancId,
        name: a.name,
        region: a.region,
        category: a.category,
        supplier: a.supplier,
        announcementDate: a.announcementDate,
        status: a.status,
        noiseGrades,
      };
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ total, page: page || 1, results }, null, 2),
      }],
    };
  },
);

// 성능등급 상세 조회
server.tool(
  'get_performance_grade',
  '특정 공고의 주택성능등급(소음, 구조, 환경, 생활환경, 화재소방)을 조회합니다. ★ 개수가 점수이며 4점이 최고, 1점이 최저입니다.',
  {
    pblancId: z.string().describe('공고 ID (search_announcements 결과의 pblancId)'),
  },
  async ({ pblancId }) => {
    const ann = getAnnouncement(pblancId);
    if (!ann) {
      return { content: [{ type: 'text', text: `공고 ID ${pblancId}를 찾을 수 없습니다.` }] };
    }

    const cached = getGrade(pblancId);
    if (!cached) {
      return { content: [{ type: 'text', text: `${ann.name}: 성능등급이 아직 파싱되지 않았습니다. sync_data를 먼저 실행해주세요.` }] };
    }
    if (!cached.grades) {
      return { content: [{ type: 'text', text: `${ann.name}: 이 공고에는 주택성능등급 정보가 없습니다.` }] };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          name: ann.name,
          region: ann.region,
          category: ann.category,
          announcementDate: ann.announcementDate,
          pdfName: cached.pdfName,
          grades: cached.grades,
        }, null, 2),
      }],
    };
  },
);

// 비교
server.tool(
  'compare_grades',
  '여러 공고의 주택성능등급을 비교합니다. ★ 개수가 점수이며 높을수록 좋습니다(4점 최고, 1점 최저).',
  {
    pblancIds: z.array(z.string()).min(2).max(4).describe('비교할 공고 ID 목록 (2~4개)'),
  },
  async ({ pblancIds }) => {
    const comparisons = [];
    for (const id of pblancIds) {
      const ann = getAnnouncement(id);
      const cached = getGrade(id);
      comparisons.push({
        pblancId: id,
        name: ann?.name || '알 수 없음',
        region: ann?.region || '-',
        grades: cached?.grades || null,
      });
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(comparisons, null, 2),
      }],
    };
  },
);

// 지역 목록
server.tool(
  'list_regions',
  '성능등급이 있는 공고의 지역 목록을 반환합니다.',
  {},
  async () => {
    const regions = getRegions();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(regions),
      }],
    };
  },
);

// 데이터 동기화
server.tool(
  'sync_data',
  '마이홈포털에서 최신 공고를 수집하고 PDF에서 성능등급을 파싱합니다.',
  {
    gradeLimit: z.number().optional().describe('파싱할 최대 공고 수 (기본 10)'),
  },
  async ({ gradeLimit }) => {
    const annCount = await syncAnnouncements();
    const { success, noGrade } = await syncGrades(gradeLimit || 10);
    return {
      content: [{
        type: 'text',
        text: `동기화 완료: 공고 ${annCount}건 수집, 성능등급 ${success}건 파싱 성공, ${noGrade}건 등급 없음`,
      }],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(err => {
  console.error('MCP 서버 오류:', err);
  process.exit(1);
});
