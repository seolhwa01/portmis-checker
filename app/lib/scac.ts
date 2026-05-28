// Port-MIS mrNum 에서 추출되는 4자리 SCAC(선사코드)와 선사 표기 매핑.
// mrNum 형식: YY + SCAC(4자) + 항차 + I/E
// 예: 26SNKO1822I → 2026 / SINOKOR / 1822 / Inbound
//
// 컨테이너선 데이터에서 100%에 가깝게 채워지므로 "같은 선사" 식별의
// 단단한 키로 사용 가능.

const SCAC_TO_CARRIER: Record<string, string> = {
  // 한국 선사
  SNKO: "SINOKOR (장금상선)",
  KMTC: "KMTC (고려해운)",
  HHSL: "흥아라인 (HEUNG-A)",
  CKCO: "CK Line (천경)",
  POBU: "POS Line (포스)",
  HMMU: "HMM",
  HDMU: "HMM (구 현대상선)",
  PNCO: "PANCON (팬콘)",
  // 외국 메이저
  MAEU: "Maersk",
  EVER: "Evergreen",
  MSCU: "MSC",
  CMDU: "CMA CGM",
  YMLU: "Yang Ming",
  OOLU: "OOCL",
  ONEU: "ONE (Ocean Network Express)",
  COSU: "COSCO",
  ZIMU: "ZIM",
  HLCU: "Hapag-Lloyd",
  WHLC: "Wan Hai Lines",
  SITC: "SITC",
  SCLK: "SCL Korea",
  EAS:  "EAS Shipping",
  EASU: "EAS Shipping",
  COHE: "COSCO Heung-A",
};

// mrNum → { year, scac, voyage, dir }
export interface ParsedMrNum {
  year: string;
  scac: string;
  voyage: string;
  dir: "I" | "E" | "";
  raw: string;
}

export function parseMrNum(mr?: string): ParsedMrNum | null {
  if (!mr) return null;
  // 표준 형식: YY + SCAC(4글자) + 항차 + I/E.
  // SCAC는 거의 4자 고정이라 정규식도 4자 고정해야 한다.
  // 욕심부려 {2,5}로 두면 POBUKW85I → POBUK + W85 로 잘못 파싱됨.
  const m = mr.match(/^(\d{2})([A-Z]{4})(.+?)([IE])$/);
  if (!m) return null;
  return { year: m[1], scac: m[2], voyage: m[3], dir: m[4] as "I" | "E", raw: mr };
}

// 추가: 표준 4자 SCAC 외에 자주 보이는 카리어 코드 매핑 (Glovis 등)
const SCAC_TO_CARRIER_EXT: Record<string, string> = {
  GLVS: "Glovis (현대글로비스)",
  SMLM: "SM Line",
  GMSK: "GMSK",
};

export function carrierFromScac(scac?: string | null): string | null {
  if (!scac) return null;
  return SCAC_TO_CARRIER[scac] ?? SCAC_TO_CARRIER_EXT[scac] ?? null;
}

// 선명에서 선사 추정 (tradlinx 쪽엔 SCAC가 없으므로 이름으로 역추적).
// 매칭 강화에 사용.
const NAME_PREFIX_TO_SCAC: Array<[RegExp, string]> = [
  [/^SINOKOR\b|^장금/i, "SNKO"],
  [/^KMTC\b|^고려/i, "KMTC"],
  [/^HEUNG[- ]?A\b|^흥아/i, "HHSL"],
  [/^CK\s|^천경/i, "CKCO"],
  [/^POS\s|^포스/i, "POBU"],
  [/^HMM\s/i, "HMMU"],
  [/^PANCON\b|^팬콘/i, "PNCO"],
  [/^MAERSK\b/i, "MAEU"],
  [/^EVER\b|^EVERGREEN\b/i, "EVER"],
  [/^MSC\s/i, "MSCU"],
  [/^CMA\s|^CMA CGM\b/i, "CMDU"],
  [/^YM\s|^YANG MING\b/i, "YMLU"],
  [/^OOCL\b/i, "OOLU"],
  [/^ONE\s/i, "ONEU"],
  [/^COSCO\b/i, "COSU"],
  [/^WAN HAI\b|^완하이/i, "WHLC"],
  [/^SITC\b/i, "SITC"],
  [/^SAWASDEE\b/i, ""], // 사와스디는 대주(Interasia/소속선) 다양 → SCAC 통일 X
];

export function inferScacFromName(name?: string): string | null {
  if (!name) return null;
  for (const [re, scac] of NAME_PREFIX_TO_SCAC) {
    if (re.test(name) && scac) return scac;
  }
  return null;
}
