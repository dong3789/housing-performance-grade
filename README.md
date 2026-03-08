# floor-noise-mcp

공공주택 입주자모집공고 PDF에서 **주택성능등급**(소음·구조·환경·생활환경·화재소방)을 자동 추출하여 조회·비교하는 서비스

## 동작 방식

```
마이홈포털 (myhome.go.kr)
    │
    ├─ AJAX API로 공고 목록 수집 (분양 + 임대)
    │   POST /hws/portal/sch/selectLttotHouseList.do  (분양)
    │   POST /hws/portal/sch/selectRsdtRcritNtcList.do (임대)
    │
    ├─ 공고 상세 페이지에서 PDF 첨부파일 ID 추출
    │   GET /hws/portal/sch/select*DetailView.do?pblancId=XXX
    │
    ├─ PDF 다운로드
    │   POST /hws/com/fms/cvplFileDownload.do
    │
    └─ PDF 텍스트 파싱 → "주택성능등급의 표시" 테이블 추출
        ├─ ★ 개수로 등급 판별 (1~4등급)
        └─ SQLite DB에 저장
```

## 기술 스택

- **Node.js** + Express
- **pdf-parse** — PDF 텍스트 추출
- **cheerio** — HTML 파싱
- **better-sqlite3** — 데이터 저장 (파싱 결과 캐싱)

## 설치 및 실행

```bash
npm install

# 1) 초기 데이터 수집 (공고 수집 + PDF 파싱)
node src/sync.js

# 2) 웹 서버 실행
node src/server.js
# → http://localhost:3456
```

서버 시작 시 자동으로 새 공고를 수집하고, 1시간마다 업데이트합니다.

## 주요 기능

### 공고 목록 (`/`)
- 분양 / 임대 탭 필터
- 페이지네이션
- 과거(모집완료) 공고 포함

### 성능등급 상세 (`/grade/:pblancId`)
- PDF에서 추출한 5개 카테고리 등급 표시
  - 소음 관련 등급 (경량충격음, 중량충격음, 경계벽 차음, 교통소음, 급배수 소음)
  - 구조 관련 등급
  - 환경 관련 등급
  - 생활환경 등급
  - 화재·소방 등급
- 소음 ★1개(최저) 항목은 빨간색 경고 표시

### 단지 비교 (`/compare`)
- 2~4개 단지를 선택하여 성능등급 나란히 비교
- 최고 등급 항목 초록색 하이라이트

## 프로젝트 구조

```
src/
├── scraper.js  — 마이홈포털 스크래핑 + PDF 파싱 로직
├── db.js       — SQLite DB 스키마 및 쿼리
├── sync.js     — 공고 수집 + PDF 파싱 배치
├── server.js   — Express 웹 서버
└── index.js    — 단독 테스트 스크립트

data.db         — SQLite 데이터 파일 (자동 생성)
```

## 한계

- 마이홈포털 비공식 API 사용 → 구조 변경 시 깨질 수 있음
- PDF 포맷이 공고마다 다를 수 있어 파싱 실패 가능
- 일부 PDF는 이미지 기반이라 텍스트 추출 불가
