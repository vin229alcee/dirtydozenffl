import { createClient } from "@supabase/supabase-js";
import PageShell from "../../components/PageShell";

export const dynamic = "force-dynamic";

const ESPN_LEAGUE_ID = "2145514194";
const CURRENT_SEASON = 2026;
const START_SEASON = 2022;
const MAP_RECORD = "__OWNER_MAP__";
const ESPN_VIEWS = ["mTeam", "mStandings", "mMatchupScore", "mStatus"];

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

function normalizeEspnPayload(payload) {
  return Array.isArray(payload) ? (payload[0] || null) : payload;
}

function hasHistoricalData(data) {
  return Boolean(data && Array.isArray(data.teams) && data.teams.length && Array.isArray(data.schedule) && data.schedule.length);
}

async function fetchEspnUrl(url) {
  for (const view of ESPN_VIEWS) url.searchParams.append("view", view);
  const response = await fetch(url, { headers: espnHeaders(), cache: "no-store" });
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

async function getEspnArchive() {
  const seasonIds = Array.from({ length: CURRENT_SEASON - START_SEASON + 1 }, (_, index) => START_SEASON + index);
  const results = await Promise.all(seasonIds.map(async (season) => {
    try {
      const data = await fetchSeason(season);
      return { season, data, teams: data?.teams?.length || 0, games: data?.schedule?.length || 0 };
    } catch {
      return { season, data: null, teams: 0, games: 0 };
    }
  }));
  return results;
}

function historicalGameIsFinal(game, season) {
  if (!game?.home || !game?.away) return false;
  const homeScore = Number(game.home.totalPoints);
  const awayScore = Number(game.away.totalPoints);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return false;
  if (season < CURRENT_SEASON) return homeScore > 0 || awayScore > 0;
  return Boolean(game.winner && game.winner !== "UNDECIDED");
}

function inferredWinner(homeScore, awayScore) {
  if (homeScore > awayScore) return "HOME";
  if (awayScore > homeScore) return "AWAY";
  return "TIE";
}

function buildAutomaticRecords(archive) {
  const games = [];
  const seasonTotals = [];

  for (const { season, data } of archive) {
    if (!data) continue;
    const teams = new Map((data?.teams || []).map((team) => {
      const label = teamName(team);
      const overall = team?.record?.overall || {};
      seasonTotals.push({ season, teamId: Number(team.id), name: label, points: Number(overall.pointsFor || 0) });
      return [Number(team.id), team];
    }));

    for (const game of data?.schedule || []) {
      if (!historicalGameIsFinal(game, season)) continue;
      const homeScore = Number(game.home.totalPoints);
      const awayScore = Number(game.away.totalPoints);
      const winner = inferredWinner(homeScore, awayScore);
      games.push({
        season,
        week: Number(game.matchupPeriodId || 0),
        homeId: Number(game.home.teamId),
        awayId: Number(game.away.teamId),
        homeName: teamName(teams.get(Number(game.home.teamId))),
        awayName: teamName(teams.get(Number(game.away.teamId))),
        homeScore,
        awayScore,
        winner,
        margin: Math.abs(homeScore - awayScore),
      });
    }
  }

  const scores = games.flatMap((game) => [
    { season: game.season, week: game.week, team: game.homeName, score: game.homeScore },
    { season: game.season, week: game.week, team: game.awayName, score: game.awayScore },
  ]).filter((row) => row.score > 0);
  const high = scores.length ? [...scores].sort((a, b) => b.score - a.score)[0] : null;
  const low = scores.length ? [...scores].sort((a, b) => a.score - b.score)[0] : null;
  const blowout = games.length ? [...games].sort((a, b) => b.margin - a.margin)[0] : null;
  const closest = games.length ? [...games].sort((a, b) => a.margin - b.margin)[0] : null;
  const seasonHigh = seasonTotals.length ? [...seasonTotals].sort((a, b) => b.points - a.points)[0] : null;

  let bestStreak = null;
  const bySeasonTeam = new Map();
  for (const game of [...games].sort((a, b) => a.season - b.season || a.week - b.week)) {
    for (const side of ["home", "away"]) {
      const id = side === "home" ? game.homeId : game.awayId;
      const name = side === "home" ? game.homeName : game.awayName;
      const won = (side === "home" && game.winner === "HOME") || (side === "away" && game.winner === "AWAY");
      const key = `${game.season}:${id}`;
      const current = bySeasonTeam.get(key) || { count: 0, startWeek: null };
      if (won) {
        const next = { count: current.count + 1, startWeek: current.count ? current.startWeek : game.week };
        bySeasonTeam.set(key, next);
        if (!bestStreak || next.count > bestStreak.count) bestStreak = { count: next.count, season: game.season, startWeek: next.startWeek, endWeek: game.week, team: name };
      } else {
        bySeasonTeam.set(key, { count: 0, startWeek: null });
      }
    }
  }

  return [
    high && { name: "Highest Weekly Score", value: high.score.toFixed(1), detail: high.team, season: high.season, week: high.week },
    low && { name: "Lowest Weekly Score", value: low.score.toFixed(1), detail: low.team, season: low.season, week: low.week },
    blowout && { name: "Biggest Blowout", value: `${blowout.margin.toFixed(1)} pts`, detail: blowout.winner === "HOME" ? blowout.homeName : blowout.winner === "AWAY" ? blowout.awayName : `${blowout.homeName} vs ${blowout.awayName}`, season: blowout.season, week: blowout.week },
    closest && { name: "Closest Game", value: `${closest.margin.toFixed(1)} pts`, detail: `${closest.homeName} vs ${closest.awayName}`, season: closest.season, week: closest.week },
    seasonHigh && { name: "Highest Season Points", value: seasonHigh.points.toFixed(1), detail: seasonHigh.name, season: seasonHigh.season, week: null },
    bestStreak && { name: "Longest Winning Streak", value: `${bestStreak.count} wins`, detail: bestStreak.team, season: bestStreak.season, week: bestStreak.endWeek },
  ].filter(Boolean);
}

async function getCommissionerRecords() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { teams: [], records: [] };
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [{ data: teams }, { data: records }] = await Promise.all([
    supabase.from("teams").select("*"),
    supabase.from("league_records").select("*").order("id"),
  ]);
  const visible = (records || []).filter((record) => {
    const name = String(record.record_name || "");
    return name !== MAP_RECORD && !name.startsWith("__RULE_SCORE__:") && !name.startsWith("__HOUSE_RULE__:");
  });
  return { teams: teams || [], records: visible };
}

