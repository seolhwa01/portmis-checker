"use client";

import { useState } from "react";
import type { TerminalScheduleItem } from "../lib/terminals/types";
import { normalizeVesselName, tokenizeVesselName } from "../lib/terminals/types";

type TerminalApiResp = { items?: TerminalScheduleItem[]; error?: string };

function fmt(s?: string) {
  if (!s) return "-";
  const m = s.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : s;
}

export default function LookupPage() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<TerminalScheduleItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setHits(null);
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

  return (
    <main>
      <h1>선박 단건 조회</h1>
      <p style={{ color: "#666", fontSize: 13, marginTop: -8 }}>
        호출부호(예: HOTP) 또는 선명(예: HMM TOPAZ, 팬콘 선샤인) 입력 → 부산/인천/광양/평택 16개
        컨테이너 터미널 현재 작업 일정에서 검색
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
            {hits.length}건 매칭
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
              {hits.map((it, i) => (
                <tr key={`${it.terminal}-${it.vsslNm}-${i}`}>
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
              ))}
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
