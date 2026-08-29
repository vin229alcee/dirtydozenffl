import { createClient } from "@supabase/supabase-js";
import PageShell from "../../components/PageShell";

export const dynamic = "force-dynamic";

async function getHistory() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { teams: [], champions: [] };
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [{ data: teams }, { data: champions }] = await Promise.all([
    supabase.from("teams").select("id,name,manager,logo").order("id"),
    supabase.from("champions").select("*").order("season", { ascending: false }),
  ]);
  return { teams: teams || [], champions: champions || [] };
}

export default async function History() {
  const { teams, champions } = await getHistory();
  const byId = Object.fromEntries(teams.map((team) => [team.id, team]));
  const titleCounts = champions.reduce((counts, champion) => {
    counts[champion.team_id] = (counts[champion.team_id] || 0) + 1;
    return counts;
  }, {});

  return <PageShell title="LEAGUE HISTORY" kicker="THE ARCHIVES">
    {champions.length ? <div className="historyGrid">
      {champions.map((champion, index) => {
        const team = byId[champion.team_id];
        const titles = titleCounts[champion.team_id] || 1;
        return <article className="panel historyCard" key={champion.id}>
          <div className="historySeason"><span>{champion.season}</span><b>{index === 0 ? "DEFENDING CHAMPION" : "LEAGUE CHAMPION"}</b></div>
          <div className="historyTrophy">🏆</div>
          <h2>{team?.name || "Champion"}</h2>
          <p>{team?.manager || "Manager"}</p>
          <small>{titles} {titles === 1 ? "TITLE" : "TITLES"} IN RECORDED HISTORY</small>
        </article>;
      })}
    </div> : <section className="panel emptyPanel">Championship history will appear here as seasons are added by the Commissioner.</section>}
  </PageShell>;
}
