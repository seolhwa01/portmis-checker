"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Info5Response } from "./lib/portmis";
import { PORT_AG_CODES } from "./lib/portmis";
import type { TerminalScheduleItem } from "./lib/terminals/types";
import { normalizeVesselName, tokenizeVesselName, TERMINAL_TO_PORT } from "./lib/terminals/types";

// tradlinx terminal-work API — 부산/인천/광양/평택 16개 컨테이너 터미널 현재작업 집계
type TerminalApiResp = { items?: TerminalScheduleItem[]; error?: string; fetchedAt?: number; cached?: boolean };

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function fmtDt(s?: string) {
  if (!s) return "-";
  if (/^\d{12,14}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}`;
  }
  const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (m) return `${m[1]} ${m[2]}`;
  return s;
}

const HISTORY_KEY = "portmis_clsgn_history_v1";
const HISTORY_MAX = 200;
const PRTAG_USAGE_KEY = "portmis_prtag_usage_v1";

type HistoryEntry = { clsgn: string; vsslNm: string; lastSeenAt: number };
type PrtAgUsage = Record<string, { count: number; lastUsedAt: number }>;

function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, HISTORY_MAX)));
}

function mergeHistory(prev: HistoryEntry[], incoming: { clsgn: string; vsslNm: string }[]) {
  const map = new Map(prev.map((e) => [e.clsgn, e]));
  const now = Date.now();
  for (const it of incoming) {
    if (!it.clsgn) continue;
    map.set(it.clsgn, { clsgn: it.clsgn, vsslNm: it.vsslNm || "", lastSeenAt: now });
  }
  return [...map.values()].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

function loadPrtAgUsage(): PrtAgUsage {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(PRTAG_USAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function bumpPrtAgUsage(code: string): PrtAgUsage {
  const u = loadPrtAgUsage();
  const prev = u[code] ?? { count: 0, lastUsedAt: 0 };
  u[code] = { count: prev.count + 1, lastUsedAt: Date.now() };
  localStorage.setItem(PRTAG_USAGE_KEY, JSON.stringify(u));
  return u;
}

function sortedPortCodes(usage: PrtAgUsage) {
  return [...PORT_AG_CODES].sort((a, b) => {
    const ua = usage[a.code]?.count ?? 0;
    const ub = usage[b.code]?.count ?? 0;
    if (ua !== ub) return ub - ua;
    return a.code.localeCompare(b.code);
  });
}

export default function Page() {
  const [prtAgCd, setPrtAgCd] = useState("020");
  const [clsgn, setClsgn] = useState("");
  const [sde, setSde] = useState(todayISO(-7));
  const [ede, setEde] = useState(todayISO(0));
  const [deGb, setDeGb] = useState<"I" | "O">("O");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Info5Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [departedOnly, setDepartedOnly] = useState(false);
  const [containerOnly, setContainerOnly] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [prtAgUsage, setPrtAgUsage] = useState<PrtAgUsage>({});
  const [terminalData, setTerminalData] = useState<TerminalApiResp | null>(null);

  useEffect(() => {
    setHistory(loadHistory());
    setPrtAgUsage(loadPrtAgUsage());
  }, []);

  const sortedPorts = useMemo(() => sortedPortCodes(prtAgUsage), [prtAgUsage]);
  const [showPortDropdown, setShowPortDropdown] = useState(false);
  const portWrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showPortDropdown) return;
    const onDocClick = (e: MouseEvent) => {
      if (portWrapperRef.current && !portWrapperRef.current.contains(e.target as Node)) {
        setShowPortDropdown(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showPortDropdown]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setData(null);
    setTerminalData(null);
    try {
      const code = prtAgCd.trim();
      const qs = new URLSearchParams({ prtAgCd: code, sde, ede, deGb, numOfRows: "50" });
      if (clsgn.trim()) qs.set("clsgn", clsgn.trim().toUpperCase());
      setPrtAgUsage(bumpPrtAgUsage(code));
      const res = await fetch(`/api/info5?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      if (json.resultCode && json.resultCode !== "00" && json.resultCode !== "0") {
        throw new Error(`${json.resultCode}: ${json.resultMsg}`);
      }
      setData(json);

      // 자동완성용 이력 누적
      const incoming = (json.items ?? []).map((it: any) => ({
        clsgn: (it.clsgn ?? "").trim(),
        vsslNm: (it.vsslNm ?? "").trim(),
      }));
      const merged = mergeHistory(history, incoming);
      setHistory(merged);
      saveHistory(merged);

      try {
        const tRes = await fetch(`/api/terminal`);
        const tJson = await tRes.json();
        setTerminalData(tJson);
      } catch (e: any) {
        setTerminalData({ error: e?.message ?? String(e) });
      }
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  const terminalIndex = useMemo(() => {
    const byCallsign = new Map<string, TerminalScheduleItem[]>();
    const byVsslNm = new Map<string, TerminalScheduleItem[]>();
    const byToken = new Map<string, TerminalScheduleItem[]>();
    const allByNm: { nm: string; it: TerminalScheduleItem }[] = [];
    // 현재 청코드에 해당하는 tradlinx 터미널만 매칭 대상으로 사용.
    // (예: 청코드 622 광양 조회 시 GWCT 만, 031 평택 조회 시 PNCT/KITL 만)
    const portScoped = (terminalData?.items ?? []).filter(
      (it) => TERMINAL_TO_PORT[it.terminal]?.code === prtAgCd,
    );
    for (const it of portScoped) {
      const cs = (it.vesselCd ?? "").trim().toUpperCase();
      if (cs) {
        const arr = byCallsign.get(cs) ?? [];
        arr.push(it);
        byCallsign.set(cs, arr);
      }
      const nm = normalizeVesselName(it.vsslNm);
      if (nm) {
        const arr = byVsslNm.get(nm) ?? [];
        arr.push(it);
        byVsslNm.set(nm, arr);
        allByNm.push({ nm, it });
      }
      for (const tok of tokenizeVesselName(it.vsslNm)) {
        const arr = byToken.get(tok) ?? [];
        arr.push(it);
        byToken.set(tok, arr);
      }
    }
    return { byCallsign, byVsslNm, byToken, allByNm };
  }, [terminalData, prtAgCd]);

  function parseTime(s?: string): number {
    if (!s) return NaN;
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3], +iso[4], +iso[5]);
    const d12 = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/);
    if (d12) return Date.UTC(+d12[1], +d12[2] - 1, +d12[3], +d12[4], +d12[5]);
    return NaN;
  }

  function findTerminalMatches(clsgn?: string, vsslNm?: string, targetDt?: string): TerminalScheduleItem[] {
    const out: TerminalScheduleItem[] = [];
    const seen = new Set<TerminalScheduleItem>();
    const push = (arr: TerminalScheduleItem[]) => {
      for (const x of arr) {
        if (!seen.has(x)) {
          seen.add(x);
          out.push(x);
        }
      }
    };

    const cs = (clsgn ?? "").trim().toUpperCase();
    if (cs && terminalIndex.byCallsign.has(cs)) push(terminalIndex.byCallsign.get(cs)!);

    const nm = normalizeVesselName(vsslNm);
    if (nm) {
      if (terminalIndex.byVsslNm.has(nm)) push(terminalIndex.byVsslNm.get(nm)!);
      if (nm.length >= 4) {
        const partial = terminalIndex.allByNm
          .filter(({ nm: tn }) => tn !== nm && (tn.startsWith(nm) || nm.startsWith(tn) || tn.includes(nm) || nm.includes(tn)))
          .map(({ it }) => it);
        if (partial.length) push(partial);
      }
    }
    for (const tok of tokenizeVesselName(vsslNm)) {
      if (terminalIndex.byToken.has(tok)) push(terminalIndex.byToken.get(tok)!);
    }
    // 시간 근접도 정렬: Port-MIS 입항(또는 출항) 시각과 tradlinx ATB/ETB 차이가 작은 순.
    if (targetDt && out.length > 1) {
      const target = parseTime(targetDt);
      if (!isNaN(target)) {
        out.sort((a, b) => {
          const aT = parseTime(a.atb) || parseTime(a.etb);
          const bT = parseTime(b.atb) || parseTime(b.etb);
          const aDiff = isNaN(aT) ? Infinity : Math.abs(aT - target);
          const bDiff = isNaN(bT) ? Infinity : Math.abs(bT - target);
          return aDiff - bDiff;
        });
      }
    }
    return out;
  }

  const terminalErrors = useMemo(
    () => (terminalData?.error ? [terminalData.error] : []),
    [terminalData],
  );

  const rows = useMemo(() => {
    if (!data) return [];
    const out: { it: any; d: any; idx: number }[] = [];
    for (const it of data.items) {
      if (containerOnly && !/컨테이너/.test(it.vsslKndNm ?? "")) continue;
      const details = it.details && it.details.length ? it.details : [{}];
      details.forEach((d, idx) => {
        if (departedOnly && !d.tkoffDt) return;
        out.push({ it, d, idx });
      });
    }
    // 출항일(tkoffDt) 내림차순 — 미출항은 맨 뒤
    out.sort((a, b) => {
      const av = a.d.tkoffDt ?? "";
      const bv = b.d.tkoffDt ?? "";
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      return bv.localeCompare(av);
    });
    return out;
  }, [data, departedOnly, containerOnly]);

  return (
    <main>
      <h1>
        Port-MIS 출항 확인{" "}
        <a href="/lookup" style={{ fontSize: 14, color: "#0070f3", fontWeight: "normal" }}>
          → 선박 단건 조회
        </a>
      </h1>

      <div className="presets">
        <span className="presets-label">기간:</span>
        {[1, 3, 7, 14, 30, 60].map((days) => (
          <button
            type="button"
            key={days}
            className="preset-chip"
            onClick={() => {
              setSde(todayISO(-(days - 1)));
              setEde(todayISO(0));
            }}
          >
            최근 {days}일
          </button>
        ))}
        <button
          type="button"
          className="preset-chip"
          onClick={() => {
            setSde(todayISO(-1));
            setEde(todayISO(-1));
          }}
        >
          어제
        </button>
        <button
          type="button"
          className="preset-chip"
          onClick={() => {
            setSde(todayISO(0));
            setEde(todayISO(0));
          }}
        >
          오늘
        </button>
      </div>

      <form className="search" onSubmit={onSubmit}>
        <label>
          청코드
          <div className="port-input-wrap" ref={portWrapperRef}>
            <input
              value={prtAgCd}
              onChange={(e) => setPrtAgCd(e.target.value.trim())}
              placeholder="예: 020 · 부산"
              list="port-codes"
              autoComplete="off"
            />
            <button
              type="button"
              className="port-dropdown-btn"
              aria-label="전체 청코드 목록 열기"
              onClick={() => setShowPortDropdown((v) => !v)}
            >
              ▾
            </button>
            <datalist id="port-codes">
              {sortedPorts.map((p) => {
                const cnt = prtAgUsage[p.code]?.count ?? 0;
                return (
                  <option key={p.code} value={p.code}>
                    {p.name}
                    {cnt > 0 ? ` (${cnt}회)` : ""}
                  </option>
                );
              })}
            </datalist>
            {showPortDropdown && (
              <div className="port-dropdown">
                {sortedPorts.map((p) => {
                  const cnt = prtAgUsage[p.code]?.count ?? 0;
                  const active = p.code === prtAgCd;
                  return (
                    <button
                      type="button"
                      key={p.code}
                      className={`port-dropdown-item${active ? " active" : ""}`}
                      onClick={() => {
                        setPrtAgCd(p.code);
                        setShowPortDropdown(false);
                      }}
                    >
                      <span className="code">{p.code}</span>
                      <span className="name">{p.name}</span>
                      {cnt > 0 && <span className="count">{cnt}회</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </label>
        <label>
          호출부호 (선택)
          <input
            value={clsgn}
            onChange={(e) => setClsgn(e.target.value)}
            placeholder="예: D7AB"
            list="clsgn-history"
            autoComplete="off"
          />
          <datalist id="clsgn-history">
            {history.map((h) => (
              <option key={h.clsgn} value={h.clsgn}>
                {h.vsslNm}
              </option>
            ))}
          </datalist>
        </label>
        <label>
          조회 시작 (YYYYMMDD)
          <input value={sde} onChange={(e) => setSde(e.target.value)} maxLength={8} />
        </label>
        <label>
          조회 종료 (YYYYMMDD)
          <input value={ede} onChange={(e) => setEde(e.target.value)} maxLength={8} />
        </label>
        <label>
          기준
          <select value={deGb} onChange={(e) => setDeGb(e.target.value as "I" | "O")}>
            <option value="O">출항일 기준</option>
            <option value="I">입항일 기준</option>
          </select>
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "조회 중..." : "검색"}
        </button>
      </form>

      {error && <div className="error">⚠ {error}</div>}
      {terminalErrors.length > 0 && (
        <div className="error" style={{ background: "#fff7e6", color: "#8a5a00" }}>
          터미널(tradlinx) 조회 실패: {terminalErrors.join(" / ")}
        </div>
      )}

      {data && (
        <>
          <div className="meta" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>
              총 {data.totalCount}건 · 페이지 {data.pageNo} · {data.items.length}건 표시
              {(containerOnly || departedOnly) && ` · 필터링 후 ${rows.length}건`}
            </span>
            <div style={{ display: "flex", gap: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={containerOnly}
                  onChange={(e) => setContainerOnly(e.target.checked)}
                />
                컨테이너선만 보기
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={departedOnly}
                  onChange={(e) => setDepartedOnly(e.target.checked)}
                />
                출항 완료만 보기
              </label>
            </div>
          </div>
          {rows.length === 0 ? (
            <div className="empty">
              {departedOnly ? "출항 완료된 건이 없습니다." : "조회된 결과가 없습니다."}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>선박명 / 호출부호</th>
                  <th>항차</th>
                  <th>신고구분</th>
                  <th>입항일시</th>
                  <th>출항예정</th>
                  <th>실제출항</th>
                  <th>계선장소</th>
                  <th>직전출항지 → 차항지</th>
                  <th>총톤수</th>
                  {terminalData && (
                    <>
                      <th>터미널</th>
                      <th>선석</th>
                      <th>터미널 ETB/ATB</th>
                      <th>터미널 ETD/ATD</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ it, d, idx }) => {
                  const departed = !!d.tkoffDt;
                  const tMatches = findTerminalMatches(it.clsgn, it.vsslNm, d.etryptDt ?? d.tkoffDt);
                  const tMatch = tMatches[0];
                  return (
                    <tr key={`${it.clsgn}-${it.etryptYear}-${it.etryptCo}-${idx}`}>
                      <td>
                        <strong>{it.vsslNm ?? "-"}</strong>
                        <div style={{ color: "#777", fontSize: 12 }}>{it.clsgn}</div>
                      </td>
                      <td>
                        {it.etryptYear}/{it.etryptCo}
                      </td>
                      <td>
                        <span className={`tag ${departed ? "depart" : ""}`}>
                          {d.reqstSeNm ?? d.etryndNm ?? "-"}
                        </span>
                      </td>
                      <td>{fmtDt(d.etryptDt)}</td>
                      <td>{fmtDt(d.tkoffPrrrnDt)}</td>
                      <td>
                        <strong style={{ color: departed ? "#1a7f4a" : "#999" }}>
                          {fmtDt(d.tkoffDt)}
                        </strong>
                      </td>
                      <td>{d.laidupFcltyNm ?? "-"}</td>
                      <td style={{ fontSize: 12 }}>
                        {it.prvsDpmprtPrtNm ?? "-"} → {it.nxlnptPrtNm ?? "-"}
                      </td>
                      <td>{d.grtg ?? "-"}</td>
                      {terminalData && (
                        <>
                          <td style={{ fontSize: 12 }}>
                            {tMatch ? (
                              <>
                                <strong>{tMatch.terminalLabel}</strong>
                                {tMatches.length > 1 && (
                                  <span style={{ color: "#888" }}> +{tMatches.length - 1}</span>
                                )}
                              </>
                            ) : (
                              <span style={{ color: "#bbb" }}>매칭 없음</span>
                            )}
                          </td>
                          <td>{tMatch?.berth ?? "-"}</td>
                          <td style={{ fontSize: 12 }}>
                            {tMatch?.atb ? <strong style={{ color: "#1a7f4a" }}>{tMatch.atb}</strong> : tMatch?.etb ?? "-"}
                          </td>
                          <td style={{ fontSize: 12 }}>
                            {tMatch?.atd ? <strong style={{ color: "#1a7f4a" }}>{tMatch.atd}</strong> : tMatch?.etd ?? "-"}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </main>
  );
}
