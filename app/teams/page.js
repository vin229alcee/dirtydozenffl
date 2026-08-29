import Image from "next/image";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import PageShell from "../../components/PageShell";

export const dynamic = "force-dynamic";

const ESPN_LEAGUE_ID = "2145514194";
const SEASON = 2026;
const normalize = value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function espnTeamName(team) {
  if (!team) return "Team";
  if (team.name) return team.name;
  return [team.location, team.nickname].filter(Boolean).join(" ").trim() || team.abbrev || `Team ${team.id}`;
}

async function getLocalData() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { teams: [], rankings: [], champions: [] };
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [{ data: teams }, { data: rankings }, { data: champions }] = await Promise.all([
    supabase.from("teams").select("*").order("id"),
    supabase.from("power_rankings").select("*").eq("season", SEASON).order("week", { ascending: false }).order("rank"),
    supabase.from("champions").select("*")
  ]);
  return { teams: teams || [], rankings: rankings || [], champions: champions || [] };
}

async function getEspnData() {
  const url = new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leagues/${ESPN_LEAGUE_ID}`);
  for (const view of ["mTeam", "mStandings", "mMatchupScore"]) url.searchParams.append("view", view);
  const headers = { accept: "application/json, text/plain, */*", "user-agent": "DirtyDozensFFL/1.0" };
  if (process.env.ESPN_S2 && process.env.ESPN_SWID) headers.cookie = `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.ESPN_SWID}`;
  const response = await fetch(url, { headers, cache: "no-store" });
  if (!response.ok) throw new Error(`ESPN ${response.status}`);
  const data = await response.json();
  return { week: Number(data?.status?.currentMatchupPeriod || 1), teams: data?.teams || [], schedule: data?.schedule || [] };
}

function automaticRankings(espnTeams, schedule, currentWeek) {
  const base = espnTeams.map(team => {
    const overall = team?.record?.overall || {};
    const games = Number(overall.wins || 0) + Number(overall.losses || 0) + Number(overall.ties || 0);
    return { id: Number(team.id), name: espnTeamName(team), wins: Number(overall.wins || 0), losses: Number(overall.losses || 0), winPct: games ? (Number(overall.wins || 0) + Number(overall.ties || 0) * .5) / games : 0, pointsFor: Number(overall.pointsFor || 0), qualityWins: 0 };
  });
  const byId = Object.fromEntries(base.map(t => [t.id, t]));
  for (const game of schedule) {
    if (!game?.home || !game?.away || Number(game.matchupPeriodId) >= currentWeek) continue;
    const home = byId[Number(game.home.teamId)], away = byId[Number(game.away.teamId)];
    if (!home || !away) continue;
    const hs = Number(game.home.totalPoints || 0), as = Number(game.away.totalPoints || 0);
    if (hs > as) home.qualityWins += away.winPct;
    else if (as > hs) away.qualityWins += home.winPct;
  }
  const maxPF = Math.max(...base.map(t => t.pointsFor), 1), maxQuality = Math.max(...base.map(t => t.qualityWins), 1);
  return base.map(t => ({ ...t, powerScore: t.winPct * .45 + (t.pointsFor / maxPF) * .40 + (t.qualityWins / maxQuality) * .15 }))
    .sort((a,b) => b.powerScore - a.powerScore || b.pointsFor - a.pointsFor || b.wins - a.wins)
    .map((t,i) => ({ ...t, rank: i + 1 }));
}

export default async function Teams() {
  const local = await getLocalData();
  const byName = Object.fromEntries(local.teams.map(t => [normalize(t.name), t]));
  let cards = local.teams.map(t => ({ ...t, rank: null, source: "SAVED", currentRecord: `${t.wins ?? 0}-${t.losses ?? 0}`, currentPF: Number(t.points_for || 0) }));
  let week = 1;

  try {
    const espn = await getEspnData();
    week = espn.week;
    const autoRanks = automaticRankings(espn.teams, espn.schedule, week);
    const autoByName = Object.fromEntries(autoRanks.map(r => [normalize(r.name), r]));
    const commissionerRows = local.rankings.filter(r => Number(r.week) === week).sort((a,b) => Number(a.rank)-Number(b.rank));
    const commissionerByTeamId = commissionerRows.length === 12 ? Object.fromEntries(commissionerRows.map(r => [Number(r.team_id), Number(r.rank)])) : {};

    cards = espn.teams.map(et => {
      const name = espnTeamName(et);
      const localTeam = byName[normalize(name)];
      const overall = et?.record?.overall || {};
      const auto = autoByName[normalize(name)];
      return {
        ...(localTeam || {}),
        id: localTeam?.id ?? `espn-${et.id}`,
        name,
        manager: localTeam?.manager || "",
        logo: localTeam?.logo || et.logo || "",
        currentRecord: `${Number(overall.wins || 0)}-${Number(overall.losses || 0)}${Number(overall.ties || 0) ? `-${Number(overall.ties || 0)}` : ""}`,
        currentPF: Number(overall.pointsFor || 0),
        rank: localTeam && commissionerByTeamId[Number(localTeam.id)] ? commissionerByTeamId[Number(localTeam.id)] : auto?.rank,
        source: "ESPN LIVE",
      };
    });
  } catch {}

  return <PageShell title="TEAMS" kicker="THE 12">
    <div className="weekSummary"><div><span>FRANCHISES</span><strong>{cards.length}</strong></div><b>WEEK {week} · LIVE TEAM HUB</b></div>
    {cards.length ? <div className="teamGrid leagueTeamGrid">
      {cards.map(t => <Link href={`/teams/${t.id}`} key={t.id} style={{color:"inherit",textDecoration:"none"}}>
        <article className="panel teamCard leagueTeamCard" style={{height:"100%"}}>
          <div className="teamIdentity">
            <div className="logoPlate">{t.logo ? <Image src={t.logo} alt={`${t.name} logo`} width={120} height={140}/> : null}</div>
            <div className="teamIdentityCopy"><h2>{t.name}</h2><p>{t.manager}</p></div>
          </div>
          <div className="statTriplet">
            <span><small>RECORD</small><b>{t.currentRecord}</b></span>
            <span><small>POINTS FOR</small><b>{Number(t.currentPF || 0).toFixed(1)}</b></span>
            <span><small>POWER RANK</small><b>{t.rank ? `#${t.rank}` : "—"}</b></span>
          </div>
          <div style={{marginTop:12,fontSize:10,fontWeight:800,letterSpacing:1,color:"#8e98a3"}}>VIEW FRANCHISE PROFILE →</div>
        </article>
      </Link>)}
    </div> : <section className="panel emptyPanel">Team data is unavailable right now.</section>}
  </PageShell>;
}
