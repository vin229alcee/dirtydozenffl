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
      <div className="weekSummary"><div><span>WEEK</span><strong>{week}</strong></div><b>{matchups.every((m) => m.completed) ? "FINAL" : "IN PROGRESS"}</b></div>
      <div className="matchupGrid publicMatchupGrid">{matchups.map((m) => {
        const home = byId[m.team1_id]; const away = byId[m.team2_id];
        const s1 = m.team1_score == null ? null : Number(m.team1_score); const s2 = m.team2_score == null ? null : Number(m.team2_score);
        return <article className="panel publicMatchupCard" key={m.id}>
          <div className={`publicTeamRow ${s1 != null && s2 != null && s1 > s2 ? "winner" : ""}`}><div><strong>{home?.name || "Team"}</strong><small>{home?.manager || ""}</small></div><b>{s1 == null ? "—" : s1.toFixed(1)}</b></div>
          <div className="matchupStatus">{m.completed ? "FINAL" : "SCHEDULED"}</div>
          <div className={`publicTeamRow ${s1 != null && s2 != null && s2 > s1 ? "winner" : ""}`}><div><strong>{away?.name || "Team"}</strong><small>{away?.manager || ""}</small></div><b>{s2 == null ? "—" : s2.toFixed(1)}</b></div>
        </article>;
      })}</div>
    </> : <section className="panel emptyPage"><h2>WEEK 1 SCHEDULE PENDING</h2><p>The official 2026 matchups will appear here once they are entered in the commissioner dashboard.</p></section>}
  </PageShell>;
}
