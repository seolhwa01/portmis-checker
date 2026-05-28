"use client";

import { Fragment, useState } from "react";
import type { TerminalScheduleItem } from "../lib/terminals/types";
import { normalizeVesselName, tokenizeVesselName } from "../lib/terminals/types";
import type { Info5Response, DepartureItem } from "../lib/portmis";
import { parseMrNum, carrierFromScac } from "../lib/scac";

type TerminalApiResp = { items?: TerminalScheduleItem[]; error?: string };

function fmt(s?: string) {
  if (!s) return "-";
  // ISO with timezone: 2026-05-15T19:05:00+09:00
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (iso) return `${iso[1]} ${iso[2]}`;
  // YYYYMMDDHHMM[SS]
  if (/^\d{12,14}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}`;
  }
  return s;
}

function todayOffset(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

// tradlinx 터미널코드 → Port-MIS 청코드 매핑.
// 검증된 청코드: 020 부산 / 030 인천 / 031 평택 / 622 광양.
// 부산신항은 Port-MIS 022 응답이 비어있어 모두 020(부산)으로 통합 조회.
const TERMINAL_TO_PORT: Record<string, { code: string; name: string }> = {
  // 부산
  BCT: { code: "020", name: "부산" },
  BIT: { code: "020", name: "부산(감만)" },
  BPTC: { code: "020", name: "부산(신선대)" },
  HBCT: { code: "020", name: "부산(감만)" },
  IFPC: { code: "020", name: "부산(여객)" },
  // 부산신항 (Port-MIS상 020 통합)
  BNCT: { code: "020", name: "부산(신항)" },
  HJNC: { code: "020", name: "부산(신항)" },
  HPNT: { code: "020", name: "부산(신항)" },
  PNC: { code: "020", name: "부산(신항)" },
  PNIT: { code: "020", name: "부산(신항)" },
  // 인천
  HJIT: { code: "030", name: "인천" },
  ICT: { code: "030", name: "인천" },
  SNCT: { code: "030", name: "인천" },
  // 평택
  PNCT: { code: "031", name: "평택" },
  KITL: { code: "031", name: "평택" },
  // 광양
  GWCT: { code: "622", name: "광양" },
};

function portCodeFor(it: TerminalScheduleItem): { code: string; name: string } {
  const byCode = TERMINAL_TO_PORT[it.terminal];
  if (byCode) return byCode;
  // fallback: 라벨 패턴
  const label = it.terminalLabel ?? "";
  if (/평택/.test(label)) return { code: "031", name: "평택" };
  if (/인천/.test(label)) return { code: "030", name: "인천" };
  if (/광양/.test(label)) return { code: "622", name: "광양" };
  return { code: "020", name: "부산" };
}

export default function LookupPage() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<TerminalScheduleItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<{
    port: string;
    portName: string;
    exact: DepartureItem[];
    partial: DepartureItem[];
    fleet: DepartureItem[];
    totalCount: number;
  } | null>(null);
  const [detailErr, setDetailErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setHits(null);
    setSelectedIdx(null);
    setDetail(null);
    setDetailErr(null);
    const term = q.trim();
    if (!term) return;
    setLoading(true);
    try {
      const res = await fetch("/api/terminal");
      const json: TerminalApiResp = await res.json();
      if (json.error) throw new Error(json.error);
      const items = json.items ?? [];

      const qUpper = term.toUpperCase();
      const qNorm = normalizeVesselName(term);
      const qTokens = tokenizeVesselName(term);

      const matched = items.filter((it) => {
        const cs = (it.vesselCd ?? "").toUpperCase();
        if (cs && cs === qUpper) return true;
        const nm = normalizeVesselName(it.vsslNm);
        if (qNorm && nm === qNorm) return true;
        if (qNorm.length >= 4 && nm && (nm.includes(qNorm) || qNorm.includes(nm))) return true;
        if (qTokens.length) {
          const itTokens = tokenizeVesselName(it.vsslNm);
          if (qTokens.some((t) => itTokens.includes(t))) return true;
        }
        return false;
      });

      setHits(matched);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(it: TerminalScheduleItem, idx: number) {
    if (selectedIdx === idx) {
      setSelectedIdx(null);
      setDetail(null);
      setDetailErr(null);
      return;
    }
    setSelectedIdx(idx);
    setDetail(null);
    setDetailErr(null);
    setDetailLoading(true);
    try {
      const port = portCodeFor(it);
      const targetNorm = normalizeVesselName(it.vsslNm);
      const targetCs = (it.vesselCd ?? "").trim().toUpperCase();
      const targetTokens = tokenizeVesselName(it.vsslNm);
      // 매칭 단계 분류:
      //  exact  : 호출부호 일치 OR 정규화 선명 완전일치 → 동일 선박 확정
      //  partial: 정규화 선명이 한쪽이 다른쪽을 포함 (긴 변형/축약형) → 같은 선박 가능성 높음
      //  fleet  : 토큰 일부만 공유 → 같은 선사 다른 선박일 수 있음
      const classify = (x: DepartureItem): "exact" | "partial" | "fleet" | null => {
        const xCs = (x.clsgn ?? "").trim().toUpperCase();
        if (targetCs && xCs && xCs === targetCs) return "exact";
        const xNorm = normalizeVesselName(x.vsslNm);
        if (xNorm && targetNorm && xNorm === targetNorm) return "exact";
        if (
          targetNorm.length >= 4 &&
          xNorm &&
          xNorm !== targetNorm &&
          (xNorm.includes(targetNorm) || targetNorm.includes(xNorm))
        )
          return "partial";
        const xTokens = tokenizeVesselName(x.vsslNm);
        if (targetTokens.length > 0 && targetTokens.some((t) => xTokens.includes(t))) return "fleet";
        return null;
      };

      const sde = todayOffset(-14);
      const ede = todayOffset(7);
      const PAGES = 8;
      const fetchPage = async (p: number) => {
        const qs = new URLSearchParams({
          prtAgCd: port.code,
          sde,
          ede,
          deGb: "I",
          numOfRows: "50",
          pageNo: String(p),
        });
        const res = await fetch(`/api/info5?${qs.toString()}`);
        const json: Info5Response & { error?: string } = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        return json;
      };
      const first = await fetchPage(1);
      const rest = await Promise.all(
        Array.from({ length: Math.min(PAGES - 1, Math.ceil(first.totalCount / 50) - 1) }, (_, i) =>
          fetchPage(i + 2),
        ),
      );
      const allItems = [first, ...rest].flatMap((r) => r.items ?? []);
      const exact: DepartureItem[] = [];
      const partial: DepartureItem[] = [];
      const fleet: DepartureItem[] = [];
      for (const x of allItems) {
        const c = classify(x);
        if (c === "exact") exact.push(x);
        else if (c === "partial") partial.push(x);
        else if (c === "fleet") fleet.push(x);
      }

      setDetail({
        port: port.code,
        portName: port.name,
        exact,
        partial,
        fleet,
        totalCount: first.totalCount,
      });
    } catch (e: any) {
      setDetailErr(e?.message ?? String(e));
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <main>
      <h1>선박 단건 조회</h1>
      <p style={{ color: "#666", fontSize: 13, marginTop: -8 }}>
        호출부호(예: HOTP) 또는 선명(예: HMM TOPAZ, 팬콘 선샤인) 입력 → 부산/인천/광양/평택 16개
        컨테이너 터미널 현재 작업 일정에서 검색 · 행을 클릭하면 Port-MIS 입항 신고 상세 조회
      </p>

      <form className="search" onSubmit={onSubmit} style={{ marginTop: 16 }}>
        <label style={{ flex: 1, minWidth: 280 }}>
          호출부호 또는 선명
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="HMM TOPAZ / HOTP / 팬콘 / SINOKOR ..."
            autoFocus
          />
        </label>
        <button type="submit" disabled={loading || !q.trim()}>
          {loading ? "검색 중..." : "검색"}
        </button>
      </form>

      {error && <div className="error">⚠ {error}</div>}

      {hits && hits.length === 0 && (
        <div className="empty">매칭된 터미널 스케줄이 없습니다. (현재 작업 중/예정 선박만 표시됨)</div>
      )}

      {hits && hits.length > 0 && (
        <>
          <div className="meta" style={{ marginTop: 16 }}>
            {hits.length}건 매칭 · 행 클릭 → Port-MIS 상세
          </div>
          <table>
            <thead>
              <tr>
                <th>터미널</th>
                <th>선박</th>
                <th>호출부호</th>
                <th>항차</th>
                <th>선석</th>
                <th>ETB / ATB</th>
                <th>ETD / ATD</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {hits.map((it, i) => {
                const active = selectedIdx === i;
                return (
                  <Fragment key={`row-${i}`}>
                    <tr
                      onClick={() => loadDetail(it, i)}
                      style={{
                        cursor: "pointer",
                        background: active ? "#eef6ff" : undefined,
                      }}
                    >
                      <td>
                        <strong>{it.terminalLabel}</strong>
                      </td>
                      <td>{it.vsslNm}</td>
                      <td style={{ color: "#777", fontSize: 12 }}>{it.vesselCd ?? "-"}</td>
                      <td>{it.voyage || "-"}</td>
                      <td>{it.berth || "-"}</td>
                      <td style={{ fontSize: 12 }}>
                        {it.atb ? (
                          <strong style={{ color: "#1a7f4a" }}>{fmt(it.atb)}</strong>
                        ) : (
                          fmt(it.etb)
                        )}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {it.atd ? (
                          <strong style={{ color: "#1a7f4a" }}>{fmt(it.atd)}</strong>
                        ) : (
                          fmt(it.etd)
                        )}
                      </td>
                      <td>
                        <span className={`tag ${it.status === "Departed" ? "depart" : ""}`}>
                          {it.status ?? "-"}
                        </span>
                      </td>
                    </tr>
                    {active && (
                      <tr>
                        <td colSpan={8} style={{ background: "#f7faff", padding: 12 }}>
                          {detailLoading && <span>Port-MIS 상세 조회 중...</span>}
                          {detailErr && <span style={{ color: "#c00" }}>⚠ {detailErr}</span>}
                          {detail && !detailLoading && (
                            <PortMisDetail it={it} detail={detail} />
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      <div style={{ marginTop: 24, fontSize: 13 }}>
        <a href="/" style={{ color: "#0070f3" }}>
          ← Port-MIS 출항 확인으로
        </a>
      </div>
    </main>
  );
}

function PortMisDetail({
  it,
  detail,
}: {
  it: TerminalScheduleItem;
  detail: {
    port: string;
    portName: string;
    exact: DepartureItem[];
    partial: DepartureItem[];
    fleet: DepartureItem[];
    totalCount: number;
  };
}) {
  const total = detail.exact.length + detail.partial.length + detail.fleet.length;
  if (total === 0) {
    return (
      <div style={{ fontSize: 13, color: "#666" }}>
        Port-MIS({detail.portName} · {detail.port}) 최근 21일 입항 신고({detail.totalCount}건) 중
        선박 <strong>{it.vsslNm}</strong> 매칭 없음. 해당 선박이 다른 청코드로 신고됐을 수 있습니다.
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 13, marginBottom: 8, color: "#444" }}>
        Port-MIS <strong>{detail.portName}({detail.port})</strong> · 동일선박 {detail.exact.length}
        건 / 부분일치 {detail.partial.length}건 / 같은선사 {detail.fleet.length}건
      </div>

      <MatchGroup title="동일 선박" tone="exact" items={detail.exact} />
      <MatchGroup title="부분 일치 (변형 선명 추정)" tone="partial" items={detail.partial} />
      <MatchGroup title="같은 선사 다른 선박" tone="fleet" items={detail.fleet} />
    </div>
  );
}

function MatchGroup({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "exact" | "partial" | "fleet";
  items: DepartureItem[];
}) {
  if (items.length === 0) return null;
  const colors: Record<typeof tone, { bg: string; fg: string }> = {
    exact: { bg: "#e9f7ef", fg: "#1a7f4a" },
    partial: { bg: "#fff7e6", fg: "#8a5a00" },
    fleet: { bg: "#eef0f3", fg: "#555" },
  };
  const c = colors[tone];
  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          display: "inline-block",
          background: c.bg,
          color: c.fg,
          fontSize: 12,
          fontWeight: 600,
          padding: "3px 8px",
          borderRadius: 4,
          marginBottom: 6,
        }}
      >
        {title} · {items.length}건
      </div>
      <table style={{ background: "#fff" }}>
        <thead>
          <tr>
            <th>선박명 / 호출부호</th>
            <th>선사 (SCAC)</th>
            <th>항차 · M/R No</th>
            <th>입항</th>
            <th>출항예정</th>
            <th>실제출항</th>
            <th>계선장소</th>
            <th>이전항 → 차항</th>
            <th>총톤수</th>
            <th>선종</th>
          </tr>
        </thead>
        <tbody>
          {items.flatMap((x, ix) =>
            (x.details && x.details.length ? x.details : [{}]).map((d: any, di: number) => {
              const parsed = parseMrNum(d.mrNum);
              const carrier = carrierFromScac(parsed?.scac);
              return (
                <tr key={`${ix}-${di}`}>
                  <td>
                    <strong>{x.vsslNm ?? "-"}</strong>
                    <div style={{ color: "#777", fontSize: 12 }}>{x.clsgn}</div>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {carrier ? (
                      <>
                        <strong>{carrier}</strong>
                        <div style={{ color: "#888" }}>{parsed?.scac}</div>
                      </>
                    ) : parsed?.scac ? (
                      <span style={{ color: "#888" }}>{parsed.scac}</span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {x.etryptYear}/{x.etryptCo}
                    {d.mrNum && <div style={{ color: "#888" }}>{d.mrNum}</div>}
                  </td>
                  <td>{fmt(d.etryptDt)}</td>
                  <td>{fmt(d.tkoffPrrrnDt)}</td>
                  <td>
                    <strong style={{ color: d.tkoffDt ? "#1a7f4a" : "#999" }}>{fmt(d.tkoffDt)}</strong>
                  </td>
                  <td>{d.laidupFcltyNm ?? "-"}</td>
                  <td style={{ fontSize: 12 }}>
                    {x.prvsDpmprtPrtNm ?? "-"} → {x.nxlnptPrtNm ?? "-"}
                  </td>
                  <td>{d.grtg ?? "-"}</td>
                  <td style={{ fontSize: 12 }}>{x.vsslKndNm ?? "-"}</td>
                </tr>
              );
            }),
          )}
        </tbody>
      </table>
    </div>
  );
}
