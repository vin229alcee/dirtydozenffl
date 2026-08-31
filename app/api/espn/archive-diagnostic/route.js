import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const LEAGUE_ID = "2145514194";
const SEASONS = [2022, 2023, 2024, 2025, 2026];
const VIEWS = ["mTeam", "mStandings", "mMatchupScore", "mStatus", "mSettings"];

function headers() {
  const value = { accept: "application/json, text/plain, */*", "user-agent": "DirtyDozensFFL/1.0" };
  if (process.env.ESPN_S2 && process.env.ESPN_SWID) value.cookie = `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.ESPN_SWID}`;
  return value;
}

async function probe(season) {
  const url = new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${LEAGUE_ID}`);
  for (const view of VIEWS) url.searchParams.append("view", view);
  try {
    const response = await fetch(url, { headers: headers(), cache: "no-store" });
    let games = 0;
    let teams = 0;
    let previousSeasons = [];
    if (response.ok) {
      const data = await response.json();
      games = Array.isArray(data?.schedule) ? data.schedule.length : 0;
      teams = Array.isArray(data?.teams) ? data.teams.length : 0;
      previousSeasons = Array.isArray(data?.status?.previousSeasons) ? data.status.previousSeasons : [];
    }
    return { season, status: response.status, ok: response.ok, games, teams, previousSeasons };
  } catch (error) {
    return { season, status: 0, ok: false, games: 0, teams: 0, error: error?.message || "request failed" };
  }
}

export async function GET() {
  const results = await Promise.all(SEASONS.map(probe));
  return NextResponse.json({
    leagueId: LEAGUE_ID,
    hasEspnS2: Boolean(process.env.ESPN_S2),
    hasSwid: Boolean(process.env.ESPN_SWID),
    results,
  }, { headers: { "Cache-Control": "no-store" } });
}
