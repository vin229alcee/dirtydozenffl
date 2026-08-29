import { createClient } from "@supabase/supabase-js";
import PageShell from "../../components/PageShell";

export const dynamic = "force-dynamic";

const ESPN_LEAGUE_ID = "2145514194";
const CURRENT_SEASON = 2026;

const KNOWN_CHAMPIONS = [
  { id: "known-2024", season: 2024, team_id: null, team_name: "Joe B Wan Kenobi", manager: "Antonio Samilton", source: "LEAGUE ARCHIVE" },
  { id: "known-2023", season: 2023, team_id: null, team_name: "It's Purdy Cool", manager: "Luke Erbacher", source: "LEAGUE ARCHIVE" },
  { id: "known-2022", season: 2022, team_id: null, team_name: "Incredible Dbags", manager: "Vin Alcee", source: "LEAGUE ARCHIVE" },
];

function espnTeamName(team) {
  if (!team) return "Champion";
  if (team.name) return team.name;
  return [team.location, team.nickname].filter(Boolean).join(" ").trim() || team.abbrev || "Champion";
}

function espnHeaders() {
  const headers = { accept: "application/json, text/plain, */*", "user-agent": "DirtyDozensFFL/1.0" };
  if (process.env.ESPN_S2 && process.env.ESPN_SWID) headers.cookie = `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.ESPN_SWID}`;
  return headers;
}

async function fetchEspnSeason(season) {
  const url = new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${ESPN_LEAGUE_ID}`);
  url.searchParams.append("view", "mTeam");
  url.searchParams.append("view", "mStandings");
  url.searchParams.append("view", "mStatus");
  const response = await fetch(url, { headers: espnHeaders(), cache: "no-store" });
  if (!response.ok) throw new Error(`ESPN ${season}: ${response.status}`);
  return response.json();
}

async function getEspnChampions() {
  try {
    const current = await fetchEspnSeason(CURRENT_SEASON);
    const previousSeasons = [...new Set((current?.status?.previousSeasons || []).map(Number))]
      .filter((season) => season > 2000 && season < CURRENT_SEASON)
      .sort((a, b) => b - a);

    const seasons = await Promise.all(previousSeasons.map(async (season) => {
      try { return { season, data: await fetchEspnSeason(season) }; }
      catch { return null; }
    }));

    return seasons.filter(Boolean).map(({ season, data }) => {
      const members = new Map((data?.members || []).map((member) => [member.id, member]));
      const champion = (data?.teams || []).find((team) => Number(team.rankCalculatedFinal) === 1);
      if (!champion) return null;
      const owner = members.get(champion?.owners?.[0]);
      return {
        id: `espn-${season}`,
        season,
        team_id: null,
        team_name: espnTeamName(champion),
        manager: owner?.displayName || [owner?.firstName, owner?.lastName].filter(Boolean).join(" ") || "Manager",
        source: "ESPN",
      };
    }).filter(Boolean);
  } catch {
    return [];
  }
}

async function getHistory() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let teams = [];
  let manualChampions = [];

  if (url && key) {
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const [{ data: teamRows }, { data: championRows }] = await Promise.all([
      supabase.from("teams").select("id,name,manager,logo").order("id"),
      supabase.from("champions").select("*").order("season", { ascending: false }),
    ]);
    teams = teamRows || [];
    manualChampions = championRows || [];
  }

  const byId = Object.fromEntries(teams.map((team) => [team.id, team]));
  const espnChampions = await getEspnChampions();
  const combinedBySeason = new Map();

  for (const champion of espnChampions) combinedBySeason.set(Number(champion.season), champion);
  for (const champion of KNOWN_CHAMPIONS) combinedBySeason.set(Number(champion.season), champion);

  for (const override of manualChampions) {
    const team = byId[override.team_id];
    combinedBySeason.set(Number(override.season), {
      id: override.id,
      season: Number(override.season),
      team_id: override.team_id,
      team_name: team?.name || combinedBySeason.get(Number(override.season))?.team_name || "Champion",
      manager: team?.manager || combinedBySeason.get(Number(override.season))?.manager || "Manager",
      source: "COMMISSIONER",
    });
  }

  return [...combinedBySeason.values()].sort((a, b) => Number(b.season) - Number(a.season));
}

export default async function History() {
  const champions = await getHistory();
  const titleCounts = champions.reduce((counts, champion) => {
    const key = champion.manager || champion.team_name;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});

  return <PageShell title="LEAGUE HISTORY" kicker="THE ARCHIVES">
    {champions.length ? <>
      <div className="weekSummary"><div><span>HISTORY</span><strong>{champions.length}</strong></div><b>ESPN + LEAGUE ARCHIVE + COMMISSIONER</b></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:14}}>
        {champions.map((champion, index) => {
          const titles = titleCounts[champion.manager || champion.team_name] || 1;
          return <article className="panel" key={`${champion.season}-${champion.id}`} style={{borderRadius:14,position:"relative",overflow:"hidden"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,borderBottom:"1px solid #2a3138",paddingBottom:12,marginBottom:16}}>
              <span style={{fontFamily:"Oswald, sans-serif",fontSize:30,fontWeight:700}}>{champion.season}</span>
              <b style={{fontSize:9,letterSpacing:1.2,color:index===0?"#d9aa4e":"#8e98a3"}}>{index === 0 ? "DEFENDING CHAMPION" : "LEAGUE CHAMPION"}</b>
            </div>
            <div style={{fontSize:38,marginBottom:8}}>🏆</div>
            <h2 style={{fontFamily:"Oswald, sans-serif",fontSize:24,lineHeight:1.1,margin:"0 0 6px"}}>{champion.team_name}</h2>
            <p style={{color:"#8e98a3",margin:"0 0 18px"}}>{champion.manager}</p>
            <small style={{fontSize:9,letterSpacing:1,color:"#d9aa4e",fontWeight:800}}>{titles} {titles === 1 ? "TITLE" : "TITLES"} · {champion.source}</small>
          </article>;
        })}
      </div>
    </> : <section className="panel emptyPanel">Championship history could not be loaded yet.</section>}
  </PageShell>;
}
