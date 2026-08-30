import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import PageShell from "../../components/PageShell";

export const dynamic = "force-dynamic";
const ESPN_LEAGUE_ID = "2145514194", SEASON = 2026;

async function getLocalData(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)return{teams:[],rankings:[]};
  const s=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const[{data:teams},{data:rankings}]=await Promise.all([
    s.from("teams").select("id,name,manager").order("id"),
    s.from("power_rankings").select("team_id,week,rank").eq("season",SEASON).order("week",{ascending:false}).order("rank")
  ]);
  return{teams:teams||[],rankings:rankings||[]};
}

async function getEspn(){
  const u=new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leagues/${ESPN_LEAGUE_ID}`);
  for(const v of["mTeam","mMatchupScore","mStandings"])u.searchParams.append("view",v);
  const headers={accept:"application/json, text/plain, */*","user-agent":"DirtyDozensFFL/1.0"};
  if(process.env.ESPN_S2&&process.env.ESPN_SWID)headers.cookie=`espn_s2=${process.env.ESPN_S2}; SWID=${process.env.ESPN_SWID}`;
  const r=await fetch(u,{headers,cache:"no-store"});
  if(!r.ok)throw new Error(`ESPN returned ${r.status}`);
  const d=await r.json();
  return{currentWeek:Number(d?.status?.currentMatchupPeriod||1),schedule:d?.schedule||[],teams:d?.teams||[]};
}

function isFinal(g){return Boolean(g?.winner&&g.winner!=="UNDECIDED");}
function score(side){return Number(side?.totalPoints||0);}
function pct(n){return Number(n||0).toFixed(1);}

function getRecapWeek(schedule,currentWeek){
  const weeks=[...new Set(schedule.filter(g=>g?.home&&g?.away&&isFinal(g)).map(g=>Number(g.matchupPeriodId)).filter(Boolean))];
  if(!weeks.length)return null;
  return Math.max(...weeks.filter(w=>w<=currentWeek));
}

function buildRecap(schedule,week,byId,rankings){
  const games=schedule.filter(g=>Number(g.matchupPeriodId)===week&&g?.home&&g?.away&&isFinal(g)).map(g=>{
    const home=byId[Number(g.home.teamId)]||{name:`Team ${g.home.teamId}`,manager:""};
    const away=byId[Number(g.away.teamId)]||{name:`Team ${g.away.teamId}`,manager:""};
    const hs=score(g.home),as=score(g.away),homeWon=hs>as;
    return{id:g.id,home,away,hs,as,margin:Math.abs(hs-as),combined:hs+as,winner:homeWon?home:away,loser:homeWon?away:home,winnerScore:homeWon?hs:as,loserScore:homeWon?as:hs};
  });
  if(!games.length)return null;
  const performances=games.flatMap(g=>[
    {team:g.home,score:g.hs,game:g},
    {team:g.away,score:g.as,game:g}
  ]).sort((a,b)=>b.score-a.score);
  const biggest=[...games].sort((a,b)=>b.margin-a.margin)[0];
  const closest=[...games].sort((a,b)=>a.margin-b.margin||b.combined-a.combined)[0];
  const shootout=[...games].sort((a,b)=>b.combined-a.combined)[0];
  const rankRows=(rankings||[]).filter(r=>Number(r.week)===week);
  const rankById=rankRows.length===12?Object.fromEntries(rankRows.map(r=>[Number(r.team_id),Number(r.rank)])):{};
  let upset=null;
  if(Object.keys(rankById).length){
    const candidates=games.map(g=>{const wr=rankById[Number(g.winner.id)],lr=rankById[Number(g.loser.id)];return wr&&lr&&wr>lr?{...g,winnerRank:wr,loserRank:lr,upsetGap:wr-lr}:null;}).filter(Boolean).sort((a,b)=>b.upsetGap-a.upsetGap||b.margin-a.margin);
    upset=candidates[0]||null;
  }
  const teamTotals=performances.reduce((sum,p)=>sum+p.score,0),average=teamTotals/performances.length;
  return{games,high:performances[0],low:performances[performances.length-1],biggest,closest,shootout,upset,average,total:teamTotals};
}

export default async function Recap(){
  const local=await getLocalData(),byId=Object.fromEntries(local.teams.map(t=>[Number(t.id),t]));
  let currentWeek=1,week=null,recap=null,error="";
  try{const espn=await getEspn();currentWeek=espn.currentWeek;week=getRecapWeek(espn.schedule,currentWeek);if(week)recap=buildRecap(espn.schedule,week,byId,local.rankings);}catch(e){error=e?.message||"ESPN data unavailable";}
  return <PageShell title="WEEKLY RECAP" kicker="DIRTY DOZENS WEEK IN REVIEW">
    {recap?<>
      <div className="weekSummary"><div><span>RECAP</span><strong>WEEK {week}</strong></div><b>ESPN AUTO · FINAL RESULTS</b></div>
      <section className="panel recapLead"><span className="eyebrow">THE HEADLINE</span><h2>{recap.high.team.name} owned Week {week}</h2><p>{recap.high.team.name} posted the week's top score at <strong>{pct(recap.high.score)}</strong>. Across all 12 teams, the league averaged <strong>{pct(recap.average)}</strong> points.</p></section>
      <div className="recapGrid">
        <article className="panel recapStat"><span>HIGH SCORE</span><h3>{recap.high.team.name}</h3><strong>{pct(recap.high.score)}</strong><p>{recap.high.team.manager}</p></article>
        <article className="panel recapStat"><span>LOW SCORE</span><h3>{recap.low.team.name}</h3><strong>{pct(recap.low.score)}</strong><p>{recap.low.team.manager}</p></article>
        <article className="panel recapStat"><span>BIGGEST BLOWOUT</span><h3>{recap.biggest.winner.name}</h3><strong>+{pct(recap.biggest.margin)}</strong><p>over {recap.biggest.loser.name}</p></article>
        <article className="panel recapStat"><span>CLOSEST GAME</span><h3>{recap.closest.winner.name}</h3><strong>+{pct(recap.closest.margin)}</strong><p>over {recap.closest.loser.name}</p></article>
      </div>
      <section className="panel recapFeature"><div className="panelTitle"><h3>GAME OF THE WEEK RESULT</h3><span>HIGHEST COMBINED SCORE</span></div><div className="recapScore"><div><small>{recap.shootout.home.manager}</small><strong>{recap.shootout.home.name}</strong><b>{pct(recap.shootout.hs)}</b></div><span>FINAL</span><div><small>{recap.shootout.away.manager}</small><strong>{recap.shootout.away.name}</strong><b>{pct(recap.shootout.as)}</b></div></div><p>{pct(recap.shootout.combined)} combined points made this the week's biggest shootout.</p></section>
      <section className="panel"><div className="panelTitle"><h3>UPSET WATCH</h3><span>POWER RANKINGS</span></div>{recap.upset?<p className="recapCopy"><strong>#{recap.upset.winnerRank} {recap.upset.winner.name}</strong> knocked off <strong>#{recap.upset.loserRank} {recap.upset.loser.name}</strong>, {pct(recap.upset.winnerScore)}–{pct(recap.upset.loserScore)}.</p>:<p className="recapCopy">No qualifying power-ranking upset was available for this week. Once a full 12-team ranking is published for a week, the recap will identify the biggest upset automatically.</p>}</section>
      <section className="panel"><div className="panelTitle"><h3>ALL FINAL SCORES</h3><Link href="/matchups">MATCHUP CENTER</Link></div><div className="recapResults">{recap.games.map(g=><div key={g.id}><span><strong>{g.home.name}</strong> {pct(g.hs)}</span><b>FINAL</b><span>{pct(g.as)} <strong>{g.away.name}</strong></span></div>)}</div></section>
    </>:<section className="panel emptyPage"><h2>WEEKLY RECAP COMING SOON</h2><p>{error?"Live ESPN results are temporarily unavailable.":`Week ${currentWeek} is still waiting for final results. As soon as a full matchup is decided, the recap will build itself automatically.`}</p><Link className="ghostButton" href="/matchups">View current matchups</Link></section>}
  </PageShell>;
}
