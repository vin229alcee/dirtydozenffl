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

async function getLocalTeams() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return [];
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await supabase.from("teams").select("*");
  return data || [];
}

async function getEspnStandings() {
  const url = new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leagues/${ESPN_LEAGUE_ID}`);
  url.searchParams.append("view", "mTeam");
  url.searchParams.append("view", "mStandings");

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

  return (data?.teams || []).map((team) => {
    const overall = team?.record?.overall || {};
    return {
      espnTeamId: Number(team.id),
      name: espnTeamName(team),
      wins: Number(overall.wins || 0),
      losses: Number(overall.losses || 0),
      ties: Number(overall.ties || 0),
      points_for: Number(overall.pointsFor || 0),
      points_against: Number(overall.pointsAgainst || 0),
      percentage: Number(overall.percentage || 0),
    };
  });
}

export default async function Standings() {
  const localTeams = await getLocalTeams();
  const localByName = Object.fromEntries(localTeams.map((team) => [normalize(team.name), team]));

  let source = "ESPN LIVE";
  let teams;

  try {
    const espnTeams = await getEspnStandings();
    teams = espnTeams.map((team) => ({
      ...team,
      manager: localByName[normalize(team.name)]?.manager || "",
    }));
  } catch {
    source = "SAVED STANDINGS";
    teams = localTeams.map((team) => ({
      ...team,
      wins: Number(team.wins || 0),
      losses: Number(team.losses || 0),
      ties: Number(team.ties || 0),
      points_for: Number(team.points_for || 0),
      points_against: Number(team.points_against || 0),
      percentage: Number(team.wins || 0) + Number(team.losses || 0) + Number(team.ties || 0)
        ? (Number(team.wins || 0) + Number(team.ties || 0) * 0.5) / (Number(team.wins || 0) + Number(team.losses || 0) + Number(team.ties || 0))
        : 0,
    }));
  }

  teams.sort((a, b) =>
    Number(b.percentage || 0) - Number(a.percentage || 0) ||
    Number(b.wins || 0) - Number(a.wins || 0) ||
    Number(b.points_for || 0) - Number(a.points_for || 0) ||
    String(a.name).localeCompare(String(b.name))
  );

  return <PageShell title="STANDINGS" kicker="2026 SEASON">
    <div className="weekSummary"><div><span>DATA</span><strong>LIVE</strong></div><b>{source}</b></div>
    {teams.length ? <div className="standingsList">
      <div className="standingsListHeader"><span>RK</span><span>TEAM</span><span>REC</span><span>PF</span><span>PA</span></div>
      {teams.map((t, i) => <article className="standingRow" key={t.espnTeamId || t.id || t.name}>
        <div className="standingRank">{i + 1}</div>
        <div className="standingIdentity"><strong>{t.name}</strong><small>{t.manager}</small></div>
        <div className="standingRecord"><strong>{t.wins ?? 0}-{t.losses ?? 0}{Number(t.ties || 0) ? `-${t.ties}` : ""}</strong><small>RECORD</small></div>
        <div className="standingStat"><strong>{Number(t.points_for || 0).toFixed(1)}</strong><small>PF</small></div>
        <div className="standingStat"><strong>{Number(t.points_against || 0).toFixed(1)}</strong><small>PA</small></div>
      </article>)}
    </div> : <div className="panel emptyPanel">Standings will appear once league data is available.</div>}
  </PageShell>;
}
