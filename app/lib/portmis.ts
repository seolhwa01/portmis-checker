import { XMLParser } from "fast-xml-parser";

const BASE_URL = "https://apis.data.go.kr/1192000/VsslEtrynd5/Info5";

export type DeGb = "I" | "O";

export interface Info5Params {
  prtAgCd: string;
  sde: string;
  ede: string;
  clsgn?: string;
  deGb?: DeGb;
  pageNo?: number;
  numOfRows?: number;
}

export interface DepartureDetail {
  reqstSeNm?: string;
  etryndNm?: string;
  etryptDt?: string;
  tkoffDt?: string;
  tkoffPrrrnDt?: string;
  ibobprtNm?: string;
  laidupFcltyNm?: string;
  tugYn?: string;
  piltgYn?: string;
  grtg?: string;
  intrlGrtg?: string;
  crewCo?: string;
  dstnEtryptDt?: string;
  // M/R No (관리참조번호) — 형식: YY+SCAC(4글자)+항차+I/E
  // 컨테이너선의 경우 거의 100% 채워지며 선사 SCAC를 추출할 수 있음.
  mrNum?: string;
}

export interface DepartureItem {
  prtAgCd?: string;
  prtAgNm?: string;
  etryptYear?: string;
  etryptCo?: string;
  clsgn?: string;
  vsslNm?: string;
  vsslNltyCd?: string;
  vsslNltyNm?: string;
  vsslKndCd?: string;
  vsslKndNm?: string;
  etryptPurpsNm?: string;
  frstDpmprtPrtNm?: string;
  prvsDpmprtPrtNm?: string;
  nxlnptPrtNm?: string;
  dstnPrtNm?: string;
  details?: DepartureDetail[];
}

export interface Info5Response {
  resultCode: string;
  resultMsg: string;
  totalCount: number;
  pageNo: number;
  numOfRows: number;
  items: DepartureItem[];
}

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
});

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export async function fetchInfo5(
  params: Info5Params,
  serviceKey: string,
): Promise<Info5Response> {
  const qs = new URLSearchParams();
  qs.set("serviceKey", serviceKey);
  qs.set("prtAgCd", params.prtAgCd);
  qs.set("sde", params.sde);
  qs.set("ede", params.ede);
  if (params.clsgn) qs.set("clsgn", params.clsgn);
  if (params.deGb) qs.set("deGb", params.deGb);
  qs.set("pageNo", String(params.pageNo ?? 1));
  qs.set("numOfRows", String(params.numOfRows ?? 50));

  // serviceKey가 이미 URL-encoded 형태일 수 있어 이중인코딩 회피
  const url = `${BASE_URL}?${qs.toString().replace(
    /serviceKey=([^&]+)/,
    `serviceKey=${encodeURI(decodeURIComponent(serviceKey))}`,
  )}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Upstream HTTP ${res.status}: ${await res.text()}`);
  }
  const xml = await res.text();
  const parsed: any = parser.parse(xml);

  const root = parsed?.response ?? parsed;
  const header = root?.header ?? {};
  const body = root?.body ?? {};

  const rawItems = toArray<any>(body?.items?.item);
  const items: DepartureItem[] = rawItems.map((it) => ({
    prtAgCd: it.prtAgCd,
    prtAgNm: it.prtAgNm,
    etryptYear: it.etryptYear,
    etryptCo: it.etryptCo,
    clsgn: it.clsgn,
    vsslNm: it.vsslNm,
    vsslNltyCd: it.vsslNltyCd,
    vsslNltyNm: it.vsslNltyNm,
    vsslKndCd: it.vsslKndCd,
    vsslKndNm: it.vsslKndNm,
    etryptPurpsNm: it.etryptPurpsNm,
    frstDpmprtPrtNm: it.frstDpmprtPrtNm,
    prvsDpmprtPrtNm: it.prvsDpmprtPrtNm,
    nxlnptPrtNm: it.nxlnptPrtNm,
    dstnPrtNm: it.dstnPrtNm,
    details: toArray<any>(it.details?.detail).map((d) => ({
      reqstSeNm: d.reqstSeNm,
      etryndNm: d.etryndNm,
      etryptDt: d.etryptDt,
      tkoffDt: d.tkoffDt,
      tkoffPrrrnDt: d.tkoffPrrrnDt,
      ibobprtNm: d.ibobprtNm,
      laidupFcltyNm: d.laidupFcltyNm,
      tugYn: d.tugYn,
      piltgYn: d.piltgYn,
      grtg: d.grtg,
      intrlGrtg: d.intrlGrtg,
      crewCo: d.crewCo,
      dstnEtryptDt: d.dstnEtryptDt,
      mrNum: d.mrNum,
    })),
  }));

  return {
    resultCode: String(header.resultCode ?? ""),
    resultMsg: String(header.resultMsg ?? ""),
    totalCount: Number(body.totalCount ?? 0),
    pageNo: Number(body.pageNo ?? 1),
    numOfRows: Number(body.numOfRows ?? 0),
    items,
  };
}

// Port-MIS 청코드(항구청코드) — 2026-05 기준 전체 37개
export const PORT_AG_CODES: { code: string; name: string }[] = [
  { code: "020", name: "부산" },
  { code: "022", name: "부산신항" },
  { code: "021", name: "감천" },
  { code: "030", name: "인천" },
  { code: "031", name: "평택" },
  { code: "300", name: "대산" },
  { code: "622", name: "광양" },
  { code: "050", name: "경인" },
  { code: "820", name: "울산" },
  { code: "610", name: "목포" },
  { code: "500", name: "군산" },
  { code: "810", name: "마산" },
  { code: "200", name: "동해" },
  { code: "201", name: "삼척" },
  { code: "900", name: "제주" },
  { code: "901", name: "서귀포" },
  { code: "303", name: "당진화력" },
  { code: "304", name: "보령출장소" },
  { code: "501", name: "장항" },
  { code: "503", name: "상왕등도" },
  { code: "601", name: "흑산도" },
  { code: "602", name: "가거항리" },
  { code: "611", name: "완도" },
  { code: "616", name: "대불분실" },
  { code: "617", name: "북항분실" },
  { code: "703", name: "후포" },
  { code: "705", name: "울릉사동" },
  { code: "811", name: "삼천포" },
  { code: "812", name: "옥포" },
  { code: "813", name: "장승포" },
  { code: "814", name: "진해" },
  { code: "815", name: "통영" },
  { code: "816", name: "고현" },
  { code: "817", name: "하동" },
  { code: "902", name: "추자" },
  { code: "903", name: "화순" },
  { code: "034", name: "용기포" },
  { code: "035", name: "연평도" },
  { code: "010", name: "해양수산부" },
];
