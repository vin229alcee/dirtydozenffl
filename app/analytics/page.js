import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import PageShell from "../../components/PageShell";

export const dynamic = "force-dynamic";

const ESPN_LEAGUE_ID = "2145514194";
const CURRENT_SEASON = 2026;
const START_SEASON = 2022;
const MAP_RECORD = "__OWNER_MAP__";
const DROUGHT_YEARS = [CURRENT_SEASON - 2, CURRENT_SEASON - 1];
const ESPN_VIEWS = ["mTeam", "mStandings", "mMatchupScore", "mStatus", "mSettings"];
const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
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

function headers() {
  const value = { accept: "application/json, text/plain, */*", "user-agent": "DirtyDozensFFL/1.0" };
  if (process.env.ESPN_S2 && process.env.ESPN_SWID) value.cookie = `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.ESPN_SWID}`;
  return value;
}

function normalizeEspnPayload(payload) {
  return Array.isArray(payload) ? (payload[0] || null) : payload;
}

function hasHistoricalData(data) {
  return Boolean(data && Array.isArray(data.teams) && data.teams.length && Array.isArray(data.schedule) && data.schedule.length);
}

async function fetchEspnUrl(url) {
  for (const view of ESPN_VIEWS) url.searchParams.append("view", view);
  const response = await fetch(url, { headers: headers(), cache: "no-store" });
  if (!response.ok) throw new Error(`ESPN: ${response.status}`);
  return normalizeEspnPayload(await response.json());
}

async function fetchSeason(season) {
  const standard = new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${ESPN_LEAGUE_ID}`);
  let standardData = null;
  try {
    standardData = await fetchEspnUrl(standard);
    if (season === CURRENT_SEASON || hasHistoricalData(standardData)) return standardData;
  } catch (error) {
    if (season === CURRENT_SEASON) throw error;
  }

  if (season < CURRENT_SEASON) {
    const history = new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory/${ESPN_LEAGUE_ID}`);
    history.searchParams.set("seasonId", String(season));
    try {
      const historyData = await fetchEspnUrl(history);
      if (hasHistoricalData(historyData)) return historyData;
    } catch {}
  }

  if (standardData) return standardData;
  throw new Error(`ESPN ${season}: archive unavailable`);
}

async function getArchive() {
  const seasons = Array.from({ length: CURRENT_SEASON - START_SEASON + 1 }, (_, index) => START_SEASON + index);
  return Promise.all(seasons.map(async (season) => {
    try {
      const data = await fetchSeason(season);
      return { season, data, games: data?.schedule?.length || 0, teams: data?.teams?.length || 0 };
    } catch {
      return { season, data: null, games: 0, teams: 0 };
    }
  }));
}

function rawOwner(team, members) {
  const member = members.get(team?.owners?.[0]);
  return member?.displayName || [member?.firstName, member?.lastName].filter(Boolean).join(" ") || "";
}

function isReadableOwner(name) {
  const compact = normalize(name);
  if (!compact) return false;
  if (/^espnfan\d+$/i.test(compact)) return false;
  if (/^[a-z]+\d{2,}$/i.test(compact)) return false;
  return true;
}

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function madePlayoffs(team, playoffTeamCount) {
  const seed = Number(team?.playoffSeed);
  const finalRank = Number(team?.rankCalculatedFinal);
  if (Number.isFinite(seed) && seed > 0 && seed <= playoffTeamCount) return true;
  return Number.isFinite(finalRank) && finalRank > 0 && finalRank <= playoffTeamCount;
}

function historicalGameIsFinal(game, season) {
  if (!game?.home || !game?.away) return false;
  const homeScore = Number(game.home.totalPoints);
  const awayScore = Number(game.away.totalPoints);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return false;
  if (season < CURRENT_SEASON) return homeScore > 0 || awayScore > 0;
  return Boolean(game.winner && game.winner !== "UNDECIDED");
}

