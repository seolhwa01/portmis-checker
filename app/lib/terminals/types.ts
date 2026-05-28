export type TerminalCode = string; // tradlinx 코드: BPTC/BIT/PNC/HPNT/PNIT/HJNC/BNCT/...

// tradlinx 터미널코드 → Port-MIS 청코드 매핑 (검증된 값).
// 부산신항은 Port-MIS 022 응답이 비어 020 부산에 통합.
export const TERMINAL_TO_PORT: Record<string, { code: string; name: string }> = {
  BCT: { code: "020", name: "부산" },
  BIT: { code: "020", name: "부산(감만)" },
  BPTC: { code: "020", name: "부산(신선대)" },
  HBCT: { code: "020", name: "부산(감만)" },
  IFPC: { code: "020", name: "부산(여객)" },
  BNCT: { code: "020", name: "부산(신항)" },
  HJNC: { code: "020", name: "부산(신항)" },
  HPNT: { code: "020", name: "부산(신항)" },
  PNC: { code: "020", name: "부산(신항)" },
  PNIT: { code: "020", name: "부산(신항)" },
  HJIT: { code: "030", name: "인천" },
  ICT: { code: "030", name: "인천" },
  SNCT: { code: "030", name: "인천" },
  PNCT: { code: "031", name: "평택" },
  PCTC: { code: "031", name: "평택(PCTC)" },
  // 광양
  GWCT: { code: "622", name: "광양(서부)" },
  KITL: { code: "622", name: "광양(한국국제터미널 KIT)" },
  KIT: { code: "622", name: "광양(국제)" },
  // 울산
  UNCT: { code: "820", name: "울산" },
  JUCT: { code: "820", name: "울산(정일)" },
  // 부산 신규
  BNMT: { code: "020", name: "부산(BNMT)" },
  DGT: { code: "020", name: "부산(동원)" },
  // 대산
  DDCT: { code: "300", name: "대산(동방)" },
};

export interface TerminalScheduleItem {
  terminal: TerminalCode;
  terminalLabel: string;
  berth: string;
  vsslNm: string;
  voyage: string;
  vesselCd?: string;
  operator?: string;
  etb?: string;
  atb?: string;
  etd?: string;
  atd?: string;
  cutoff?: string;
  status?: string;
  raw?: Record<string, string>;
}

export interface TerminalScheduleResponse {
  terminal: TerminalCode;
  fetchedAt: string;
  items: TerminalScheduleItem[];
}

