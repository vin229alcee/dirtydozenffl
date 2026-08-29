import { createClient } from "@supabase/supabase-js";
import PageShell from "../../components/PageShell";

export const dynamic = "force-dynamic";

async function getStandings() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return [];
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.from("teams").select("*");
  if (error) return [];
  return (data || []).sort((a, b) => Number(b.wins || 0) - Number(a.wins || 0) || Number(b.points_for || 0) - Number(a.points_for || 0) || String(a.name).localeCompare(String(b.name)));
}

export default async function Standings() {
  const teams = await getStandings();
  return <PageShell title="STANDINGS" kicker="2026 SEASON">
    {teams.length ? <div className="standingsList">
      <div className="standingsListHeader"><span>RK</span><span>TEAM</span><span>REC</span><span>PF</span><span>PA</span></div>
      {teams.map((t, i) => <article className="standingRow" key={t.id}>
        <div className="standingRank">{i + 1}</div>
        <div className="standingIdentity"><strong>{t.name}</strong><small>{t.manager}</small></div>
        <div className="standingRecord"><strong>{t.wins ?? 0}-{t.losses ?? 0}</strong><small>RECORD</small></div>
        <div className="standingStat"><strong>{Number(t.points_for || 0).toFixed(1)}</strong><small>PF</small></div>
        <div className="standingStat"><strong>{Number(t.points_against || 0).toFixed(1)}</strong><small>PA</small></div>
      </article>)}
    </div> : <div className="panel emptyPanel">Standings will appear once league data is available.</div>}
  </PageShell>;
}
