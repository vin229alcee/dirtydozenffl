import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import PageShell from "../../components/PageShell";

export const dynamic = "force-dynamic";

const ESPN_LEAGUE_ID = "2145514194";
const CURRENT_SEASON = 2026;
const START_SEASON = 2022;
const MAP_RECORD = "__OWNER_MAP__";
const normalize = value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const KNOWN_CHAMPIONS = [
  { season: 2024, manager: "Antonio Samilton" },
  { season: 2023, manager: "Luke Erbacher" },
  { season: 2022, manager: "Vin Alcee" },
];

function teamName(team) {
  if (!team) return "Team";
  if (team.name) return team.name;
  return [team.location, team.nickname].filter(Boolean).join(" ").trim() || team.abbrev || `Team ${team.id}`;
}
function espnHeaders(){const h={accept:"application/json, text/plain, */*","user-agent":"DirtyDozensFFL/1.0"};if(process.env.ESPN_S2&&process.env.ESPN_SWID)h.cookie=`espn_s2=${process.env.ESPN_S2}; SWID=${process.env.ESPN_SWID}`;return h;}
async function fetchSeason(season){const url=new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${ESPN_LEAGUE_ID}`);for(const v of ["mTeam","mStandings","mMatchupScore","mStatus"])url.searchParams.append("view",v);const r=await fetch(url,{headers:espnHeaders(),cache:"no-store"});if(!r.ok)throw new Error(`ESPN ${season}: ${r.status}`);return r.json();}
async function getArchive(){const seasons=Array.from({length:CURRENT_SEASON-START_SEASON+1},(_,i)=>START_SEASON+i);const rows=await Promise.all(seasons.map(async season=>{try{return{season,data:await fetchSeason(season)}}catch{return null}}));return rows.filter(Boolean);}
function rawOwner(team,members){const m=members.get(team?.owners?.[0]);return m?.displayName||[m?.firstName,m?.lastName].filter(Boolean).join(" ")||"";}
function isReadableOwner(name){const compact=normalize(name);if(!compact)return false;if(/^espnfan\d+$/i.test(compact))return false;if(/^[a-z]+\d{2,}$/i.test(compact))return false;return true;}

async function getLocalData(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)return{teams:[],mappings:new Map(),champions:[]};
  const supabase=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const [{data:teams},{data:maps},{data:champions}]=await Promise.all([
    supabase.from("teams").select("id,name,manager"),
    supabase.from("league_records").select("record_value,team_id").eq("record_name",MAP_RECORD),
    supabase.from("champions").select("season,team_id").order("season",{ascending:false}),
  ]);
  const byId=Object.fromEntries((teams||[]).map(t=>[t.id,t]));
  const mappings=new Map((maps||[]).map(row=>{const team=byId[row.team_id];return[normalize(row.record_value),team?{manager:team.manager||team.name,currentTeam:team.name||""}:null]}).filter(([,v])=>v));
  const manual=(champions||[]).map(row=>({season:Number(row.season),manager:byId[row.team_id]?.manager||byId[row.team_id]?.name||""})).filter(x=>x.manager);
  return{teams:teams||[],mappings,champions:manual};
}

function buildHall(archive,local){
  const owners=new Map(),games=[];
  function ensure(manager,currentTeam=""){
    const key=normalize(manager);if(!key)return null;
    if(!owners.has(key))owners.set(key,{key,manager,currentTeam,latestSeason:0,seasons:new Set(),wins:0,losses:0,ties:0,pf:0,pa:0,scores:[],titles:new Set(),weeklyHigh:null,streak:0});
    const o=owners.get(key);if(currentTeam&&!o.currentTeam)o.currentTeam=currentTeam;return o;
  }
  for(const {season,data} of archive){
    const members=new Map((data?.members||[]).map(m=>[m.id,m]));
    const byId=new Map();
    for(const team of data?.teams||[]){
      const raw=rawOwner(team,members),mapped=local.mappings.get(normalize(raw)),manager=mapped?.manager||(isReadableOwner(raw)?raw:"");
      if(!manager)continue;
      const o=ensure(manager,mapped?.currentTeam||teamName(team));o.seasons.add(season);if(season>=o.latestSeason){o.latestSeason=season;o.currentTeam=mapped?.currentTeam||teamName(team);}if(Number(team.rankCalculatedFinal)===1)o.titles.add(season);byId.set(Number(team.id),o.key);
    }
    for(const g of data?.schedule||[]){
      if(!g?.home||!g?.away||!g.winner||g.winner==="UNDECIDED")continue;
      const hk=byId.get(Number(g.home.teamId)),ak=byId.get(Number(g.away.teamId));if(!hk||!ak||hk===ak)continue;
      const hs=Number(g.home.totalPoints),as=Number(g.away.totalPoints);if(!Number.isFinite(hs)||!Number.isFinite(as))continue;
      const h=owners.get(hk),a=owners.get(ak),week=Number(g.matchupPeriodId||0);
      h.pf+=hs;h.pa+=as;a.pf+=as;a.pa+=hs;h.scores.push(hs);a.scores.push(as);
      if(!h.weeklyHigh||hs>h.weeklyHigh.score)h.weeklyHigh={score:hs,season,week};if(!a.weeklyHigh||as>a.weeklyHigh.score)a.weeklyHigh={score:as,season,week};
      if(hs>as){h.wins++;a.losses++;}else if(as>hs){a.wins++;h.losses++;}else{h.ties++;a.ties++;}
      games.push({season,week,h:hk,a:ak,hs,as});
    }
  }
  for(const c of KNOWN_CHAMPIONS){const o=ensure(c.manager);if(o)o.titles.add(c.season);}
  for(const c of local.champions){const o=ensure(c.manager);if(o)o.titles.add(c.season);}

  const streakState=new Map();
  for(const g of [...games].sort((a,b)=>a.season-b.season||a.week-b.week)){
    for(const [key,won] of [[g.h,g.hs>g.as],[g.a,g.as>g.hs]]){
      const state=streakState.get(`${g.season}:${key}`)||0,next=won?state+1:0;streakState.set(`${g.season}:${key}`,next);const o=owners.get(key);if(next>o.streak)o.streak=next;
    }
  }

  const list=[...owners.values()].map(o=>{const gp=o.wins+o.losses+o.ties;return{...o,gp,seasonsCount:o.seasons.size,winPct:gp?(o.wins+o.ties*.5)/gp:0,avg:o.scores.length?o.pf/o.scores.length:0,titleCount:o.titles.size};}).filter(o=>o.gp>0||o.titleCount>0);
  const byWins=[...list].sort((a,b)=>b.wins-a.wins||b.winPct-a.winPct||b.pf-a.pf);
  const byPct=[...list].filter(o=>o.gp>=10).sort((a,b)=>b.winPct-a.winPct||b.wins-a.wins);
  const byPoints=[...list].sort((a,b)=>b.pf-a.pf||b.avg-a.avg);
  const byAvg=[...list].filter(o=>o.gp>=10).sort((a,b)=>b.avg-a.avg||b.pf-a.pf);
  const byHigh=[...list].filter(o=>o.weeklyHigh).sort((a,b)=>b.weeklyHigh.score-a.weeklyHigh.score);
  const byStreak=[...list].sort((a,b)=>b.streak-a.streak||b.wins-a.wins);
  const champions=[...list].filter(o=>o.titleCount).sort((a,b)=>b.titleCount-a.titleCount||b.wins-a.wins);
  return{list,byWins,byPct,byPoints,byAvg,byHigh,byStreak,champions,seasons:archive.map(x=>x.season)};
}

function LeaderList({rows,value,detail}){return <div className="hofLeaderList">{rows.slice(0,5).map((o,i)=><div className="hofLeaderRow" key={o.key}><b>#{i+1}</b><div><strong>{o.manager}</strong><small>{o.currentTeam||"Franchise"}</small></div><span><strong>{value(o)}</strong>{detail?<small>{detail(o)}</small>:null}</span></div>)}</div>}

export default async function HallOfFame(){
  const [archive,local]=await Promise.all([getArchive(),getLocalData()]);
  const d=buildHall(archive,local),label=d.seasons.length?`${Math.min(...d.seasons)}–${Math.max(...d.seasons)}`:"ESPN ARCHIVE";
  const topChampion=d.champions[0],topWins=d.byWins[0],topScore=d.byHigh[0];
  return <PageShell title="HALL OF FAME" kicker="DIRTY DOZENS IMMORTALS">
    <section className="panel hofHero">
      <span className="eyebrow">ALL-TIME LEGACY · {label}</span>
      <h2>Where Dirty Dozens legends live forever.</h2>
      <p>Championships, career dominance and record-setting performances are calculated from the available ESPN archive and merged through the commissioner's historical owner mappings.</p>
      <div className="hofHeroStats">
        <div><span>MANAGERS TRACKED</span><strong>{d.list.length}</strong></div>
        <div><span>CHAMPIONS</span><strong>{d.champions.length}</strong></div>
        <div><span>SEASONS</span><strong>{d.seasons.length}</strong></div>
      </div>
    </section>

    <div className="hofSpotlightGrid">
      <article className="panel hofSpotlight"><span>CHAMPIONSHIP KING</span><h3>{topChampion?.manager||"TBD"}</h3><strong>{topChampion?`${topChampion.titleCount} TITLE${topChampion.titleCount===1?"":"S"}`:"—"}</strong><p>{topChampion?.titles?.size?[...topChampion.titles].sort((a,b)=>b-a).join(" · "):"Championship history will populate automatically."}</p></article>
      <article className="panel hofSpotlight"><span>ALL-TIME WINS</span><h3>{topWins?.manager||"TBD"}</h3><strong>{topWins?.wins??"—"}</strong><p>{topWins?`${topWins.wins}-${topWins.losses}${topWins.ties?`-${topWins.ties}`:""} career record`:"Career records will populate automatically."}</p></article>
      <article className="panel hofSpotlight"><span>SCORING RECORD</span><h3>{topScore?.manager||"TBD"}</h3><strong>{topScore?.weeklyHigh?topScore.weeklyHigh.score.toFixed(1):"—"}</strong><p>{topScore?.weeklyHigh?`${topScore.weeklyHigh.season} · Week ${topScore.weeklyHigh.week}`:"Weekly scoring records will populate automatically."}</p></article>
    </div>

    <section className="panel hofChampions">
      <div className="panelTitle"><h3>CHAMPIONSHIP WING</h3><span>THE RING CLUB</span></div>
      {d.champions.length?<div className="hofChampionGrid">{d.champions.map((o,i)=><article key={o.key}><span>{String(i+1).padStart(2,"0")}</span><h3>{o.manager}</h3><strong>{o.titleCount}× CHAMPION</strong><p>{[...o.titles].sort((a,b)=>b-a).join(" · ")}</p><small>{o.currentTeam||"Franchise"}</small></article>)}</div>:<div className="emptyPanel">Championship history will appear here once available.</div>}
    </section>

    <div className="hofCategoryGrid">
      <section className="panel"><div className="panelTitle"><h3>ALL-TIME WINS</h3><span>CAREER</span></div><LeaderList rows={d.byWins} value={o=>String(o.wins)} detail={o=>`${o.gp} games`}/></section>
      <section className="panel"><div className="panelTitle"><h3>BEST WIN %</h3><span>MIN. 10 GAMES</span></div><LeaderList rows={d.byPct} value={o=>`${(o.winPct*100).toFixed(1)}%`} detail={o=>`${o.wins}-${o.losses}${o.ties?`-${o.ties}`:""}`}/></section>
      <section className="panel"><div className="panelTitle"><h3>MOST POINTS</h3><span>CAREER PF</span></div><LeaderList rows={d.byPoints} value={o=>o.pf.toFixed(1)} detail={o=>`${o.avg.toFixed(1)} avg`}/></section>
      <section className="panel"><div className="panelTitle"><h3>SCORING AVERAGE</h3><span>MIN. 10 GAMES</span></div><LeaderList rows={d.byAvg} value={o=>o.avg.toFixed(1)} detail={o=>`${o.gp} games`}/></section>
      <section className="panel"><div className="panelTitle"><h3>HIGHEST WEEK</h3><span>SINGLE GAME</span></div><LeaderList rows={d.byHigh} value={o=>o.weeklyHigh.score.toFixed(1)} detail={o=>`${o.weeklyHigh.season} W${o.weeklyHigh.week}`}/></section>
      <section className="panel"><div className="panelTitle"><h3>WIN STREAKS</h3><span>LONGEST RUN</span></div><LeaderList rows={d.byStreak} value={o=>`${o.streak} W`} detail={o=>`${o.wins} career wins`}/></section>
    </div>

    <section className="panel hofFooterPanel"><div><span className="eyebrow">LEGACY DATA</span><h3>Want the deeper numbers?</h3><p>Head to League Analytics for rivalries, scoring rates and full all-time manager performance.</p></div><div><Link className="secondaryButton" href="/analytics">League Analytics</Link><Link className="secondaryButton" href="/history">Championship History</Link></div></section>
  </PageShell>;
}