// 선명에 자주 등장하는 한↔영 토큰 매핑.
// Port-MIS는 한글 선명("팬콘 선샤인"), tradlinx는 영문 선명("PANCON SUNSHINE")으로 들어오기 때문에
// 비교 전에 한글 조각을 영문으로 치환한 다음 영숫자만 남겨 정규화한다.
// 긴 토큰을 먼저 두어 부분문자열 충돌(예: "남성" ⊂ "남성호") 회피.
const KO_EN_FRAGMENTS: Array<[string, string]> = [
  // 선사
  ["에이치엠엠", "HMM"],
  ["장금상선", "SINOKOR"],
  ["장금", "SINOKOR"],
  ["흥아라인", "HEUNGA"],
  ["흥아", "HEUNGA"],
  ["고려해운", "KMTC"],
  ["고려", "KMTC"],
  ["남성해운", "NAMSUNG"],
  ["남성", "NAMSUNG"],
  ["동영해운", "DONGYOUNG"],
  ["동영", "DONGYOUNG"],
  ["천경해운", "CK"],
  ["천경", "CK"],
  ["동진상선", "DONGJIN"],
  ["동진", "DONGJIN"],
  ["남송해운", "NAMSUNG"],
  ["남송", "NAMSUNG"],
  ["두우해운", "DOOWOO"],
  ["두우", "DOOWOO"],
  ["태영상선", "TAEYOUNG"],
  ["태영", "TAEYOUNG"],
  ["포스", "POS"],
  ["팬콘", "PANCON"],
  ["현대상선", "HMM"],
  ["현대", "HYUNDAI"],
  ["한진해운", "HANJIN"],
  ["한진", "HANJIN"],
  ["에스엠상선", "SM"],
  ["에스엠", "SM"],
  ["사와스디", "SAWASDEE"],
  ["사와스데", "SAWASDEE"],
  ["완하이", "WANHAI"],
  ["원라인", "ONE"],
  ["엠에스씨", "MSC"],
  ["머스크", "MAERSK"],
  ["에버그린", "EVERGREEN"],
  ["코스코", "COSCO"],
  ["양밍", "YANGMING"],
  ["오오씨엘", "OOCL"],
  ["씨엠에이", "CMA"],
  // 도시 / 항구
  ["상하이", "SHANGHAI"],
  ["베이징", "BEIJING"],
  ["칭다오", "QINGDAO"],
  ["톈진", "TIANJIN"],
  ["다롄", "DALIAN"],
  ["닝보", "NINGBO"],
  ["광저우", "GUANGZHOU"],
  ["선전", "SHENZHEN"],
  ["샤먼", "XIAMEN"],
  ["옌타이", "YANTAI"],
  ["다이렌", "DALIAN"],
  ["홍콩", "HONGKONG"],
  ["도쿄", "TOKYO"],
  ["오사카", "OSAKA"],
  ["요코하마", "YOKOHAMA"],
  ["고베", "KOBE"],
  ["후쿠오카", "FUKUOKA"],
  ["하카타", "HAKATA"],
  ["모지", "MOJI"],
  ["시미즈", "SHIMIZU"],
  ["나고야", "NAGOYA"],
  ["호치민", "HOCHIMINH"],
  ["하이퐁", "HAIPHONG"],
  ["방콕", "BANGKOK"],
  ["람차방", "LAEMCHABANG"],
  ["마닐라", "MANILA"],
  ["자카르타", "JAKARTA"],
  ["수라바야", "SURABAYA"],
  ["싱가포르", "SINGAPORE"],
  ["콜롬보", "COLOMBO"],
  ["블라디보스토크", "VLADIVOSTOK"],
  ["부산신항", "BUSAN"],
  ["부산", "BUSAN"],
  ["인천", "INCHEON"],
  ["광양", "GWANGYANG"],
  ["평택", "PYEONGTAEK"],
  ["울산", "ULSAN"],
  // 일반 어휘
  ["선샤인", "SUNSHINE"],
  ["로즈", "ROSE"],
  ["펄", "PEARL"],
  ["스타", "STAR"],
  ["드래곤", "DRAGON"],
  ["골든", "GOLDEN"],
  ["골드", "GOLD"],
  ["이글", "EAGLE"],
  ["오션", "OCEAN"],
  ["글로리", "GLORY"],
  ["빅토리", "VICTORY"],
  ["비너스", "VENUS"],
  ["주피터", "JUPITER"],
  ["머큐리", "MERCURY"],
  ["파이오니어", "PIONEER"],
  ["네비게이터", "NAVIGATOR"],
  ["익스프레스", "EXPRESS"],
  ["챔피언", "CHAMPION"],
  ["석세스", "SUCCESS"],
  ["하모니", "HARMONY"],
  ["브릿지", "BRIDGE"],
  ["브리지", "BRIDGE"],
  ["타이거", "TIGER"],
  ["라이언", "LION"],
  ["피닉스", "PHOENIX"],
  ["퍼시픽", "PACIFIC"],
  ["애틀란틱", "ATLANTIC"],
  ["오리엔트", "ORIENT"],
  ["오리엔탈", "ORIENTAL"],
  ["글로벌", "GLOBAL"],
  ["로얄", "ROYAL"],
  ["로열", "ROYAL"],
  ["뉴", "NEW"],
];

export function translateKoreanVesselFragments(s: string): string {
  let out = s;
  for (const [ko, en] of KO_EN_FRAGMENTS) {
    if (out.includes(ko)) out = out.split(ko).join(en);
  }
  return out;
}

export function normalizeVesselName(s?: string) {
  const translated = translateKoreanVesselFragments(s ?? "");
  // 한글 음절(가-힯)도 보존 — 미매핑 한글이 strip 되면
  // "스타크리퍼" → "STAR" 처럼 단편만 남아 다른 영문선명과 오매칭됨.
  return translated
    .toUpperCase()
    .replace(/[^A-Z0-9가-힯]/g, "")
    .trim();
}

// 선명을 의미있는 토큰 단위로 분해. 한글→영문 치환 후 공백/특수문자 기준 split.
// 너무 일반적이거나 짧은 토큰은 stop-list 로 제외해 오매칭(MV, NEW 등)을 줄인다.
const TOKEN_STOPLIST = new Set([
  "MV", "M/V", "MS", "M/S", "SS", "THE", "OF", "AND", "NEW", "OLD",
  "NO", "NO.", "호", "V", "II", "III", "IV",
]);

export function tokenizeVesselName(s?: string): string[] {
  if (!s) return [];
  const translated = translateKoreanVesselFragments(s);
  return translated
    .toUpperCase()
    .split(/[^A-Z0-9가-힯]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4 && !TOKEN_STOPLIST.has(t) && !/^\d+$/.test(t));
}

export function normalizeDt(s?: string) {
  if (!s) return undefined;
  const m = s.match(/(\d{4})[/-]?(\d{2})[/-]?(\d{2})[ T]?(\d{2}):?(\d{2})/);
  if (!m) return s.trim() || undefined;
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
}