async function getOwnerMappings() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return new Map();
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [{ data: teams }, { data: rows }] = await Promise.all([
    supabase.from("teams").select("id,name,manager"),
    supabase.from("league_records").select("id,record_name,record_value,team_id").eq("record_name", MAP_RECORD),
  ]);
  const byId = Object.fromEntries((teams || []).map((team) => [team.id, team]));
  return new Map((rows || []).map((row) => {
    const team = byId[row.team_id];
    return [normalize(row.record_value), team ? { manager: team.manager || team.name, currentTeam: team.name || "" } : null];
  }).filter(([, value]) => value));
}

function buildAnalytics(archive, mappings) {
  const owners = new Map();
  const games = [];

  function ensure(name) {
    const key = normalize(name);
    if (!owners.has(key)) owners.set(key, {
      key,
      manager: name,
      currentTeam: "",
      latestSeason: 0,
      seasons: new Set(),
      playoffSeasons: new Set(),
      wins: 0,
      losses: 0,
      ties: 0,
      pf: 0,
      pa: 0,
      titles: new Set(),
      scores: [],
    });
    return owners.get(key);
  }

  for (const { season, data } of archive) {
    if (!data) continue;
    const members = new Map((data?.members || []).map((member) => [member.id, member]));
    const byId = new Map();
    const playoffTeamCount = Number(data?.settings?.scheduleSettings?.playoffTeamCount) || 6;

    for (const team of data?.teams || []) {
      const raw = rawOwner(team, members);
      const mapped = mappings.get(normalize(raw));
      const manager = mapped?.manager || (isReadableOwner(raw) ? raw : "");
      if (!manager) continue;
      const owner = ensure(manager);
      owner.seasons.add(season);
      if (season >= owner.latestSeason) {
        owner.latestSeason = season;
        owner.currentTeam = mapped?.currentTeam || teamName(team);
      }
      if (Number(team.rankCalculatedFinal) === 1) owner.titles.add(season);
      if (season < CURRENT_SEASON && madePlayoffs(team, playoffTeamCount)) owner.playoffSeasons.add(season);
      byId.set(Number(team.id), { key: owner.key, manager, name: teamName(team) });
    }

    for (const game of data?.schedule || []) {
      if (!historicalGameIsFinal(game, season)) continue;
      const home = byId.get(Number(game.home.teamId));
      const away = byId.get(Number(game.away.teamId));
      if (!home || !away || home.key === away.key) continue;
      const homeScore = Number(game.home.totalPoints);
      const awayScore = Number(game.away.totalPoints);
      if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) continue;
      const homeOwner = owners.get(home.key);
      const awayOwner = owners.get(away.key);
      homeOwner.pf += homeScore;
      homeOwner.pa += awayScore;
      awayOwner.pf += awayScore;
      awayOwner.pa += homeScore;
      homeOwner.scores.push(homeScore);
      awayOwner.scores.push(awayScore);
      if (homeScore > awayScore) {
        homeOwner.wins += 1;
        awayOwner.losses += 1;
      } else if (awayScore > homeScore) {
        awayOwner.wins += 1;
        homeOwner.losses += 1;
      } else {
        homeOwner.ties += 1;
        awayOwner.ties += 1;
      }
      games.push({ h: home.key, a: away.key, hs: homeScore, as: awayScore, margin: Math.abs(homeScore - awayScore) });
    }
  }

  for (const champion of KNOWN_CHAMPIONS) ensure(champion.manager).titles.add(champion.season);

  const leaderboard = [...owners.values()].map((owner) => {
    const gp = owner.wins + owner.losses + owner.ties;
    const seasons = owner.seasons.size;
    return {
      ...owner,
      gp,
      seasons,
      winPct: gp ? (owner.wins + owner.ties * 0.5) / gp : 0,
      titleCount: owner.titles.size,
      titleRate: seasons ? owner.titles.size / seasons : 0,
      avg: owner.scores.length ? owner.pf / owner.scores.length : 0,
    };
  }).filter((owner) => owner.gp > 0).sort((a, b) => b.winPct - a.winPct || b.wins - a.wins || b.pf - a.pf);

  const pairs = new Map();
  for (const game of games) {
    const keys = [game.h, game.a].sort();
    const key = keys.join("::");
    if (!pairs.has(key)) pairs.set(key, { key, aKey: keys[0], bKey: keys[1], meetings: 0, aWins: 0, bWins: 0, ties: 0, margin: 0 });
    const pair = pairs.get(key);
    pair.meetings += 1;
    pair.margin += game.margin;
    if (game.hs === game.as) pair.ties += 1;
    else {
      const winner = game.hs > game.as ? game.h : game.a;
      if (winner === pair.aKey) pair.aWins += 1;
      else pair.bWins += 1;
    }
  }

  const rivalries = [...pairs.values()].map((pair) => ({
    ...pair,
    a: owners.get(pair.aKey),
    b: owners.get(pair.bKey),
    avgMargin: pair.margin / pair.meetings,
  })).filter((pair) => pair.a && pair.b).sort((a, b) => b.meetings - a.meetings || a.avgMargin - b.avgMargin);

  const availableSeasons = new Set(archive.filter((row) => row.data && row.games > 0).map((row) => row.season));
  const droughtYears = DROUGHT_YEARS.filter((year) => availableSeasons.has(year));
  const latestSeason = archive.filter((row) => row.data).length ? Math.max(...archive.filter((row) => row.data).map((row) => row.season)) : CURRENT_SEASON;
  const drought = droughtYears.length === 2 ? [...owners.values()].filter((owner) => owner.latestSeason === latestSeason && droughtYears.every((year) => owner.seasons.has(year)) && droughtYears.every((year) => !owner.playoffSeasons.has(year))).sort((a, b) => (a.currentTeam || a.manager).localeCompare(b.currentTeam || b.manager)) : [];

  return {
    leaderboard,
    rivalries,
    scoring: [...leaderboard].sort((a, b) => b.avg - a.avg),
    champions: [...leaderboard].filter((owner) => owner.seasons > 0).sort((a, b) => b.titleRate - a.titleRate || b.titleCount - a.titleCount),
    drought,
    droughtYears,
  };
}

