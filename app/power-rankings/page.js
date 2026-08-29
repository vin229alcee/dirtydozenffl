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

async function getLocalData() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { teams: [], rankings: [] };
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [{ data: teams }, { data: rankings }] = await Promise.all([
    supabase.from("teams").select("id,name,manager,logo").order("id"),
    supabase.from("power_rankings").select("*").eq("season", SEASON).order("week", { ascending: false }).order("rank"),
  ]);
  return { teams: teams || [], rankings: rankings || [] };
}

async function getEspnData() {
  const url = new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leagues/${ESPN_LEAGUE_ID}`);
  url.searchParams.append("view", "mTeam");
  url.searchParams.append("view", "mStandings");
  url.searchParams.append("view", "mMatchupScore");

  const headers = { accept: "application/json, text/plain, */*", "user-agent": "DirtyDozensFFL/1.0" };
  if (process.env.ESPN_S2 && process.env.ESPN_SWID) headers.cookie = `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.ESPN_SWID}`;

  const response = await fetch(url, { headers, cache: "no-store" });
  if (!response.ok) throw new Error(`ESPN returned ${response.status}`);
  const data = await response.json();
  return { week: Number(data?.status?.currentMatchupPeriod || 1), teams: data?.teams || [], schedule: data?.schedule || [] };
}

function automaticRankings(espnTeams, schedule, currentWeek, localByName) {
  const base = espnTeams.map((team) => {
    const overall = team?.record?.overall || {};
    const games = Number(overall.wins || 0) + Number(overall.losses || 0) + Number(overall.ties || 0);
    return {
      espnTeamId: Number(team.id),
      name: espnTeamName(team),
      manager: localByName[normalize(espnTeamName(team))]?.manager || "",
      wins: Number(overall.wins || 0),
      losses: Number(overall.losses || 0),
      ties: Number(overall.ties || 0),
      winPct: games ? (Number(overall.wins || 0) + Number(overall.ties || 0) * 0.5) / games : 0,
      pointsFor: Number(overall.pointsFor || 0),
      qualityWins: 0,
    };
  });

  const byEspnId = Object.fromEntries(base.map((team) => [team.espnTeamId, team]));
  for (const game of schedule) {
    if (!game?.home || !game?.away || Number(game.matchupPeriodId) >= currentWeek) continue;
    const home = byEspnId[Number(game.home.teamId)];
    const away = byEspnId[Number(game.away.teamId)];
    if (!home || !away) continue;
    const hs = Number(game.home.totalPoints || 0), as = Number(game.away.totalPoints || 0);
    if (hs > as) home.qualityWins += away.winPct;
    else if (as > hs) away.qualityWins += home.winPct;
  }

  const maxPF = Math.max(...base.map((t) => t.pointsFor), 1);
  const maxQuality = Math.max(...base.map((t) => t.qualityWins), 1);
  for (const team of base) {
    const pfScore = team.pointsFor / maxPF;
    const qualityScore = team.qualityWins / maxQuality;
    team.powerScore = team.winPct * 0.45 + pfScore * 0.40 + qualityScore * 0.15;
  }

  return base.sort((a, b) => b.powerScore - a.powerScore || b.pointsFor - a.pointsFor || b.wins - a.wins).map((team, index) => ({ ...team, rank: index + 1 }));
}

export default async function Rankings() {
  const local = await getLocalData();
  const localById = Object.fromEntries(local.teams.map((t) => [t.id, t]));
  const localByName = Object.fromEntries(local.teams.map((t) => [normalize(t.name), t]));

  let week = 1;
  let rankings = [];
  let source = "AUTO — ESPN STATS";

  try {
    const espn = await getEspnData();
    week = espn.week;
    const commissionerRows = local.rankings.filter((row) => Number(row.week) === week).sort((a, b) => Number(a.rank) - Number(b.rank));
    if (commissionerRows.length === 12) {
      source = "COMMISSIONER EDITED";
      rankings = commissionerRows.map((row) => {
        const team = localById[row.team_id];
        return { rank: row.rank, name: team?.name || "Team", manager: team?.manager || "", commentary: row.commentary || "" };
      });
    } else {
      rankings = automaticRankings(espn.teams, espn.schedule, week, localByName);
    }
  } catch {
    const latestWeek = local.rankings.length ? Math.max(...local.rankings.map((r) => Number(r.week))) : null;
    if (latestWeek) {
      week = latestWeek;
      source = "COMMISSIONER EDITED";
      rankings = local.rankings.filter((r) => Number(r.week) === latestWeek).sort((a, b) => Number(a.rank) - Number(b.rank)).map((row) => {
        const team = localById[row.team_id];
        return { rank: row.rank, name: team?.name || "Team", manager: team?.manager || "", commentary: row.commentary || "" };
      });
    }
  }

  return <PageShell title="POWER RANKINGS" kicker="DIRTY DOZENS POWER INDEX">
    {rankings.length ? <>
      <div className="weekSummary"><div><span>WEEK</span><strong>{week}</strong></div><b>{source}</b></div>
      <div className="rankingCards">{rankings.map((r) => <article className="panel rankCard" key={`${r.rank}-${r.name}`}>
        <b className="rankNumber">#{r.rank}</b>
        <div><h2>{r.name}</h2><p>{r.manager || ""}</p>{r.commentary ? <p className="rankComment">{r.commentary}</p> : <p className="rankComment">Record {r.wins ?? 0}-{r.losses ?? 0} · {Number(r.pointsFor || 0).toFixed(1)} PF · Quality-win score {Number(r.qualityWins || 0).toFixed(2)}</p>}</div>
      </article>)}</div>
      {source === "AUTO — ESPN STATS" && <section className="panel"><p>Automatic formula: 45% record, 40% points scored, and 15% quality of wins based on the strength of defeated opponents. A full 12-team ranking published in the Commissioner dashboard overrides the automatic order for that week.</p></section>}
    </> : <section className="panel emptyPage"><h2>POWER RANKINGS PENDING</h2><p>Rankings will calculate automatically once ESPN season statistics are available.</p></section>}
  </PageShell>;
}
