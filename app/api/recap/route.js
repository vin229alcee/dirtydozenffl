import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
const ESPN_LEAGUE_ID = "2145514194";
const SEASON = 2026;

function isFinal(game) {
  return Boolean(game?.winner && game.winner !== "UNDECIDED");
}

function score(side) {
  return Number(side?.totalPoints || 0);
}

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const localTeams = {};

    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data } = await supabase.from("teams").select("id,name,manager");
      for (const team of data || []) localTeams[Number(team.id)] = team;
    }

    const url = new URL(
      `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leagues/${ESPN_LEAGUE_ID}`
    );
    url.searchParams.append("view", "mTeam");
    url.searchParams.append("view", "mMatchupScore");

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
    const currentWeek = Number(data?.status?.currentMatchupPeriod || 1);
    const schedule = data?.schedule || [];
    const completedWeeks = [
      ...new Set(
        schedule
          .filter((g) => g?.home && g?.away && isFinal(g))
          .map((g) => Number(g.matchupPeriodId))
          .filter((w) => w && w <= currentWeek)
      ),
    ];

    if (!completedWeeks.length) {
      return NextResponse.json({ ready: false, currentWeek });
    }

    const week = Math.max(...completedWeeks);
    const games = schedule
      .filter(
        (g) =>
          Number(g.matchupPeriodId) === week &&
          g?.home &&
          g?.away &&
          isFinal(g)
      )
      .map((g) => {
        const home = localTeams[Number(g.home.teamId)] || {
          name: `Team ${g.home.teamId}`,
          manager: "",
        };
        const away = localTeams[Number(g.away.teamId)] || {
          name: `Team ${g.away.teamId}`,
          manager: "",
        };
        const homeScore = score(g.home);
        const awayScore = score(g.away);
        const homeWon = homeScore > awayScore;
        return {
          id: g.id,
          home,
          away,
          homeScore,
          awayScore,
          margin: Math.abs(homeScore - awayScore),
          combined: homeScore + awayScore,
          winner: homeWon ? home : away,
          loser: homeWon ? away : home,
        };
      });

    const performances = games
      .flatMap((g) => [
        { team: g.home, score: g.homeScore },
        { team: g.away, score: g.awayScore },
      ])
      .sort((a, b) => b.score - a.score);

    const biggest = [...games].sort((a, b) => b.margin - a.margin)[0];
    const closest = [...games].sort(
      (a, b) => a.margin - b.margin || b.combined - a.combined
    )[0];
    const average =
      performances.reduce((sum, performance) => sum + performance.score, 0) /
      performances.length;

    return NextResponse.json({
      ready: true,
      week,
      currentWeek,
      high: performances[0],
      low: performances[performances.length - 1],
      biggest: {
        winner: biggest.winner,
        loser: biggest.loser,
        margin: biggest.margin,
      },
      closest: {
        winner: closest.winner,
        loser: closest.loser,
        margin: closest.margin,
      },
      average,
    });
  } catch (error) {
    return NextResponse.json(
      { ready: false, error: error?.message || "Recap unavailable" },
      { status: 200 }
    );
  }
}
