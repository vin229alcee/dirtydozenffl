import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ESPN_LEAGUE_ID = "2145514194";
const SEASON = 2026;
const ESPN_BASE = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leagues/${ESPN_LEAGUE_ID}`;

function displayName(team) {
  if (!team) return "Unknown Team";
  return team.name || [team.location, team.nickname].filter(Boolean).join(" ").trim() || team.abbrev || `Team ${team.id}`;
}

function projectedPoints(side) {
  const value = side?.totalProjectedPointsLive ?? side?.totalProjectedPoints;
  return value == null || !Number.isFinite(Number(value)) ? null : Number(value);
}

function headers() {
  const value = {
    accept: "application/json, text/plain, */*",
    "user-agent": "DirtyDozensFFL/1.0",
  };
  if (process.env.ESPN_S2 && process.env.ESPN_SWID) {
    value.cookie = `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.ESPN_SWID}`;
  }
  return value;
}

async function fetchEspn(url) {
  const response = await fetch(url, { headers: headers(), cache: "no-store" });
  if (!response.ok) throw new Error(`ESPN returned ${response.status}`);
  return response.json();
}

export async function GET() {
  try {
    const baseUrl = new URL(ESPN_BASE);
    for (const view of ["mTeam", "mMatchupScore", "mStatus"]) baseUrl.searchParams.append("view", view);
    const data = await fetchEspn(baseUrl);

    const currentWeek = Number(data?.status?.currentMatchupPeriod || 1);
    const currentScoringPeriod = Number(data?.status?.currentScoringPeriod || currentWeek);
    let liveSchedule = [];

    try {
      const liveUrl = new URL(ESPN_BASE);
      for (const view of ["mBoxscore", "mLiveScoring", "mScoreboard"]) liveUrl.searchParams.append("view", view);
      liveUrl.searchParams.set("matchupPeriodId", String(currentWeek));
      liveUrl.searchParams.set("scoringPeriodId", String(currentScoringPeriod));
      const liveData = await fetchEspn(liveUrl);
      liveSchedule = liveData?.schedule || [];
    } catch {
      liveSchedule = [];
    }

    const liveById = new Map(liveSchedule.map((game) => [Number(game.id), game]));
    const teams = new Map((data?.teams || []).map((team) => [Number(team.id), team]));

    const games = (data?.schedule || [])
      .filter((game) => game?.home?.teamId && game?.away?.teamId)
      .map((game) => {
        const liveGame = liveById.get(Number(game.id));
        const homeSide = liveGame?.home || game.home;
        const awaySide = liveGame?.away || game.away;
        const homeId = Number(game.home.teamId);
        const awayId = Number(game.away.teamId);
        const homeScore = homeSide?.totalPoints == null ? null : Number(homeSide.totalPoints);
        const awayScore = awaySide?.totalPoints == null ? null : Number(awaySide.totalPoints);
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
          home: {
            id: homeId,
            name: displayName(teams.get(homeId)),
            score: homeScore,
            projectedScore: projectedPoints(homeSide),
          },
          away: {
            id: awayId,
            name: displayName(teams.get(awayId)),
            score: awayScore,
            projectedScore: projectedPoints(awaySide),
          },
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
