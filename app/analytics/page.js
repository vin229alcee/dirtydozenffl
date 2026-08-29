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

function espnHeaders() {
  const headers = { accept: "application/json, text/plain, */*", "user-agent": "DirtyDozensFFL/1.0" };
  if (process.env.ESPN_S2 && process.env.ESPN_SWID) headers.cookie = `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.ESPN_SWID}`;
  return headers;
}

async function fetchSeason(season) {
  const url = new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${ESPN_LEAGUE_ID}`);
  for (const view of ["mTeam", "mStandings", "mMatchupScore", "mStatus"]) url.searchParams.append("view", view);
  const response = await fetch(url, { headers: espnHeaders(), cache: "no-store" });
  if (!response.ok) throw new Error(`ESPN ${season}: ${response.status}`);
  return response.json();
}

async function getArchive() {
  const seasons = Array.from({ length: CURRENT_SEASON - START_SEASON + 1 }, (_, i) => START_SEASON + i);
  const results = await Promise.all(seasons.map(async season => {
    try { return { season, data: await fetchSeason(season) }; }
    catch { return null; }
  }));
  return results.filter(Boolean);
}

function ownerName(team, members) {
  const owner = members.get(team?.owners?.[0]);
  return owner?.displayName || [owner?.firstName, owner?.lastName].filter(Boolean).join(" ") || teamName(team);
}

function buildAnalytics(archive) {
  const owners = new Map();
  const games = [];
  const titleYears = new Map();

  function ensureOwner(name) {
    const key = normalize(name);
    if (!owners.has(key)) owners.set(key, {
      key,
      manager: name,
      currentTeam: "",
      latestSeason: 0,
      seasons: new Set(),
      wins: 0,
      losses: 0,
      ties: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      titles: new Set(),
      weeklyScores: [],
    });
    return owners.get(key);
  }

  for (const { season, data } of archive) {
    const members = new Map((data?.members || []).map(member => [member.id, member]));
    const teamsById = new Map();

    for (const team of data?.teams || []) {
      const manager = ownerName(team, members);
      const owner = ensureOwner(manager);
      owner.seasons.add(season);
      if (season >= owner.latestSeason) {
        owner.latestSeason = season;
        owner.currentTeam = teamName(team);
      }
      if (Number(team.rankCalculatedFinal) === 1) {
        owner.titles.add(season);
        if (!titleYears.has(season)) titleYears.set(season, owner.key);
      }
      teamsById.set(Number(team.id), { team, ownerKey: owner.key, manager, name: teamName(team) });
    }

    for (const game of data?.schedule || []) {
      if (!game?.home || !game?.away || !game.winner || game.winner === "UNDECIDED") continue;
      const home = teamsById.get(Number(game.home.teamId));
      const away = teamsById.get(Number(game.away.teamId));
      if (!home || !away || home.ownerKey === away.ownerKey) continue;
      const homeScore = Number(game.home.totalPoints);
      const awayScore = Number(game.away.totalPoints);
      if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) continue;

      const homeOwner = ensureOwner(home.manager);
      const awayOwner = ensureOwner(away.manager);
      homeOwner.pointsFor += homeScore;
      homeOwner.pointsAgainst += awayScore;
      awayOwner.pointsFor += awayScore;
      awayOwner.pointsAgainst += homeScore;
      homeOwner.weeklyScores.push(homeScore);
      awayOwner.weeklyScores.push(awayScore);

      if (homeScore > awayScore) { homeOwner.wins++; awayOwner.losses++; }
      else if (awayScore > homeScore) { awayOwner.wins++; homeOwner.losses++; }
      else { homeOwner.ties++; awayOwner.ties++; }

      games.push({
        season,
        week: Number(game.matchupPeriodId || 0),
        homeKey: home.ownerKey,
        awayKey: away.ownerKey,
        homeManager: home.manager,
        awayManager: away.manager,
        homeTeam: home.name,
        awayTeam: away.name,
        homeScore,
        awayScore,
        margin: Math.abs(homeScore - awayScore),
      });
    }
  }

  for (const known of KNOWN_CHAMPIONS) {
    const key = normalize(known.manager);
    const owner = owners.get(key) || ensureOwner(known.manager);
    owner.titles.add(known.season);
  }

  const leaderboard = [...owners.values()].map(owner => {
    const decisions = owner.wins + owner.losses + owner.ties;
    const winPct = decisions ? (owner.wins + owner.ties * 0.5) / decisions : 0;
    const seasons = owner.seasons.size;
    return {
      ...owner,
      games: decisions,
      winPct,
      seasons,
      titleCount: owner.titles.size,
      titleRate: seasons ? owner.titles.size / seasons : 0,
      avgScore: owner.weeklyScores.length ? owner.pointsFor / owner.weeklyScores.length : 0,
    };
  }).filter(owner => owner.games > 0 || owner.titleCount > 0)
    .sort((a, b) => b.winPct - a.winPct || b.wins - a.wins || b.pointsFor - a.pointsFor);

  const pairMap = new Map();
  for (const game of games) {
    const keys = [game.homeKey, game.awayKey].sort();
    const pairKey = keys.join("::");
    if (!pairMap.has(pairKey)) pairMap.set(pairKey, {
      key: pairKey,
      aKey: keys[0],
      bKey: keys[1],
      meetings: 0,
      aWins: 0,
      bWins: 0,
      ties: 0,
      totalMargin: 0,
      totalPoints: 0,
      latestSeason: 0,
    });
    const pair = pairMap.get(pairKey);
    pair.meetings++;
    pair.totalMargin += game.margin;
    pair.totalPoints += game.homeScore + game.awayScore;
    pair.latestSeason = Math.max(pair.latestSeason, game.season);
    if (game.homeScore === game.awayScore) pair.ties++;
    else {
      const winner = game.homeScore > game.awayScore ? game.homeKey : game.awayKey;
      if (winner === pair.aKey) pair.aWins++; else pair.bWins++;
    }
  }

  const rivalries = [...pairMap.values()].map(pair => ({
    ...pair,
    a: owners.get(pair.aKey),
    b: owners.get(pair.bKey),
    avgMargin: pair.meetings ? pair.totalMargin / pair.meetings : 0,
    avgCombined: pair.meetings ? pair.totalPoints / pair.meetings : 0,
  })).filter(pair => pair.a && pair.b)
    .sort((a, b) => b.meetings - a.meetings || a.avgMargin - b.avgMargin || b.latestSeason - a.latestSeason);

  const closestRivalries = [...rivalries].filter(pair => pair.meetings >= 2)
    .sort((a, b) => a.avgMargin - b.avgMargin || b.meetings - a.meetings);

  const highestScoring = [...leaderboard].filter(owner => owner.games > 0)
    .sort((a, b) => b.avgScore - a.avgScore || b.pointsFor - a.pointsFor);

  const championshipRate = [...leaderboard].filter(owner => owner.seasons > 0)
    .sort((a, b) => b.titleRate - a.titleRate || b.titleCount - a.titleCount || b.winPct - a.winPct);

  return { leaderboard, rivalries, closestRivalries, highestScoring, championshipRate, seasonsLoaded: archive.map(item => item.season) };
}

function pct(value) { return `${(value * 100).toFixed(1)}%`; }

export default async function Analytics() {
  const archive = await getArchive();
  const data = buildAnalytics(archive);
  const seasonLabel = data.seasonsLoaded.length ? `${Math.min(...data.seasonsLoaded)}–${Math.max(...data.seasonsLoaded)}` : "ESPN ARCHIVE";

  return <PageShell title="LEAGUE ANALYTICS" kicker="RIVALRIES & FRANCHISE POWER">
    <div className="weekSummary"><div><span>ARCHIVE</span><strong>{data.seasonsLoaded.length}</strong></div><b>{seasonLabel} · ESPN COMPLETED GAMES</b></div>

    <section className="panel" style={{marginBottom:22}}>
      <div className="panelTitle"><h3>ALL-TIME FRANCHISE LEADERBOARD</h3><span>OWNER-BASED</span></div>
      {data.leaderboard.length ? <div style={{display:"grid",gap:8}}>{data.leaderboard.map((owner,index)=><div key={owner.key} style={{display:"grid",gridTemplateColumns:"42px minmax(150px,1.7fr) repeat(5,minmax(70px,.7fr))",gap:10,alignItems:"center",borderBottom:"1px solid #2a3138",padding:"11px 0",overflowX:"auto"}}>
        <b>#{index+1}</b><div><strong style={{display:"block"}}>{owner.manager}</strong><small style={{color:"#8e98a3"}}>{owner.currentTeam || "Franchise"}</small></div><span><small>W-L</small><br/><b>{owner.wins}-{owner.losses}{owner.ties?`-${owner.ties}`:""}</b></span><span><small>WIN %</small><br/><b>{pct(owner.winPct)}</b></span><span><small>AVG</small><br/><b>{owner.avgScore.toFixed(1)}</b></span><span><small>TITLES</small><br/><b>{owner.titleCount}</b></span><span><small>SEASONS</small><br/><b>{owner.seasons}</b></span>
      </div>)}</div> : <p>No completed ESPN archive games are available yet.</p>}
    </section>

    <div className="commissionerGrid" style={{marginBottom:22}}>
      <section className="panel"><div className="panelTitle"><h3>BIGGEST RIVALRIES</h3><span>MOST MEETINGS</span></div>
        {data.rivalries.slice(0,6).map((pair,index)=><div key={pair.key} style={{borderBottom:"1px solid #2a3138",padding:"12px 0"}}><small>#{index+1} · {pair.meetings} MEETINGS</small><h3 style={{margin:"5px 0"}}>{pair.a.manager} vs {pair.b.manager}</h3><p style={{margin:0,color:"#8e98a3"}}>{pair.aWins}-{pair.bWins}{pair.ties?`-${pair.ties}`:""} series · {pair.avgMargin.toFixed(1)} avg margin</p></div>)}
      </section>
      <section className="panel"><div className="panelTitle"><h3>TIGHTEST RIVALRIES</h3><span>LOWEST AVG MARGIN</span></div>
        {data.closestRivalries.slice(0,6).map((pair,index)=><div key={pair.key} style={{borderBottom:"1px solid #2a3138",padding:"12px 0"}}><small>#{index+1} · {pair.meetings} MEETINGS</small><h3 style={{margin:"5px 0"}}>{pair.a.manager} vs {pair.b.manager}</h3><p style={{margin:0,color:"#8e98a3"}}>{pair.avgMargin.toFixed(1)} pts avg margin · {pair.aWins}-{pair.bWins}{pair.ties?`-${pair.ties}`:""}</p></div>)}
      </section>
    </div>

    <div className="commissionerGrid">
      <section className="panel"><div className="panelTitle"><h3>SCORING KINGS</h3><span>AVG POINTS / GAME</span></div>
        {data.highestScoring.slice(0,6).map((owner,index)=><div key={owner.key} style={{display:"grid",gridTemplateColumns:"34px 1fr auto",gap:10,borderBottom:"1px solid #2a3138",padding:"11px 0"}}><b>#{index+1}</b><span>{owner.manager}<br/><small style={{color:"#8e98a3"}}>{owner.currentTeam}</small></span><strong>{owner.avgScore.toFixed(1)}</strong></div>)}
      </section>
      <section className="panel"><div className="panelTitle"><h3>CHAMPIONSHIP RATE</h3><span>TITLES / SEASONS</span></div>
        {data.championshipRate.slice(0,6).map((owner,index)=><div key={owner.key} style={{display:"grid",gridTemplateColumns:"34px 1fr auto",gap:10,borderBottom:"1px solid #2a3138",padding:"11px 0"}}><b>#{index+1}</b><span>{owner.manager}<br/><small style={{color:"#8e98a3"}}>{owner.titleCount} title{owner.titleCount===1?"":"s"} in {owner.seasons} season{owner.seasons===1?"":"s"}</small></span><strong>{pct(owner.titleRate)}</strong></div>)}
      </section>
    </div>

    <section className="panel" style={{marginTop:22}}><p style={{margin:0}}>Analytics use completed ESPN matchups from every accessible season between 2022 and 2026. Franchise results are grouped by owner so team-name changes do not split a manager's history. Known 2022–2024 champions are preserved in the title calculations when ESPN does not expose those seasons.</p><div style={{marginTop:14}}><Link href="/teams" className="secondaryButton" style={{textDecoration:"none"}}>Explore Franchise Profiles →</Link></div></section>
  </PageShell>;
}