export default async function Records() {
  const [archive, local] = await Promise.all([getEspnArchive(), getCommissionerRecords()]);
  const auto = buildAutomaticRecords(archive);
  const byId = Object.fromEntries(local.teams.map((team) => [team.id, team]));
  const loaded = archive.filter((row) => row.data && row.games > 0);
  const archiveLabel = loaded.length ? `${Math.min(...loaded.map((row) => row.season))}–${Math.max(...loaded.map((row) => row.season))}` : `${START_SEASON}–${CURRENT_SEASON}`;
  const archiveStatus = archive.map((row) => `${row.season}: ${row.games ? `${row.games} games` : "missing"}`).join(" · ");

  return <PageShell title="RECORD BOOK" kicker="IMMORTALIZED">
    <section className="panel" style={{marginBottom:18}}><div className="panelTitle"><h3>ARCHIVE STATUS</h3><span>{archiveLabel}</span></div><p style={{margin:0,color:"#9aa4ae",lineHeight:1.6}}>{archiveStatus}</p></section>
    <div className="panelTitle"><h3>AUTOMATIC RECORDS</h3><span>ESPN ALL-TIME ARCHIVE · {archiveLabel}</span></div>
    {auto.length ? <div className="recordCards">{auto.map((record, index) => <article className="panel recordCard" key={record.name}><span>{String(index + 1).padStart(2, "0")}</span><h3>{record.name}</h3><strong>{record.value}</strong><p>{record.detail}{record.season ? ` · ${record.season}` : ""}{record.week ? ` Week ${record.week}` : ""}</p></article>)}</div> : <section className="panel emptyPanel">ESPN record data will appear once completed league games are available.</section>}
    <div className="panelTitle" style={{marginTop:28}}><h3>COMMISSIONER RECORDS</h3><span>HISTORICAL OVERRIDES & SPECIAL RECORDS</span></div>
    {local.records.length ? <div className="recordCards">{local.records.map((record, index) => <article className="panel recordCard" key={record.id}><span>{String(index + 1).padStart(2, "0")}</span><h3>{record.record_name}</h3><strong>{record.record_value || "—"}</strong><p>{byId[record.team_id]?.name || "League Record"}{record.season ? ` · ${record.season}` : ""}{record.week ? ` Week ${record.week}` : ""}</p></article>)}</div> : <section className="panel emptyPanel">Special or legacy records can still be added from the Commissioner dashboard.</section>}
  </PageShell>;
}
