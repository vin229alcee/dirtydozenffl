import Image from "next/image";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import PageShell from "../../../components/PageShell";

export const dynamic = "force-dynamic";

const ESPN_LEAGUE_ID = "2145514194";
const CURRENT_SEASON = 2026;
const START_SEASON = 2022;
const MAP_RECORD = "__OWNER_MAP__";
const normalize = value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const KNOWN_TITLE_COUNTS = { antoniosamilton: 1, lukeerbacher: 2, vinalcee: 1 };

function teamName(team) {
  if (!team) return "Team";
  if (team.name) return team.name;
  return [team.location, team.nickname].filter(Boolean).join(" ").trim() || team.abbrev || `Team ${team.id}`;
}
function headers() {
  const h = { accept: "application/json, text/plain, */*", "user-agent": "DirtyDozensFFL/1.0" };
  if (process.env.ESPN_S2 && process.env.ESPN_SWID) h.cookie = `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.ESPN_SWID}`;
  return h;
}
function rawOwner(team, members) {
  const member = members.get(team?.owners?.[0]);
  return member?.displayName || [member?.firstName, member?.lastName].filter(Boolean).join(" ") || "";
}
function readableOwner(value) {
  const compact = normalize(value);
  if (!compact) return false;
  if (/^espnfan\d+$/i.test(compact)) return false;
  if (/^[a-z]+\d{2,}$/i.test(compact)) return false;
  return true;
}
function pct(value) { return `${(value * 100).toFixed(1)}%`; }

async function getLocal() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { teams: [], rankings: [], mappings: new Map() };
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [{ data: teams }, { data: rankings }, { data: mapRows }] = await Promise.all([
    supabase.from("teams").select("*").order("id"),
    supabase.from("power_rankings").select("*").eq("season", CURRENT_SEASON).order("week", { ascending: false }).order("rank"),
    supabase.from("league_records").select("record_value,team_id").eq("record_name", MAP_RECORD),
  ]);
  const byId = Object.fromEntries((teams || []).map(t => [t.id, t]));
  const mappings = new Map((mapRows || []).map(row => {
    const team = byId[row.team_id];
    return [normalize(row.record_value), team ? { manager: team.manager || team.name, currentTeam: team.name || "" } : null];
  }).filter(([, value]) => value));
  return { teams: teams || [], rankings: rankings || [], mappings };
}

