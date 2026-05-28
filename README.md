# Port-MIS 출항 확인

해양수산부 **선박운항정보 OpenAPI** (`apis.data.go.kr/1192000/VsslEtrynd5/Info5`)를 호출해 호출부호·청코드·기간으로 선박 입출항 신고 정보를 조회합니다.

## 빠른 시작

```powershell
# 1. 의존성 설치
npm install

# 2. 인증키 설정
Copy-Item .env.local.example .env.local
# .env.local 을 열어 PORTMIS_SERVICE_KEY 값을 data.go.kr 발급 키로 교체

# 3. 개발 서버 실행
npm run dev
```

브라우저에서 http://localhost:3000 접속.

## 동작 개요

- `app/api/info5/route.ts` — 서버측 프록시. `PORTMIS_SERVICE_KEY`는 브라우저에 노출되지 않음.
- `app/lib/portmis.ts` — XML 응답 파싱 + 타입 정의.
- `app/page.tsx` — 청코드 / 호출부호 / 기간 / 입출항 기준 입력 → 결과 테이블.

## 인증키 이중인코딩 주의

data.go.kr가 발급하는 키는 *Encoding* / *Decoding* 두 형태가 있는데, `URLSearchParams`로 그대로 넣으면 이미 인코딩된 키가 한 번 더 인코딩되어 `SERVICE_KEY_NOT_REGISTERED_ERROR` 가 발생합니다. `lib/portmis.ts` 의 `fetchInfo5` 가 `encodeURI(decodeURIComponent(...))` 로 둘 다 안전하게 처리합니다.
