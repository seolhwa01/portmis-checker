import { NextResponse } from "next/server";
import { fetchTradlinx } from "../../lib/terminals/tradlinx";
import type { TerminalScheduleItem } from "../../lib/terminals/types";

export const dynamic = "force-dynamic";

let cache: { at: number; data: TerminalScheduleItem[] } | null = null;
const TTL_MS = 3 * 60 * 1000;

export async function GET() {
  try {
    if (cache && Date.now() - cache.at < TTL_MS) {
      return NextResponse.json({ items: cache.data, cached: true, fetchedAt: cache.at });
    }
    const data = await fetchTradlinx();
    cache = { at: Date.now(), data };
    return NextResponse.json({ items: data, cached: false, fetchedAt: cache.at });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 502 });
  }
}
