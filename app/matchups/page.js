import Image from "next/image";
import { createClient } from "@supabase/supabase-js";
import PageShell from "../../components/PageShell";
import { mascotForTeam } from "../../lib/teamMascots";

export const dynamic = "force-dynamic";
const ESPN_LEAGUE_ID = "2145514194";
const SEASON = 2026;
const ESPN_BASE = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leagues/${ESPN_LEAGUE_ID}`;
const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const BENCH_SLOTS = new Set([20, 21]);
const SLOT_NAMES = {
  0: "QB",
  2: "RB",
  4: "WR",
  6: "TE",
  16: "D/ST",
  17: "K",
  20: "BE",
  21: "IR",
  23: "FLEX",
};

function espnTeamName(team) {
  if (!team) return "Unknown Team";
  if (team.name) return team.name;
  return [team.location, team.nickname].filter(Boolean).join(" ").trim() || team.abbrev || `ESPN Team ${team.id}`;
}

function projectedPoints(side) {
  const value = side?.totalProjectedPointsLive ?? side?.totalProjectedPoints;
  return value == null || !Number.isFinite(Number(value)) ? null : Number(value);
}

function rosterPlayers(side) {
  const entries = side?.rosterForCurrentScoringPeriod?.entries || side?.rosterForMatchupPeriod?.entries || [];
  return entries
    .map((entry) => {
      const pool = entry?.playerPoolEntry || {};
      const player = pool?.player || {};
      const slotId = Number(entry?.lineupSlotId);
      const scoreValue = pool?.appliedStatTotal;
      return {
        id: Number(player?.id || entry?.playerId || pool?.id || 0),
        name: player?.fullName || [player?.firstName, player?.lastName].filter(Boolean).join(" ") || "Player",
        slotId,
        slot: SLOT_NAMES[slotId] || (BENCH_SLOTS.has(slotId) ? "BE" : "FLEX"),
        score: scoreValue == null || !Number.isFinite(Number(scoreValue)) ? null : Number(scoreValue),
        starter: !BENCH_SLOTS.has(slotId),
        injuryStatus: player?.injuryStatus || entry?.injuryStatus || "",
      };
    })
    .sort((a, b) => Number(b.starter) - Number(a.starter) || a.slotId - b.slotId || a.name.localeCompare(b.name));
}

function espnHeaders() {
  const headers = { accept: "application/json, text/plain, */*", "user-agent": "DirtyDozensFFL/1.0" };
  if (process.env.ESPN_S2 && process.env.ESPN_SWID) headers.cookie = `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.ESPN_SWID}`;
  return headers;
}

async function fetchEspn(url) {
  const response = await fetch(url, { headers: espnHeaders(), cache: "no-store" });
  if (!response.ok) throw new Error(`ESPN returned ${response.status}`);
  return response.json();
}

async function getTeams() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return [];
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await supabase.from("teams").select("id,name,manager,short_name,logo").order("id");
  return data || [];
}

async function getEspnMatchups() {
  const baseUrl = new URL(ESPN_BASE);
  for (const view of ["mTeam", "mMatchupScore", "mStatus"]) baseUrl.searchParams.append("view", view);
  const data = await fetchEspn(baseUrl);
  const week = Number(data?.status?.currentMatchupPeriod || 1);
  const scoringPeriod = Number(data?.status?.currentScoringPeriod || week);
  const byId = new Map((data?.teams || []).map((team) => [Number(team.id), team]));

  let liveSchedule = [];
  try {
    const liveUrl = new URL(ESPN_BASE);
    for (const view of ["mBoxscore", "mLiveScoring", "mScoreboard"]) liveUrl.searchParams.append("view", view);
    liveUrl.searchParams.set("matchupPeriodId", String(week));
    liveUrl.searchParams.set("scoringPeriodId", String(scoringPeriod));
    const liveData = await fetchEspn(liveUrl);
    liveSchedule = liveData?.schedule || [];
  } catch {
    liveSchedule = [];
  }

  const liveById = new Map(liveSchedule.map((game) => [Number(game.id), game]));
  return {
    week,
    matchups: (data?.schedule || [])
      .filter((game) => Number(game.matchupPeriodId) === week && game.home && game.away)
      .map((game) => {
        const liveGame = liveById.get(Number(game.id));
        const homeSide = liveGame?.home || game.home;
        const awaySide = liveGame?.away || game.away;
        return {
          id: `espn-${game.id}`,
          team1_id: Number(game.home.teamId),
          team2_id: Number(game.away.teamId),
          team1_name: espnTeamName(byId.get(Number(game.home.teamId))),
          team2_name: espnTeamName(byId.get(Number(game.away.teamId))),
          team1_score: homeSide?.totalPoints == null ? null : Number(homeSide.totalPoints),
          team2_score: awaySide?.totalPoints == null ? null : Number(awaySide.totalPoints),
          team1_projected: projectedPoints(homeSide),
          team2_projected: projectedPoints(awaySide),
          team1_players: rosterPlayers(homeSide),
          team2_players: rosterPlayers(awaySide),
          completed: Boolean(game.winner && game.winner !== "UNDECIDED"),
        };
      }),
  };
}

async function getSavedMatchups() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { matchups: [], week: 1 };
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await supabase.from("matchups").select("*").eq("season", SEASON).order("week", { ascending: false }).order("id");
  const week = data?.length ? Math.max(...data.map((matchup) => Number(matchup.week))) : 1;
  return { matchups: (data || []).filter((matchup) => Number(matchup.week) === week), week };
}

function PlayerList({ teamName, players }) {
  if (!players?.length) return <div className="playerBoxEmpty">Player scoring will appear when ESPN publishes the Week box score.</div>;
  return (
    <div className="playerTeamBox">
      <div className="playerTeamBoxHead"><strong>{teamName}</strong><span>PTS</span></div>
      <div className="playerRows">
        {players.map((player, index) => (
          <div className={`playerScoreRow ${player.starter ? "starter" : "bench"}`} key={`${player.id}-${player.slotId}-${index}`}>
            <span className="playerSlot">{player.slot}</span>
            <span className="playerName">{player.name}{player.injuryStatus && player.injuryStatus !== "ACTIVE" ? <small>{player.injuryStatus}</small> : null}</span>
            <strong>{player.score == null ? "—" : player.score.toFixed(1)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function Matchups() {
  const teams = await getTeams();
  const byName = Object.fromEntries(teams.map((team) => [normalize(team.name), team]));
  const byId = Object.fromEntries(teams.map((team) => [Number(team.id), team]));
  let source = "ESPN LIVE";
  let week = 1;
  let matchups = [];

  try {
    const espn = await getEspnMatchups();
    week = espn.week;
    matchups = espn.matchups.map((matchup) => ({
      ...matchup,
      team1_name: byId[matchup.team1_id]?.name || matchup.team1_name,
      team2_name: byId[matchup.team2_id]?.name || matchup.team2_name,
    }));
  } catch {
    const saved = await getSavedMatchups();
    week = saved.week;
    source = "SAVED RESULTS";
    matchups = saved.matchups.map((matchup) => ({
      ...matchup,
      team1_name: byId[matchup.team1_id]?.name || "Team",
      team2_name: byId[matchup.team2_id]?.name || "Team",
      team1_projected: null,
      team2_projected: null,
      team1_players: [],
      team2_players: [],
    }));
  }

  return (
    <PageShell title="MATCHUPS" kicker="2026 SEASON">
      {matchups.length ? <>
        <div className="weekSummary"><div><span>WEEK</span><strong>{week}</strong></div><b>{source}</b></div>
        <div className="matchupGrid publicMatchupGrid">
          {matchups.map((matchup) => {
            const home = byName[normalize(matchup.team1_name)] || byId[matchup.team1_id];
            const away = byName[normalize(matchup.team2_name)] || byId[matchup.team2_id];
            const score1 = matchup.team1_score == null ? null : Number(matchup.team1_score);
            const score2 = matchup.team2_score == null ? null : Number(matchup.team2_score);
            const projected1 = matchup.team1_projected == null ? null : Number(matchup.team1_projected);
            const projected2 = matchup.team2_projected == null ? null : Number(matchup.team2_projected);
            return (
              <article className="panel publicMatchupCard mascotMatchup" key={matchup.id}>
                <div className={`publicTeamRow ${score1 != null && score2 != null && score1 > score2 ? "winner" : ""}`}>
                  <div className="matchupIdentity">
                    <div className="miniMascot"><Image src={mascotForTeam(matchup.team1_name, home?.logo || "")} alt="" width={70} height={70}/></div>
                    <div><strong>{matchup.team1_name}</strong><small>{home?.manager || ""}</small></div>
                  </div>
                  <div className="matchupScoreBlock">
                    <b>{score1 == null ? "—" : score1.toFixed(1)}</b>
                    {projected1 != null ? <small>PROJ {projected1.toFixed(1)}</small> : null}
                  </div>
                </div>
                <div className="matchupStatus">{matchup.completed ? "FINAL" : "LIVE / SCHEDULED"}</div>
                <div className={`publicTeamRow ${score1 != null && score2 != null && score2 > score1 ? "winner" : ""}`}>
                  <div className="matchupIdentity">
                    <div className="miniMascot"><Image src={mascotForTeam(matchup.team2_name, away?.logo || "")} alt="" width={70} height={70}/></div>
                    <div><strong>{matchup.team2_name}</strong><small>{away?.manager || ""}</small></div>
                  </div>
                  <div className="matchupScoreBlock">
                    <b>{score2 == null ? "—" : score2.toFixed(1)}</b>
                    {projected2 != null ? <small>PROJ {projected2.toFixed(1)}</small> : null}
                  </div>
                </div>
                <details className="playerBoxscore">
                  <summary>PLAYER BOX SCORE <span>View lineup scoring</span></summary>
                  <div className="playerBoxscoreGrid">
                    <PlayerList teamName={matchup.team1_name} players={matchup.team1_players} />
                    <PlayerList teamName={matchup.team2_name} players={matchup.team2_players} />
                  </div>
                </details>
              </article>
            );
          })}
        </div>
      </> : <section className="panel emptyPage"><h2>WEEK {week} SCHEDULE PENDING</h2><p>The ESPN schedule will appear here automatically as soon as it is available.</p></section>}
    </PageShell>
  );
}
