// tradlinx 컨테이너 터미널 스케줄 페이지 HTML 스크래핑.
// /terminal-work API는 16개 터미널만 반환하지만 페이지 SSR HTML에는 22개 + IMO/MMSI/ITU 호출부호 풍부.
// 페이지 응답엔 React Server Components payload 형식으로 데이터가 임베드됨 (&q; = ", &l; = <, &g; = >).
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_URL = "https://www.tradlinx.com/ko/container-terminal-schedule";
const TTL_MS = 3 * 60 * 1000;

export interface RichTerminalVessel {
  terminal: string;
  terminalNm: string;
  terminalUrl?: string;
  portCd?: string;
  portNm?: string;
  vesselNm: string;
  vesselCall?: string; // tradlinx voyage code (DPGC-017/2026 etc.)
  berthNo?: string;
  berthnDtm?: string; // ATB (실제접안)
  closingDtm?: string; // cutoff
  depDtm?: string; // ATD (실제출항)
  operator?: string;
  vesselId?: number;
  imoNo?: string;
  mmsi?: string;
  callSign?: string; // ITU 호출부호 — Port-MIS clsgn과 직접 매칭 가능
  status?: string;
  lodCnt?: number;
  disCnt?: number;
}

let cache: { at: number; data: RichTerminalVessel[] } | null = null;

function decodeRSCEscapes(s: string): string {
  return s
    .replaceAll("&q;", '"')
    .replaceAll("&l;", "<")
    .replaceAll("&g;", ">")
    .replaceAll("\\&q;", '\\"'); // escaped inside RSC strings
}

function fmtDt(s?: string | null): string | undefined {
  if (!s) return undefined;
  if (/^\d{14}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}`;
  }
  return s;
}

function extractVessels(html: string): RichTerminalVessel[] {
  // {&q;terminal&q;:&q;XXX&q;, ... } 객체 패턴 추출.
  // ITU 호출부호(callSign) 필드는 vessel record에만 있고 terminal 정의 record엔 없으므로
  // callSign이 포함된 객체만 고름.
  const matches = html.matchAll(/\{&q;terminal&q;:&q;[A-Z]+&q;[^}]*?&q;callSign&q;[^}]*?\}/g);
  const out: RichTerminalVessel[] = [];
  const seen = new Set<string>();
  for (const m of matches) {
    const raw = m[0];
    const decoded = decodeRSCEscapes(raw);
    try {
      // 일부 필드(berthnDtmFormat 등)에 HTML 조각이 남아있을 수 있어 JSON.parse 실패 가능.
      // 안전하게 우리가 필요한 필드만 정규식으로 빼낸다.
      const pick = (key: string) => {
        const r = new RegExp(`"${key}":\\s*(?:"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"|(-?\\d+)|null)`);
        const mr = decoded.match(r);
        return mr ? mr[1] ?? mr[2] : undefined;
      };
      const v: RichTerminalVessel = {
        terminal: pick("terminal") ?? "",
        terminalNm: pick("terminalNm") ?? "",
        terminalUrl: pick("terminalUrl"),
        portCd: pick("portCd"),
        portNm: pick("portNm"),
        vesselNm: pick("vesselNm") ?? "",
        vesselCall: pick("vesselCall"),
        berthNo: pick("berthNo"),
        berthnDtm: fmtDt(pick("berthnDtm")),
        closingDtm: fmtDt(pick("closingDtm")),
        depDtm: fmtDt(pick("depDtm")),
        operator: pick("operator"),
        vesselId: pick("vesselId") ? Number(pick("vesselId")) : undefined,
        imoNo: pick("imoNo"),
        mmsi: pick("mmsi"),
        callSign: pick("callSign"),
        status: pick("status"),
        lodCnt: pick("lodCnt") ? Number(pick("lodCnt")) : undefined,
        disCnt: pick("disCnt") ? Number(pick("disCnt")) : undefined,
      };
      if (!v.terminal || !v.vesselNm) continue;
      // 중복 제거 (같은 vessel id + terminal + voyage)
      const key = `${v.terminal}|${v.vesselId ?? v.vesselNm}|${v.vesselCall ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    } catch {
      // skip
    }
  }
  return out;
}

export async function GET() {
  try {
    if (cache && Date.now() - cache.at < TTL_MS) {
      return NextResponse.json({ items: cache.data, cached: true, fetchedAt: cache.at });
    }
    const res = await fetch(PAGE_URL, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`tradlinx page HTTP ${res.status}`);
    const html = await res.text();
    const data = extractVessels(html);
    if (data.length === 0) throw new Error("No vessel records extracted (HTML structure may have changed)");
    cache = { at: Date.now(), data };
    return NextResponse.json({ items: data, cached: false, fetchedAt: cache.at });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 502 });
  }
}
