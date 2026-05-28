// 진단용 — Port-MIS Info5 원시 XML에서 어떤 필드가 오는지 모든 키를 그대로 노출.
// IMO / MMSI / 기타 미파싱 식별자 존재 여부 확인용.
import { NextRequest, NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";

export const runtime = "nodejs";

const BASE_URL = "https://apis.data.go.kr/1192000/VsslEtrynd5/Info5";
const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });

export async function GET(req: NextRequest) {
  const serviceKey = process.env.PORTMIS_SERVICE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "no key" }, { status: 500 });

  const sp = req.nextUrl.searchParams;
  const qs = new URLSearchParams({
    serviceKey,
    prtAgCd: sp.get("prtAgCd") ?? "030",
    sde: sp.get("sde") ?? "20260520",
    ede: sp.get("ede") ?? "20260528",
    deGb: sp.get("deGb") ?? "I",
    pageNo: "1",
    numOfRows: sp.get("numOfRows") ?? "3",
  });
  const url = `${BASE_URL}?${qs.toString().replace(
    /serviceKey=([^&]+)/,
    `serviceKey=${encodeURI(decodeURIComponent(serviceKey))}`,
  )}`;
  const res = await fetch(url, { cache: "no-store" });
  const xml = await res.text();
  const parsed: any = parser.parse(xml);
  const root = parsed?.response ?? parsed;
  const items = root?.body?.items?.item;
  const arr = Array.isArray(items) ? items : items ? [items] : [];

  return NextResponse.json({
    itemCount: arr.length,
    firstItemKeys: arr[0] ? Object.keys(arr[0]) : [],
    firstItem: arr[0] ?? null,
    rawXmlSnippet: xml.slice(0, 4000),
  });
}
