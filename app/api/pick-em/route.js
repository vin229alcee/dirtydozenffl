import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ESPN_LEAGUE_ID = "2145514194";
const SEASON = 2026;

function displayName(team) {
  if (!team) return "Unknown Team";
  return team.name || [team.location, team.nickname].filter(Boolean).join(" ").trim() || team.abbrev || `Team ${team.id}`;
}

export async function GET() {
  try {
    const url = new URL(
      `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leagues/${ESPN_LEAGUE_ID}`
    );
    for (const view of ["mTeam", "mMatchupScore", "mStatus"]) url.searchParams.append("view", view);

    const headers = {
      accept: "application/json, text/plain, */*",
      "user-agent": "DirtyDozensFFL/1.0",
    };
    if (process.env.ESPN_S2 && process.env.ESPN_SWID) {
      headers.cookie = `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.ESPN_SWID}`;
    }

    const response = await fetch(url, { headers, cache: "no-store" });
    if (!response.ok) throw new Error(`ESPN returned ${response.status}`);

    const data = await response.json();
    const teams = new Map((data?.teams || []).map((team) => [Number(team.id), team]));
    const currentWeek = Number(data?.status?.currentMatchupPeriod || 1);

    const games = (data?.schedule || [])
      .filter((game) => game?.home?.teamId && game?.away?.teamId)
      .map((game) => {
        const homeId = Number(game.home.teamId);
        const awayId = Number(game.away.teamId);
        const homeScore = game.home.totalPoints == null ? null : Number(game.home.totalPoints);
        const awayScore = game.away.totalPoints == null ? null : Number(game.away.totalPoints);
        const completed = Boolean(game.winner && game.winner !== "UNDECIDED");
        let winnerTeamId = null;
        if (completed && Number.isFinite(homeScore) && Number.isFinite(awayScore) && homeScore !== awayScore) {
          winnerTeamId = homeScore > awayScore ? homeId : awayId;
        }
        return {
          id: Number(game.id),
          week: Number(game.matchupPeriodId || 0),
          kickoffAt: game.date ? new Date(Number(game.date)).toISOString() : null,
          completed,
          home: { id: homeId, name: displayName(teams.get(homeId)), score: homeScore },
          away: { id: awayId, name: displayName(teams.get(awayId)), score: awayScore },
          winnerTeamId,
        };
      })
      .filter((game) => game.week > 0);

    return NextResponse.json({ season: SEASON, currentWeek, games });
  } catch (error) {
    return NextResponse.json(
      { season: SEASON, currentWeek: 1, games: [], error: error?.message || "Pick 'Em data unavailable" },
      { status: 200 }
    );
  }
}
