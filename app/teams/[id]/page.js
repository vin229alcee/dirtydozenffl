import Image from "next/image";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import PageShell from "../../../components/PageShell";

export const dynamic = "force-dynamic";

const ESPN_LEAGUE_ID = "2145514194";
const SEASON = 2026;
const normalize = value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const KNOWN_TITLES = { antoniosamilton: 1, lukeerbacher: 2, vinalcee: 1 };

function espnTeamName(team) {
  if (!team) return "Team";
  if (team.name) return team.name;
  return [team.location, team.nickname].filter(Boolean).join(" ").trim() || team.abbrev || `Team ${team.id}`;
}

function headers() {
  const value = { accept: "application/json, text/plain, */*", "user-agent": "DirtyDozensFFL/1.0" };
  if (process.env.ESPN_S2 && process.env.ESPN_SWID) value.cookie = `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.ESPN_SWID}`;
  return value;
}

async function getLocal() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { teams: [], rankings: [] };
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [{ data: teams }, { data: rankings }] = await Promise.all([
    supabase.from("teams").select("*").order("id"),
    supabase.from("power_rankings").select("*").eq("season", SEASON).order("week", { ascending: false }).order("rank")
  ]);
  return { teams: teams || [], rankings: rankings || [] };
}

async function getEspn() {
  const url = new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leagues/${ESPN_LEAGUE_ID}`);
  for (const view of ["mTeam", "mStandings", "mMatchupScore"]) url.searchParams.append("view", view);
  const response = await fetch(url, { headers: headers(), cache: "no-store" });
  if (!response.ok) throw new Error(`ESPN ${response.status}`);
  const data = await response.json();
  return { week: Number(data?.status?.currentMatchupPeriod || 1), teams: data?.teams || [], schedule: data?.schedule || [] };
}

function autoRanks(teams, schedule, currentWeek) {
  const base = teams.map(team => {
    const o = team?.record?.overall || {};
    const games = Number(o.wins||0)+Number(o.losses||0)+Number(o.ties||0);
    return { id:Number(team.id), name:espnTeamName(team), wins:Number(o.wins||0), pointsFor:Number(o.pointsFor||0), winPct:games?(Number(o.wins||0)+Number(o.ties||0)*.5)/games:0, qualityWins:0 };
  });
  const byId = Object.fromEntries(base.map(t=>[t.id,t]));
  for (const game of schedule) {
    if (!game?.home || !game?.away || Number(game.matchupPeriodId) >= currentWeek) continue;
    const h=byId[Number(game.home.teamId)], a=byId[Number(game.away.teamId)];
    if (!h||!a) continue;
    const hs=Number(game.home.totalPoints||0), as=Number(game.away.totalPoints||0);
    if(hs>as) h.qualityWins+=a.winPct; else if(as>hs) a.qualityWins+=h.winPct;
  }
  const maxPF=Math.max(...base.map(t=>t.pointsFor),1), maxQ=Math.max(...base.map(t=>t.qualityWins),1);
  return base.map(t=>({...t,score:t.winPct*.45+(t.pointsFor/maxPF)*.40+(t.qualityWins/maxQ)*.15})).sort((a,b)=>b.score-a.score||b.pointsFor-a.pointsFor||b.wins-a.wins).map((t,i)=>({...t,rank:i+1}));
}

export default async function TeamProfile({ params }) {
  const { id } = await params;
  const local = await getLocal();
  const localTeam = local.teams.find(t => String(t.id) === String(id));
  if (!localTeam) return <PageShell title="TEAM PROFILE" kicker="FRANCHISE FILE"><section className="panel emptyPanel">This franchise could not be found. <Link href="/teams">Return to Teams</Link></section></PageShell>;

  let profile = {
    name: localTeam.name, manager: localTeam.manager, logo: localTeam.logo,
    wins:Number(localTeam.wins||0), losses:Number(localTeam.losses||0), ties:0,
    pf:Number(localTeam.points_for||0), pa:Number(localTeam.points_against||0), rank:null, week:1,
    games:[], opponents:[], high:null, biggest:null, titles:Math.max(Number(localTeam.championships||0), KNOWN_TITLES[normalize(localTeam.manager)] || 0), source:"SAVED DATA"
  };

  try {
    const espn = await getEspn();
    const team = espn.teams.find(t => normalize(espnTeamName(t)) === normalize(localTeam.name));
    if (team) {
      const o=team?.record?.overall||{};
      const rankings=autoRanks(espn.teams,espn.schedule,espn.week);
      const auto=rankings.find(r=>r.id===Number(team.id));
      const commissionerRows=local.rankings.filter(r=>Number(r.week)===espn.week);
      const override=commissionerRows.length===12?commissionerRows.find(r=>Number(r.team_id)===Number(localTeam.id)):null;
      const espnById=Object.fromEntries(espn.teams.map(t=>[Number(t.id),t]));
      const games=[];
      for(const game of espn.schedule){
        if(!game?.home||!game?.away) continue;
        const homeId=Number(game.home.teamId), awayId=Number(game.away.teamId);
        if(homeId!==Number(team.id)&&awayId!==Number(team.id)) continue;
        const isHome=homeId===Number(team.id), mine=isHome?game.home:game.away, opp=isHome?game.away:game.home;
        const myScore=Number(mine.totalPoints||0), oppScore=Number(opp.totalPoints||0), period=Number(game.matchupPeriodId||0);
        const hasStarted=myScore>0||oppScore>0||period<espn.week;
        games.push({ week:period, opponent:espnTeamName(espnById[Number(opp.teamId)]), myScore, oppScore, result:!hasStarted?"—":myScore>oppScore?"W":myScore<oppScore?"L":"T", margin:myScore-oppScore });
      }
      const played=games.filter(g=>g.result!=="—");
      const high=played.length?[...played].sort((a,b)=>b.myScore-a.myScore)[0]:null;
      const biggest=played.filter(g=>g.result==="W").sort((a,b)=>b.margin-a.margin)[0]||null;
      const head={};
      for(const g of played){ if(!head[g.opponent]) head[g.opponent]={opponent:g.opponent,w:0,l:0,t:0,pf:0,pa:0}; const h=head[g.opponent]; if(g.result==="W")h.w++;else if(g.result==="L")h.l++;else h.t++;h.pf+=g.myScore;h.pa+=g.oppScore; }
      profile={...profile,wins:Number(o.wins||0),losses:Number(o.losses||0),ties:Number(o.ties||0),pf:Number(o.pointsFor||0),pa:Number(o.pointsAgainst||0),rank:Number(override?.rank||auto?.rank||0)||null,week:espn.week,games:games.sort((a,b)=>b.week-a.week),opponents:Object.values(head).sort((a,b)=>b.w-a.w||a.l-b.l),high,biggest,source:"ESPN LIVE"};
    }
  } catch {}

  const record=`${profile.wins}-${profile.losses}${profile.ties?`-${profile.ties}`:""}`;
  return <PageShell title={profile.name} kicker="FRANCHISE PROFILE">
    <section className="panel" style={{marginBottom:18}}>
      <div style={{display:"flex",alignItems:"center",gap:18,flexWrap:"wrap"}}>
        <div className="logoPlate">{profile.logo?<Image src={profile.logo} alt={`${profile.name} logo`} width={120} height={140}/>:null}</div>
        <div style={{flex:1,minWidth:220}}><h2 style={{fontFamily:"Oswald, sans-serif",fontSize:32,margin:"0 0 4px"}}>{profile.name}</h2><p style={{margin:"0 0 12px",color:"#8e98a3"}}>{profile.manager}</p><b style={{fontSize:10,letterSpacing:1.2,color:"#d9aa4e"}}>{profile.source} · WEEK {profile.week}</b></div>
        <Link href="/teams" className="secondaryButton" style={{textDecoration:"none"}}>← All Teams</Link>
      </div>
    </section>

    <div className="recordCards" style={{marginBottom:24}}>
      {[['RECORD',record],['POWER RANK',profile.rank?`#${profile.rank}`:'—'],['POINTS FOR',profile.pf.toFixed(1)],['POINTS AGAINST',profile.pa.toFixed(1)],['TITLES',String(profile.titles)],['AVG SCORE',profile.wins+profile.losses+profile.ties? (profile.pf/(profile.wins+profile.losses+profile.ties)).toFixed(1):'—']].map(([label,value])=><article className="panel recordCard" key={label}><h3>{label}</h3><strong>{value}</strong></article>)}
    </div>

    <div className="commissionerGrid">
      <section className="panel"><div className="panelTitle"><h3>FRANCHISE HIGHS</h3><span>2026</span></div>
        <div style={{display:"grid",gap:14}}><div><small>HIGHEST SCORE</small><h2 style={{margin:"4px 0"}}>{profile.high?profile.high.myScore.toFixed(1):'—'}</h2><p style={{margin:0,color:"#8e98a3"}}>{profile.high?`Week ${profile.high.week} vs ${profile.high.opponent}`:'No completed games yet'}</p></div><div><small>BIGGEST WIN</small><h2 style={{margin:"4px 0"}}>{profile.biggest?`+${profile.biggest.margin.toFixed(1)}`:'—'}</h2><p style={{margin:0,color:"#8e98a3"}}>{profile.biggest?`Week ${profile.biggest.week} vs ${profile.biggest.opponent}`:'No wins yet'}</p></div></div>
      </section>
      <section className="panel"><div className="panelTitle"><h3>RECENT RESULTS</h3><span>LATEST 5</span></div>
        {profile.games.filter(g=>g.result!=="—").slice(0,5).length?<div style={{display:"grid",gap:10}}>{profile.games.filter(g=>g.result!=="—").slice(0,5).map(g=><div key={`${g.week}-${g.opponent}`} style={{display:"grid",gridTemplateColumns:"42px 1fr auto",gap:10,alignItems:"center",borderBottom:"1px solid #2a3138",paddingBottom:9}}><b>{g.result}</b><span>Wk {g.week} · {g.opponent}</span><strong>{g.myScore.toFixed(1)}-{g.oppScore.toFixed(1)}</strong></div>)}</div>:<p>No completed games yet.</p>}
      </section>
    </div>

    <section className="panel" style={{marginTop:18}}><div className="panelTitle"><h3>HEAD-TO-HEAD</h3><span>2026 OPPONENTS</span></div>
      {profile.opponents.length?<div style={{display:"grid",gap:8}}>{profile.opponents.map(o=><div key={o.opponent} style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:16,borderBottom:"1px solid #2a3138",padding:"10px 0"}}><strong>{o.opponent}</strong><span>{o.w}-{o.l}{o.t?`-${o.t}`:''}</span><span style={{color:"#8e98a3"}}>{o.pf.toFixed(1)} PF</span></div>)}</div>:<p>Head-to-head records will populate as games are completed.</p>}
    </section>
  </PageShell>;
}
