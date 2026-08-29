import Link from "next/link";
import PageShell from "../../components/PageShell";

export const dynamic = "force-dynamic";

const ESPN_LEAGUE_ID = "2145514194";
const CURRENT_SEASON = 2026;
const START_SEASON = 2022;
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
function headers(){const h={accept:"application/json, text/plain, */*","user-agent":"DirtyDozensFFL/1.0"};if(process.env.ESPN_S2&&process.env.ESPN_SWID)h.cookie=`espn_s2=${process.env.ESPN_S2}; SWID=${process.env.ESPN_SWID}`;return h;}
async function fetchSeason(season){const url=new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${ESPN_LEAGUE_ID}`);for(const v of ["mTeam","mStandings","mMatchupScore","mStatus"])url.searchParams.append("view",v);const r=await fetch(url,{headers:headers(),cache:"no-store"});if(!r.ok)throw new Error(`ESPN ${season}: ${r.status}`);return r.json();}
async function getArchive(){const seasons=Array.from({length:CURRENT_SEASON-START_SEASON+1},(_,i)=>START_SEASON+i);const r=await Promise.all(seasons.map(async season=>{try{return{season,data:await fetchSeason(season)}}catch{return null}}));return r.filter(Boolean);}
function rawOwner(team,members){const m=members.get(team?.owners?.[0]);return m?.displayName||[m?.firstName,m?.lastName].filter(Boolean).join(" ")||"";}
function isReadableOwner(name){const n=String(name||"").trim();if(!n)return false;const compact=normalize(n);if(/^espnfan\d+$/i.test(compact))return false;if(/^[a-z]+\d{2,}$/i.test(compact))return false;return true;}
function pct(v){return `${(v*100).toFixed(1)}%`;}

function buildAnalytics(archive){
  const owners=new Map(),games=[];
  function ensure(name){const key=normalize(name);if(!owners.has(key))owners.set(key,{key,manager:name,currentTeam:"",latestSeason:0,seasons:new Set(),wins:0,losses:0,ties:0,pf:0,pa:0,titles:new Set(),scores:[]});return owners.get(key);}
  for(const {season,data} of archive){
    const members=new Map((data?.members||[]).map(m=>[m.id,m]));
    const byId=new Map();
    for(const team of data?.teams||[]){
      const manager=rawOwner(team,members);if(!isReadableOwner(manager))continue;
      const o=ensure(manager);o.seasons.add(season);if(season>=o.latestSeason){o.latestSeason=season;o.currentTeam=teamName(team);}if(Number(team.rankCalculatedFinal)===1)o.titles.add(season);byId.set(Number(team.id),{key:o.key,manager,name:teamName(team)});
    }
    for(const g of data?.schedule||[]){
      if(!g?.home||!g?.away||!g.winner||g.winner==="UNDECIDED")continue;
      const h=byId.get(Number(g.home.teamId)),a=byId.get(Number(g.away.teamId));if(!h||!a||h.key===a.key)continue;
      const hs=Number(g.home.totalPoints),as=Number(g.away.totalPoints);if(!Number.isFinite(hs)||!Number.isFinite(as))continue;
      const ho=owners.get(h.key),ao=owners.get(a.key);ho.pf+=hs;ho.pa+=as;ao.pf+=as;ao.pa+=hs;ho.scores.push(hs);ao.scores.push(as);
      if(hs>as){ho.wins++;ao.losses++;}else if(as>hs){ao.wins++;ho.losses++;}else{ho.ties++;ao.ties++;}
      games.push({h:h.key,a:a.key,hs,as,margin:Math.abs(hs-as)});
    }
  }
  for(const c of KNOWN_CHAMPIONS)ensure(c.manager).titles.add(c.season);
  const leaderboard=[...owners.values()].map(o=>{const gp=o.wins+o.losses+o.ties;const seasons=o.seasons.size;return{...o,gp,seasons,winPct:gp?(o.wins+o.ties*.5)/gp:0,titleCount:o.titles.size,titleRate:seasons?o.titles.size/seasons:0,avg:o.scores.length?o.pf/o.scores.length:0};}).filter(o=>o.gp>0).sort((a,b)=>b.winPct-a.winPct||b.wins-a.wins||b.pf-a.pf);
  const pairs=new Map();for(const g of games){const keys=[g.h,g.a].sort(),k=keys.join("::");if(!pairs.has(k))pairs.set(k,{key:k,aKey:keys[0],bKey:keys[1],meetings:0,aWins:0,bWins:0,ties:0,margin:0});const p=pairs.get(k);p.meetings++;p.margin+=g.margin;if(g.hs===g.as)p.ties++;else{const w=g.hs>g.as?g.h:g.a;if(w===p.aKey)p.aWins++;else p.bWins++;}}
  const rivalries=[...pairs.values()].map(p=>({...p,a:owners.get(p.aKey),b:owners.get(p.bKey),avgMargin:p.margin/p.meetings})).filter(p=>p.a&&p.b).sort((a,b)=>b.meetings-a.meetings||a.avgMargin-b.avgMargin);
  return{leaderboard,rivalries,scoring:[...leaderboard].sort((a,b)=>b.avg-a.avg),champions:[...leaderboard].filter(o=>o.seasons>0).sort((a,b)=>b.titleRate-a.titleRate||b.titleCount-a.titleCount),seasons:archive.map(x=>x.season)};
}

const rowStyle={display:"grid",gridTemplateColumns:"44px minmax(0,1fr) auto",gap:10,alignItems:"center",borderBottom:"1px solid #2a3138",padding:"14px 0"};
export default async function Analytics(){
  const d=buildAnalytics(await getArchive());const label=d.seasons.length?`${Math.min(...d.seasons)}–${Math.max(...d.seasons)}`:"ESPN ARCHIVE";
  return <PageShell title="LEAGUE ANALYTICS" kicker="ALL-TIME LEAGUE STATS">
    <section className="panel" style={{marginBottom:18}}><div className="panelTitle"><h3>HOW TO READ THIS PAGE</h3><span>{label}</span></div><p style={{margin:0,color:"#aab2bb",lineHeight:1.6}}>Stats below use completed ESPN games. Rankings are by manager/owner, not by changing team name. ESPN usernames that cannot be confidently matched to a real league member are hidden rather than displayed as confusing account IDs.</p></section>

    <section className="panel" style={{marginBottom:18}}><div className="panelTitle"><h3>ALL-TIME LEADERBOARD</h3><span>BEST WIN %</span></div>
      {d.leaderboard.length?d.leaderboard.map((o,i)=><div key={o.key} style={rowStyle}><b style={{fontSize:20}}>#{i+1}</b><div><strong style={{display:"block",fontSize:17}}>{o.manager}</strong><small style={{color:"#8e98a3"}}>{o.currentTeam||"Franchise"} · {o.gp} games</small></div><div style={{textAlign:"right"}}><strong>{o.wins}-{o.losses}{o.ties?`-${o.ties}`:""}</strong><small style={{display:"block",color:"#8e98a3"}}>{pct(o.winPct)} win</small></div></div>):<p>Historical ESPN owner data is not available yet.</p>}
    </section>

    <section className="panel" style={{marginBottom:18}}><div className="panelTitle"><h3>BIGGEST RIVALRIES</h3><span>MOST MEETINGS</span></div>
      <p style={{color:"#8e98a3",marginTop:0}}>Owners who have faced each other the most in the available archive.</p>
      {d.rivalries.slice(0,5).map((p,i)=><div key={p.key} style={{borderBottom:"1px solid #2a3138",padding:"14px 0"}}><small>#{i+1} · {p.meetings} GAMES</small><strong style={{display:"block",fontSize:18,margin:"5px 0"}}>{p.a.manager} vs {p.b.manager}</strong><span style={{color:"#8e98a3"}}>Series {p.aWins}-{p.bWins}{p.ties?`-${p.ties}`:""} · Avg margin {p.avgMargin.toFixed(1)} pts</span></div>)}
    </section>

    <div className="commissionerGrid">
      <section className="panel"><div className="panelTitle"><h3>SCORING LEADERS</h3><span>AVG / GAME</span></div>{d.scoring.slice(0,5).map((o,i)=><div key={o.key} style={rowStyle}><b>#{i+1}</b><span><strong>{o.manager}</strong><small style={{display:"block",color:"#8e98a3"}}>{o.gp} games</small></span><strong>{o.avg.toFixed(1)}</strong></div>)}</section>
      <section className="panel"><div className="panelTitle"><h3>CHAMPIONS</h3><span>TITLE RATE</span></div>{d.champions.slice(0,5).map((o,i)=><div key={o.key} style={rowStyle}><b>#{i+1}</b><span><strong>{o.manager}</strong><small style={{display:"block",color:"#8e98a3"}}>{o.titleCount} title{o.titleCount===1?"":"s"} · {o.seasons} ESPN seasons</small></span><strong>{pct(o.titleRate)}</strong></div>)}</section>
    </div>
    <section className="panel" style={{marginTop:18}}><Link href="/teams" className="secondaryButton" style={{textDecoration:"none"}}>Explore Team Profiles →</Link></section>
  </PageShell>;
}
