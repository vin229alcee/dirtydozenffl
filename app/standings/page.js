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
  return (data || []).sort((a, b) =>
    Number(b.wins || 0) - Number(a.wins || 0) ||
    Number(b.points_for || 0) - Number(a.points_for || 0) ||
    String(a.name).localeCompare(String(b.name))
  );
}

export default async function Standings() {
  const teams = await getStandings();
  return <PageShell title="STANDINGS" kicker="2026 SEASON">
    <section className="panel wideTable"><table><thead><tr><th>Rank</th><th>Team</th><th>Manager</th><th>W</th><th>L</th><th>PF</th><th>PA</th></tr></thead><tbody>
      {teams.map((t, i) => <tr key={t.id}><td>{i + 1}</td><td><b>{t.name}</b></td><td>{t.manager}</td><td>{t.wins ?? 0}</td><td>{t.losses ?? 0}</td><td>{Number(t.points_for || 0).toFixed(1)}</td><td>{Number(t.points_against || 0).toFixed(1)}</td></tr>)}
    </tbody></table>{!teams.length && <div className="emptyPanel">Standings will appear once league data is available.</div>}</section>
  </PageShell>;
}
