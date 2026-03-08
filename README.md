<div align="center">

# 주택성능등급 조회 서비스

공공주택 입주자모집공고 PDF에서 **주택성능등급**(소음·구조·환경·생활환경·화재소방)을 자동 추출하여 조회·비교하는 서비스

<br>

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg)](https://nodejs.org/)

</div>

<br>

---

<br>

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

<br>

---

<br>

## 기술 스택

| 항목 | 기술 |
| :--- | :--- |
| 런타임 | Node.js + Express |
| PDF 파싱 | pdf-parse |
| HTML 파싱 | cheerio |
| 데이터 저장 | better-sqlite3 (파싱 결과 캐싱) |

<br>

---

<br>

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

<br>

---

<br>

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

<br>

---

<br>

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

<br>

---

<br>

## 기여하기

기여를 환영합니다! 버그 리포트, 기능 제안, PR 모두 감사합니다.

1. 이 저장소를 **Fork** 합니다
2. 새 브랜치를 생성합니다 (`git checkout -b feature/my-feature`)
3. 변경사항을 커밋합니다 (`git commit -m "feat: 새로운 기능 추가"`)
4. 브랜치에 푸시합니다 (`git push origin feature/my-feature`)
5. **Pull Request** 를 생성합니다

<br>

---

<div align="center">

<br>

MIT License

<br>

</div>
