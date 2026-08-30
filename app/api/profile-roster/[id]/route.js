import { NextResponse } from 'next/server';

const ESPN_LEAGUE_ID='2145514194';
const SEASON=2026;

function headers(){const h={accept:'application/json, text/plain, */*','user-agent':'DirtyDozensFFL/1.0'};if(process.env.ESPN_S2&&process.env.ESPN_SWID)h.cookie=`espn_s2=${process.env.ESPN_S2}; SWID=${process.env.ESPN_SWID}`;return h}
function latestStat(stats,source){return (stats||[]).filter(s=>Number(s.statSourceId)===source).sort((a,b)=>Number(b.scoringPeriodId||0)-Number(a.scoringPeriodId||0))[0]||null}
function playerRow(entry){const p=entry?.playerPoolEntry?.player;if(!p)return null;const actual=latestStat(p.stats,0),projected=latestStat(p.stats,1);const points=Number(actual?.appliedTotal||0),projection=Number(projected?.appliedTotal||0);return{name:p.fullName||'Player',position:p.defaultPositionId?String(p.defaultPositionId):'',proTeam:p.proTeamId?String(p.proTeamId):'',points,projection,delta:points-projection}}

export async function GET(_req,{params}){
  try{
    const {id}=await params;
    const url=new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leagues/${ESPN_LEAGUE_ID}`);
    for(const view of ['mTeam','mRoster','mStatus'])url.searchParams.append('view',view);
    const res=await fetch(url,{headers:headers(),cache:'no-store'});if(!res.ok)return NextResponse.json({error:'ESPN unavailable'},{status:502});
    const data=await res.json();
    const team=(data?.teams||[]).find(t=>String(t.id)===String(id));
    const players=(team?.roster?.entries||[]).map(playerRow).filter(Boolean);
    const star=players.length?[...players].sort((a,b)=>b.points-a.points)[0]:null;
    const underperformer=players.filter(p=>p.projection>0).sort((a,b)=>a.delta-b.delta)[0]||null;
    return NextResponse.json({star,underperformer});
  }catch(error){return NextResponse.json({error:error?.message||'Unable to load roster'},{status:500})}
}
