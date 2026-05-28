import { NextRequest, NextResponse } from "next/server";
import { fetchInfo5, type DeGb } from "@/app/lib/portmis";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const serviceKey = process.env.PORTMIS_SERVICE_KEY;
  if (!serviceKey || serviceKey === "YOUR_SERVICE_KEY_HERE") {
    return NextResponse.json(
      { error: "PORTMIS_SERVICE_KEY 환경변수가 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  const sp = req.nextUrl.searchParams;
  const prtAgCd = sp.get("prtAgCd");
  const sde = sp.get("sde");
  const ede = sp.get("ede");
  if (!prtAgCd || !sde || !ede) {
    return NextResponse.json(
      { error: "prtAgCd, sde, ede 는 필수 파라미터입니다." },
      { status: 400 },
    );
  }

  try {
    const data = await fetchInfo5(
      {
        prtAgCd,
        sde,
        ede,
        clsgn: sp.get("clsgn") || undefined,
        deGb: (sp.get("deGb") as DeGb) || undefined,
        pageNo: sp.get("pageNo") ? Number(sp.get("pageNo")) : undefined,
        numOfRows: sp.get("numOfRows") ? Number(sp.get("numOfRows")) : undefined,
      },
      serviceKey,
    );
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Upstream error" },
      { status: 502 },
    );
  }
}
