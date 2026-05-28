import { normalizeDt, type TerminalScheduleItem } from "./types";

const URL_TERMINAL_WORK = "https://api.tradlinx.com/terminal-work";

interface TlxRow {
  terminal: string;
  terminalNmShrt?: string;
  vesselCd?: string;
  vesselNm?: string;
  voyage?: string;
  berthNo?: string | null;
  brthnSd?: string | null;
  startDtm?: string | null;
  endDtm?: string | null;
  arrEta?: string | null;
  arrEtd?: string | null;
  depEta?: string | null;
  depEtd?: string | null;
  totalPercentage?: string;
  expectHour?: string;
}

export async function fetchTradlinx(): Promise<TerminalScheduleItem[]> {
  const res = await fetch(`${URL_TERMINAL_WORK}?${Date.now()}`, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`tradlinx HTTP ${res.status}`);
  const rows: TlxRow[] = await res.json();
  return rows.map(mapRow);
}

function mapRow(r: TlxRow): TerminalScheduleItem {
  const berth = [r.berthNo, r.brthnSd].filter(Boolean).join(" ").trim();
  const status = r.endDtm ? "Departed" : r.startDtm ? "Working" : "Scheduled";
  return {
    terminal: r.terminal ?? "TLX",
    terminalLabel: r.terminalNmShrt || r.terminal || "",
    berth,
    vsslNm: r.vesselNm || "",
    voyage: r.voyage || "",
    vesselCd: r.vesselCd ?? undefined,
    operator: undefined,
    etb: normalizeDt(r.arrEta ?? r.arrEtd ?? undefined),
    atb: normalizeDt(r.startDtm ?? undefined),
    etd: normalizeDt(r.depEta ?? r.depEtd ?? undefined),
    atd: normalizeDt(r.endDtm ?? undefined),
    status,
    raw: {
      vesselCd: r.vesselCd ?? "",
      totalPercentage: r.totalPercentage ?? "",
      expectHour: r.expectHour ?? "",
    },
  };
}
