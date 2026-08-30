import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const ESPN_LEAGUE_ID="2145514194",SEASON=2026;

export async function GET(){
  try{
    const u=new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leagues/${ESPN_LEAGUE_ID}`);
    for(const view of["mSettings","mStatus"])u.searchParams.append("view",view);
    const headers={accept:"application/json, text/plain, */*","user-agent":"DirtyDozensFFL/1.0"};
    if(process.env.ESPN_S2&&process.env.ESPN_SWID)headers.cookie=`espn_s2=${process.env.ESPN_S2}; SWID=${process.env.ESPN_SWID}`;
    const r=await fetch(u,{headers,cache:"no-store"});
    if(!r.ok)return NextResponse.json({error:`ESPN returned ${r.status}`},{status:r.status});
    const d=await r.json();
    return NextResponse.json({season:SEASON,name:d?.settings?.name||d?.name||"Dirty Dozens FFL",settings:d?.settings||{}});
  }catch(e){
    return NextResponse.json({error:e?.message||"ESPN settings unavailable"},{status:500});
  }
}