async function fetchSeason(season) {
  const url = new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${ESPN_LEAGUE_ID}`);
  for (const view of ["mTeam", "mStandings", "mMatchupScore", "mStatus"]) url.searchParams.append("view", view);
  const response = await fetch(url, { headers: headers(), cache: "no-store" });
  if (!response.ok) throw new Error(`ESPN ${season}: ${response.status}`);
  return response.json();
}
async function getArchive() {
  const seasons = Array.from({ length: CURRENT_SEASON - START_SEASON + 1 }, (_, i) => START_SEASON + i);
  const rows = await Promise.all(seasons.map(async season => {
    try { return { season, data: await fetchSeason(season) }; }
    catch { return null; }
  }));
  return rows.filter(Boolean);
}

function resolvedManager(team, members, mappings) {
  const raw = rawOwner(team, members);
  const mapped = mappings.get(normalize(raw));
  if (mapped) return mapped.manager;
  return readableOwner(raw) ? raw : "";
}

function autoRanks(teams, schedule, currentWeek) {
  const base = teams.map(team => {
    const o = team?.record?.overall || {};
    const games = Number(o.wins || 0) + Number(o.losses || 0) + Number(o.ties || 0);
    return { id:Number(team.id), wins:Number(o.wins||0), pointsFor:Number(o.pointsFor||0), winPct:games?(Number(o.wins||0)+Number(o.ties||0)*.5)/games:0, qualityWins:0 };
  });
  const byId = Object.fromEntries(base.map(t => [t.id, t]));
  for (const game of schedule || []) {
    if (!game?.home || !game?.away || Number(game.matchupPeriodId) >= currentWeek) continue;
    const h = byId[Number(game.home.teamId)], a = byId[Number(game.away.teamId)];
    if (!h || !a) continue;
    const hs = Number(game.home.totalPoints || 0), as = Number(game.away.totalPoints || 0);
    if (hs > as) h.qualityWins += a.winPct; else if (as > hs) a.qualityWins += h.winPct;
  }
  const maxPF = Math.max(...base.map(t => t.pointsFor), 1), maxQ = Math.max(...base.map(t => t.qualityWins), 1);
  return base.map(t => ({ ...t, score:t.winPct*.45+(t.pointsFor/maxPF)*.40+(t.qualityWins/maxQ)*.15 }))
    .sort((a,b)=>b.score-a.score||b.pointsFor-a.pointsFor||b.wins-a.wins)
    .map((t,i)=>({ ...t, rank:i+1 }));
}

function buildAllTime(localTeam, archive, mappings) {
  const target = normalize(localTeam.manager);
  const games = [];
  const seasonRows = [];
  const titleYears = new Set();

  for (const { season, data } of archive) {
    const members = new Map((data?.members || []).map(m => [m.id, m]));
    const teamsById = new Map();
    let mine = null;

    for (const team of data?.teams || []) {
      const manager = resolvedManager(team, members, mappings);
      const item = { team, manager, name: teamName(team) };
      teamsById.set(Number(team.id), item);
      if (manager && normalize(manager) === target) mine = item;
    }
    if (!mine) continue;

    if (Number(mine.team.rankCalculatedFinal) === 1) titleYears.add(season);
    const overall = mine.team?.record?.overall || {};
    const seasonWins = Number(overall.wins || 0), seasonLosses = Number(overall.losses || 0), seasonTies = Number(overall.ties || 0);
    const seasonGames = seasonWins + seasonLosses + seasonTies;
    seasonRows.push({ season, wins:seasonWins, losses:seasonLosses, ties:seasonTies, pf:Number(overall.pointsFor || 0), winPct:seasonGames ? (seasonWins + seasonTies*.5) / seasonGames : 0 });

    for (const game of data?.schedule || []) {
      if (!game?.home || !game?.away || !game.winner || game.winner === "UNDECIDED") continue;
      const homeId = Number(game.home.teamId), awayId = Number(game.away.teamId), myId = Number(mine.team.id);
      if (homeId !== myId && awayId !== myId) continue;
      const isHome = homeId === myId;
      const mySide = isHome ? game.home : game.away;
      const oppSide = isHome ? game.away : game.home;
      const opponent = teamsById.get(Number(oppSide.teamId));
      if (!opponent?.manager) continue;
      const myScore = Number(mySide.totalPoints), oppScore = Number(oppSide.totalPoints);
      if (!Number.isFinite(myScore) || !Number.isFinite(oppScore)) continue;
      games.push({
        season,
        week:Number(game.matchupPeriodId || 0),
        opponent:opponent.manager,
        opponentTeam:opponent.name,
        myScore,
        oppScore,
        result:myScore>oppScore?"W":myScore<oppScore?"L":"T",
        margin:myScore-oppScore,
      });
    }
  }

  const wins = games.filter(g=>g.result==="W").length;
  const losses = games.filter(g=>g.result==="L").length;
  const ties = games.filter(g=>g.result==="T").length;
  const pf = games.reduce((sum,g)=>sum+g.myScore,0);
  const pa = games.reduce((sum,g)=>sum+g.oppScore,0);
  const high = games.length ? [...games].sort((a,b)=>b.myScore-a.myScore)[0] : null;
  const biggest = games.filter(g=>g.result==="W").sort((a,b)=>b.margin-a.margin)[0] || null;
  const bestSeason = seasonRows.length ? [...seasonRows].sort((a,b)=>b.winPct-a.winPct||b.wins-a.wins||b.pf-a.pf)[0] : null;

  const head = {};
  for (const g of games) {
    const key = normalize(g.opponent);
    if (!head[key]) head[key] = { opponent:g.opponent, w:0, l:0, t:0, pf:0, pa:0, meetings:0 };
    const h = head[key]; h.meetings++; h.pf += g.myScore; h.pa += g.oppScore;
    if (g.result === "W") h.w++; else if (g.result === "L") h.l++; else h.t++;
  }

  return {
    games:games.sort((a,b)=>b.season-a.season||b.week-a.week),
    opponents:Object.values(head).sort((a,b)=>b.meetings-a.meetings||b.w-a.w),
    wins, losses, ties, pf, pa, high, biggest, bestSeason,
    seasons:seasonRows.sort((a,b)=>b.season-a.season),
    espnTitles:titleYears.size,
  };
}

export default async function TeamProfile({ params }) {
  const { id } = await params;
  const local = await getLocal();
  const localTeam = local.teams.find(t => String(t.id) === String(id));
  if (!localTeam) return <PageShell title="TEAM PROFILE" kicker="FRANCHISE FILE"><section className="panel emptyPanel">This franchise could not be found. <Link href="/teams">Return to Teams</Link></section></PageShell>;

  const archive = await getArchive();
  const allTime = buildAllTime(localTeam, archive, local.mappings);
  const knownTitles = KNOWN_TITLE_COUNTS[normalize(localTeam.manager)] || 0;
  const titles = Math.max(Number(localTeam.championships || 0), knownTitles, allTime.espnTitles);

  let current = { wins:Number(localTeam.wins||0), losses:Number(localTeam.losses||0), ties:0, pf:Number(localTeam.points_for||0), pa:Number(localTeam.points_against||0), rank:null, week:1 };
  const currentArchive = archive.find(row => row.season === CURRENT_SEASON);
  if (currentArchive) {
    const data = currentArchive.data;
    const members = new Map((data?.members || []).map(m => [m.id, m]));
    const team = (data?.teams || []).find(t => normalize(resolvedManager(t,members,local.mappings)) === normalize(localTeam.manager)) || (data?.teams || []).find(t => normalize(teamName(t)) === normalize(localTeam.name));
    if (team) {
      const o = team?.record?.overall || {};
      const week = Number(data?.status?.currentMatchupPeriod || 1);
      const auto = autoRanks(data?.teams || [], data?.schedule || [], week).find(r => r.id === Number(team.id));
      const commissionerRows = local.rankings.filter(r => Number(r.week) === week);
      const override = commissionerRows.length === 12 ? commissionerRows.find(r => Number(r.team_id) === Number(localTeam.id)) : null;
      current = { wins:Number(o.wins||0), losses:Number(o.losses||0), ties:Number(o.ties||0), pf:Number(o.pointsFor||0), pa:Number(o.pointsAgainst||0), rank:Number(override?.rank||auto?.rank||0)||null, week };
    }
  }

  const allGames = allTime.wins + allTime.losses + allTime.ties;
  const allRecord = `${allTime.wins}-${allTime.losses}${allTime.ties?`-${allTime.ties}`:""}`;
  const currentRecord = `${current.wins}-${current.losses}${current.ties?`-${current.ties}`:""}`;

  return <PageShell title={localTeam.name} kicker="FRANCHISE PROFILE">
    <section className="panel" style={{marginBottom:18}}>
      <div style={{display:"flex",alignItems:"center",gap:18,flexWrap:"wrap"}}>
        <div className="logoPlate">{localTeam.logo?<Image src={localTeam.logo} alt={`${localTeam.name} logo`} width={120} height={140}/>:null}</div>
        <div style={{flex:1,minWidth:220}}><h2 style={{fontFamily:"Oswald, sans-serif",fontSize:32,margin:"0 0 4px"}}>{localTeam.name}</h2><p style={{margin:"0 0 12px",color:"#8e98a3"}}>{localTeam.manager}</p><b style={{fontSize:10,letterSpacing:1.2,color:"#d9aa4e"}}>ESPN ARCHIVE + OWNER MAPS · {START_SEASON}–{CURRENT_SEASON}</b></div>
        <Link href="/teams" className="secondaryButton" style={{textDecoration:"none"}}>← All Teams</Link>
      </div>
    </section>

    <div className="panelTitle"><h3>ALL-TIME FRANCHISE</h3><span>{allGames} COMPLETED GAMES</span></div>
    <div className="recordCards" style={{marginBottom:24}}>
      {[["CAREER RECORD",allRecord],["WIN %",allGames?pct((allTime.wins+allTime.ties*.5)/allGames):"—"],["ALL-TIME PF",allTime.pf.toFixed(1)],["AVG SCORE",allGames?(allTime.pf/allGames).toFixed(1):"—"],["TITLES",String(titles)],["SEASONS",String(allTime.seasons.length)]].map(([label,value])=><article className="panel recordCard" key={label}><h3>{label}</h3><strong>{value}</strong></article>)}
    </div>

    <div className="commissionerGrid" style={{marginBottom:18}}>
      <section className="panel"><div className="panelTitle"><h3>CURRENT SEASON</h3><span>2026 · WEEK {current.week}</span></div>
        <div style={{display:"grid",gap:12}}><div><small>RECORD</small><h2 style={{margin:"4px 0"}}>{currentRecord}</h2></div><div><small>POWER RANK</small><h2 style={{margin:"4px 0"}}>{current.rank?`#${current.rank}`:"—"}</h2></div><div><small>POINTS FOR / AGAINST</small><h3 style={{margin:"4px 0"}}>{current.pf.toFixed(1)} / {current.pa.toFixed(1)}</h3></div></div>
      </section>
      <section className="panel"><div className="panelTitle"><h3>ALL-TIME HIGHS</h3><span>ESPN ARCHIVE</span></div>
        <div style={{display:"grid",gap:14}}><div><small>HIGHEST SCORE</small><h2 style={{margin:"4px 0"}}>{allTime.high?allTime.high.myScore.toFixed(1):"—"}</h2><p style={{margin:0,color:"#8e98a3"}}>{allTime.high?`${allTime.high.season} Wk ${allTime.high.week} vs ${allTime.high.opponent}`:"No archived result"}</p></div><div><small>BIGGEST WIN</small><h2 style={{margin:"4px 0"}}>{allTime.biggest?`+${allTime.biggest.margin.toFixed(1)}`:"—"}</h2><p style={{margin:0,color:"#8e98a3"}}>{allTime.biggest?`${allTime.biggest.season} Wk ${allTime.biggest.week} vs ${allTime.biggest.opponent}`:"No archived win"}</p></div></div>
      </section>
    </div>

    <div className="commissionerGrid" style={{marginBottom:18}}>
      <section className="panel"><div className="panelTitle"><h3>BEST SEASON</h3><span>BY WIN %</span></div>
        {allTime.bestSeason?<><h2 style={{margin:"0 0 5px"}}>{allTime.bestSeason.season}</h2><p style={{margin:0,color:"#aab2bb"}}>{allTime.bestSeason.wins}-{allTime.bestSeason.losses}{allTime.bestSeason.ties?`-${allTime.bestSeason.ties}`:""} · {pct(allTime.bestSeason.winPct)} · {allTime.bestSeason.pf.toFixed(1)} PF</p></>:<p>No season history available.</p>}
      </section>
      <section className="panel"><div className="panelTitle"><h3>RECENT RESULTS</h3><span>LATEST 5</span></div>
        {allTime.games.slice(0,5).length?<div style={{display:"grid",gap:10}}>{allTime.games.slice(0,5).map(g=><div key={`${g.season}-${g.week}-${g.opponent}`} style={{display:"grid",gridTemplateColumns:"34px minmax(0,1fr) auto",gap:10,alignItems:"center",borderBottom:"1px solid #2a3138",paddingBottom:9}}><b>{g.result}</b><span>{g.season} Wk {g.week} · {g.opponent}</span><strong>{g.myScore.toFixed(1)}-{g.oppScore.toFixed(1)}</strong></div>)}</div>:<p>No completed archived games.</p>}
      </section>
    </div>

    <section className="panel" style={{marginBottom:18}}><div className="panelTitle"><h3>ALL-TIME HEAD-TO-HEAD</h3><span>BY MANAGER</span></div>
      {allTime.opponents.length?<div style={{display:"grid",gap:0}}>{allTime.opponents.map(o=><div key={normalize(o.opponent)} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:12,borderBottom:"1px solid #2a3138",padding:"12px 0"}}><div><strong style={{display:"block"}}>{o.opponent}</strong><small style={{color:"#8e98a3"}}>{o.meetings} meeting{o.meetings===1?"":"s"} · {o.pf.toFixed(1)} PF</small></div><div style={{textAlign:"right"}}><strong>{o.w}-{o.l}{o.t?`-${o.t}`:""}</strong><small style={{display:"block",color:"#8e98a3"}}>series</small></div></div>)}</div>:<p>Head-to-head history will appear as mapped ESPN archive games are available.</p>}
    </section>

    <section className="panel"><div className="panelTitle"><h3>SEASON-BY-SEASON</h3><span>ARCHIVE</span></div>
      {allTime.seasons.length?<div style={{display:"grid",gap:0}}>{allTime.seasons.map(s=><div key={s.season} style={{display:"grid",gridTemplateColumns:"58px minmax(0,1fr) auto",gap:12,borderBottom:"1px solid #2a3138",padding:"12px 0",alignItems:"center"}}><strong>{s.season}</strong><span>{s.wins}-{s.losses}{s.ties?`-${s.ties}`:""}</span><span style={{textAlign:"right",color:"#8e98a3"}}>{s.pf.toFixed(1)} PF</span></div>)}</div>:<p>No mapped season history available yet.</p>}
    </section>
  </PageShell>;
}