const rowStyle = { display: "grid", gridTemplateColumns: "44px minmax(0,1fr) auto", gap: 10, alignItems: "center", borderBottom: "1px solid #2a3138", padding: "14px 0" };

export default async function Analytics() {
  const [archive, mappings] = await Promise.all([getArchive(), getOwnerMappings()]);
  const data = buildAnalytics(archive, mappings);
  const loaded = archive.filter((row) => row.data && row.games > 0);
  const label = loaded.length ? `${Math.min(...loaded.map((row) => row.season))}–${Math.max(...loaded.map((row) => row.season))}` : "ESPN ARCHIVE";
  const droughtLabel = data.droughtYears.length === 2 ? data.droughtYears.join(" & ") : "LAST 2 SEASONS";
  const archiveStatus = archive.map((row) => `${row.season}: ${row.games ? `${row.games} games` : "missing"}`).join(" · ");

  return <PageShell title="LEAGUE ANALYTICS" kicker="ALL-TIME LEAGUE STATS">
    <section className="panel" style={{ marginBottom: 18 }}>
      <div className="panelTitle"><h3>ARCHIVE STATUS</h3><span>{label}</span></div>
      <p style={{ margin: 0, color: "#aab2bb", lineHeight: 1.6 }}>{archiveStatus}</p>
    </section>

    <section className="panel" style={{ marginBottom: 18 }}>
      <div className="panelTitle"><h3>HOW TO READ THIS PAGE</h3><span>{label}</span></div>
      <p style={{ margin: 0, color: "#aab2bb", lineHeight: 1.6 }}>Stats use completed ESPN games from every available Dirty Dozens season and are grouped by manager. Commissioner owner mappings merge old ESPN usernames into the correct manager&apos;s history.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}><Link href="/commissioner/owner-mapping" className="secondaryButton" style={{ textDecoration: "none" }}>Map ESPN Owners</Link><Link href="/teams" className="secondaryButton" style={{ textDecoration: "none" }}>Team Profiles</Link></div>
    </section>

    <section className="panel" style={{ marginBottom: 18 }}><div className="panelTitle"><h3>ALL-TIME LEADERBOARD</h3><span>BEST WIN %</span></div>
      {data.leaderboard.length ? data.leaderboard.map((owner, index) => <div key={owner.key} style={rowStyle}><b style={{ fontSize: 20 }}>#{index + 1}</b><div><strong style={{ display: "block", fontSize: 17 }}>{owner.manager}</strong><small style={{ color: "#8e98a3" }}>{owner.currentTeam || "Franchise"} · {owner.gp} games</small></div><div style={{ textAlign: "right" }}><strong>{owner.wins}-{owner.losses}{owner.ties ? `-${owner.ties}` : ""}</strong><small style={{ display: "block", color: "#8e98a3" }}>{pct(owner.winPct)} win</small></div></div>) : <p>Historical ESPN owner data is not available yet.</p>}
    </section>

    <section className="panel" style={{ marginBottom: 18 }}><div className="panelTitle"><h3>PLAYOFF DROUGHT TRACKER</h3><span>{droughtLabel}</span></div><p style={{ color: "#8e98a3", marginTop: 0 }}>Current franchises that missed the playoffs in each of the last two completed seasons.</p>{data.droughtYears.length < 2 ? <p>Both completed-season ESPN archives are required to calculate the drought tracker.</p> : data.drought.length ? data.drought.map((owner, index) => <div key={owner.key} style={rowStyle}><b style={{ fontSize: 20 }}>#{index + 1}</b><div><strong style={{ display: "block", fontSize: 17 }}>{owner.currentTeam || "Franchise"}</strong><small style={{ color: "#8e98a3" }}>{owner.manager} · Missed {data.droughtYears.join(" & ")}</small></div><div style={{ textAlign: "right" }}><strong>2 YEARS</strong><small style={{ display: "block", color: "#8e98a3" }}>no playoffs</small></div></div>) : <p style={{ marginBottom: 0 }}>No current franchise has an active two-year playoff drought.</p>}</section>

    <section className="panel" style={{ marginBottom: 18 }}><div className="panelTitle"><h3>BIGGEST RIVALRIES</h3><span>MOST MEETINGS</span></div><p style={{ color: "#8e98a3", marginTop: 0 }}>Owners who have faced each other the most in the available archive.</p>{data.rivalries.slice(0, 5).map((pair, index) => <div key={pair.key} style={{ borderBottom: "1px solid #2a3138", padding: "14px 0" }}><small>#{index + 1} · {pair.meetings} GAMES</small><strong style={{ display: "block", fontSize: 18, margin: "5px 0" }}>{pair.a.manager} vs {pair.b.manager}</strong><span style={{ color: "#8e98a3" }}>Series {pair.aWins}-{pair.bWins}{pair.ties ? `-${pair.ties}` : ""} · Avg margin {pair.avgMargin.toFixed(1)} pts</span></div>)}</section>

    <div className="commissionerGrid">
      <section className="panel"><div className="panelTitle"><h3>SCORING LEADERS</h3><span>AVG / GAME</span></div>{data.scoring.slice(0, 5).map((owner, index) => <div key={owner.key} style={rowStyle}><b>#{index + 1}</b><span><strong>{owner.manager}</strong><small style={{ display: "block", color: "#8e98a3" }}>{owner.gp} games</small></span><strong>{owner.avg.toFixed(1)}</strong></div>)}</section>
      <section className="panel"><div className="panelTitle"><h3>CHAMPIONS</h3><span>TITLE RATE</span></div>{data.champions.slice(0, 5).map((owner, index) => <div key={owner.key} style={rowStyle}><b>#{index + 1}</b><span><strong>{owner.manager}</strong><small style={{ display: "block", color: "#8e98a3" }}>{owner.titleCount} title{owner.titleCount === 1 ? "" : "s"} · {owner.seasons} ESPN seasons</small></span><strong>{pct(owner.titleRate)}</strong></div>)}</section>
    </div>
  </PageShell>;
}
