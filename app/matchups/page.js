import { createClient } from "@supabase/supabase-js";
import PageShell from "../../components/PageShell";

export const dynamic = "force-dynamic";

async function getLiveMatchups() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { teams: [], matchups: [], week: 1 };

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [{ data: teams }, { data: matchups }] = await Promise.all([
    supabase.from("teams").select("id,name,manager,short_name,logo").order("id"),
    supabase.from("matchups").select("*").eq("season", 2026).order("week", { ascending: false }).order("id"),
  ]);

  const latestWeek = matchups?.length ? Math.max(...matchups.map((m) => Number(m.week))) : 1;
  return { teams: teams || [], matchups: (matchups || []).filter((m) => Number(m.week) === latestWeek), week: latestWeek };
}

export default async function Matchups() {
  const { teams, matchups, week } = await getLiveMatchups();
  const byId = Object.fromEntries(teams.map((t) => [t.id, t]));

  return <PageShell title="MATCHUPS" kicker="2026 SEASON">
    {matchups.length ? <>
      <div className="panelTitle"><h3>WEEK {week}</h3><span>{matchups.every((m) => m.completed) ? "FINAL" : "IN PROGRESS"}</span></div>
      <div className="matchupGrid">{matchups.map((m) => {
        const home = byId[m.team1_id];
        const away = byId[m.team2_id];
        return <article className="panel matchupCard" key={m.id}>
          <div className="teamCell"><strong>{home?.name || "Team"}</strong></div>
          <strong className="bigScore">{m.team1_score == null ? "—" : Number(m.team1_score).toFixed(1)}</strong>
          <span className="finalTag">{m.completed ? "FINAL" : "SCHEDULED"}</span>
          <strong className="bigScore">{m.team2_score == null ? "—" : Number(m.team2_score).toFixed(1)}</strong>
          <div className="teamCell"><strong>{away?.name || "Team"}</strong></div>
        </article>;
      })}</div>
    </> : <section className="panel emptyPage"><h2>WEEK 1 SCHEDULE PENDING</h2><p>The official 2026 matchups will appear here once they are entered in the commissioner dashboard.</p></section>}
  </PageShell>;
}
