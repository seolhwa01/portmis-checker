// 기존 /api/terminal: tradlinx /terminal-work API(16개 터미널, 작업중만) → 우리 TerminalScheduleItem 으로 매핑.
// rich 라우트는 22개 + IMO/MMSI/callSign 가지지만 데이터 형태가 다름.
// 호환성 유지를 위해 이 라우트는 rich 응답을 같은 형태로 정규화한다.
import { NextResponse } from "next/server";
import type { TerminalScheduleItem } from "../../lib/terminals/types";
import type { RichTerminalVessel } from "./rich/route";

export const dynamic = "force-dynamic";

let cache: { at: number; data: TerminalScheduleItem[] } | null = null;
const TTL_MS = 3 * 60 * 1000;

function statusOf(v: RichTerminalVessel): string {
  if (v.status) return v.status;
  if (v.depDtm) return "Departed";
  if (v.berthnDtm) return "Working";
  return "Scheduled";
}

function richToScheduleItem(v: RichTerminalVessel): TerminalScheduleItem {
  const departed = v.status === "Departed";
  return {
    terminal: v.terminal,
    terminalLabel: v.terminalNm || v.terminal,
    berth: v.berthNo ?? "",
    vsslNm: v.vesselNm,
    voyage: v.vesselCall ?? "",
    // 중요: vesselCd 필드에 ITU 호출부호(callSign)를 넣어 매칭 로직에서 활용.
    // 기존 tradlinx 4자 약어는 ITU 콜사인이 아니라 매칭 불가였음.
    vesselCd: v.callSign,
    operator: v.operator,
    etb: departed ? undefined : v.berthnDtm,
    atb: departed ? v.berthnDtm : undefined,
    etd: departed ? undefined : v.depDtm,
    atd: departed ? v.depDtm : undefined,
    cutoff: v.closingDtm,
    status: statusOf(v),
    raw: {
      imoNo: v.imoNo ?? "",
      mmsi: v.mmsi ?? "",
      vesselId: String(v.vesselId ?? ""),
    },
  };
}

export async function GET(req: Request) {
  try {
    if (cache && Date.now() - cache.at < TTL_MS) {
      return NextResponse.json({ items: cache.data, cached: true, fetchedAt: cache.at });
    }
    const origin = new URL(req.url).origin;
    const r = await fetch(`${origin}/api/terminal/rich`, { cache: "no-store" });
    const j: { items?: RichTerminalVessel[]; error?: string } = await r.json();
    if (!r.ok || j.error) throw new Error(j.error ?? `HTTP ${r.status}`);
    const data = (j.items ?? []).map(richToScheduleItem);
    cache = { at: Date.now(), data };
    return NextResponse.json({ items: data, cached: false, fetchedAt: cache.at });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 502 });
  }
}
