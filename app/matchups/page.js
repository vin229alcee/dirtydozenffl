import { createClient } from "@supabase/supabase-js";
import PageShell from "../../components/PageShell";

export const dynamic = "force-dynamic";

const ESPN_LEAGUE_ID = "2145514194";
const SEASON = 2026;
const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function espnTeamName(team) {
  if (!team) return "Unknown Team";
  if (team.name) return team.name;
  return [team.location, team.nickname].filter(Boolean).join(" ").trim() || team.abbrev || `ESPN Team ${team.id}`;
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
  const url = new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leagues/${ESPN_LEAGUE_ID}`);
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
  const week = Number(data?.status?.currentMatchupPeriod || 1);
  const teamById = new Map((data?.teams || []).map((team) => [Number(team.id), team]));
  const games = (data?.schedule || []).filter((game) => Number(game.matchupPeriodId) === week && game.home && game.away);

  return {
    week,
    matchups: games.map((game) => ({
      id: `espn-${game.id}`,
      team1_name: espnTeamName(teamById.get(Number(game.home.teamId))),
      team2_name: espnTeamName(teamById.get(Number(game.away.teamId))),
      team1_score: game.home.totalPoints == null ? null : Number(game.home.totalPoints),
      team2_score: game.away.totalPoints == null ? null : Number(game.away.totalPoints),
      completed: Boolean(game.winner && game.winner !== "UNDECIDED"),
    })),
  };
}

async function getSavedMatchups() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { matchups: [], week: 1 };
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: matchups } = await supabase.from("matchups").select("*").eq("season", SEASON).order("week", { ascending: false }).order("id");
  const latestWeek = matchups?.length ? Math.max(...matchups.map((m) => Number(m.week))) : 1;
  return { matchups: (matchups || []).filter((m) => Number(m.week) === latestWeek), week: latestWeek };
}

export default async function Matchups() {
  const teams = await getTeams();
  const localByName = Object.fromEntries(teams.map((team) => [normalize(team.name), team]));
  const localById = Object.fromEntries(teams.map((team) => [team.id, team]));

  let source = "ESPN LIVE";
  let week = 1;
  let matchups = [];

  try {
    const espn = await getEspnMatchups();
    week = espn.week;
    matchups = espn.matchups;
  } catch {
    const saved = await getSavedMatchups();
    week = saved.week;
    source = "SAVED RESULTS";
    matchups = saved.matchups.map((m) => ({
      ...m,
      team1_name: localById[m.team1_id]?.name || "Team",
      team2_name: localById[m.team2_id]?.name || "Team",
    }));
  }

  return <PageShell title="MATCHUPS" kicker="2026 SEASON">
    {matchups.length ? <>
      <div className="weekSummary"><div><span>WEEK</span><strong>{week}</strong></div><b>{source}</b></div>
      <div className="matchupGrid publicMatchupGrid">{matchups.map((m) => {
        const home = localByName[normalize(m.team1_name)];
        const away = localByName[normalize(m.team2_name)];
        const s1 = m.team1_score == null ? null : Number(m.team1_score);
        const s2 = m.team2_score == null ? null : Number(m.team2_score);
        return <article className="panel publicMatchupCard" key={m.id}>
          <div className={`publicTeamRow ${s1 != null && s2 != null && s1 > s2 ? "winner" : ""}`}><div><strong>{m.team1_name}</strong><small>{home?.manager || ""}</small></div><b>{s1 == null ? "—" : s1.toFixed(1)}</b></div>
          <div className="matchupStatus">{m.completed ? "FINAL" : "LIVE / SCHEDULED"}</div>
          <div className={`publicTeamRow ${s1 != null && s2 != null && s2 > s1 ? "winner" : ""}`}><div><strong>{m.team2_name}</strong><small>{away?.manager || ""}</small></div><b>{s2 == null ? "—" : s2.toFixed(1)}</b></div>
        </article>;
      })}</div>
    </> : <section className="panel emptyPage"><h2>WEEK {week} SCHEDULE PENDING</h2><p>The ESPN schedule will appear here automatically as soon as it is available.</p></section>}
  </PageShell>;
}