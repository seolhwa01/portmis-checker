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

  // 전체 item에서 식별자 후보 필드만 추출
  const summary = arr.map((it: any) => {
    const detailsArr = Array.isArray(it.details?.detail)
      ? it.details.detail
      : it.details?.detail
      ? [it.details.detail]
      : [];
    return {
      clsgn: it.clsgn,
      vsslNm: it.vsslNm,
      vsslKndNm: it.vsslKndNm,
      etryptYear: it.etryptYear,
      etryptCo: it.etryptCo,
      mrNums: detailsArr.map((d: any) => d.mrNum).filter(Boolean),
      satmntEntrpsNms: [...new Set(detailsArr.map((d: any) => d.satmntEntrpsNm).filter(Boolean))],
      laidupFcltyCds: [...new Set(detailsArr.map((d: any) => d.laidupFcltyCd).filter(Boolean))],
    };
  });
  return NextResponse.json({
    itemCount: arr.length,
    summary,
    firstItem: arr[0] ?? null,
  });
}
