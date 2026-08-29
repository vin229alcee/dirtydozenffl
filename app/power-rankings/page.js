import { createClient } from "@supabase/supabase-js";
import PageShell from "../../components/PageShell";

export const dynamic = "force-dynamic";

async function getRankings() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { teams: [], rankings: [], week: null };
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [{ data: teams }, { data: rows }] = await Promise.all([
    supabase.from("teams").select("id,name,manager,logo").order("id"),
    supabase.from("power_rankings").select("*").eq("season", 2026).order("week", { ascending: false }).order("rank"),
  ]);
  const week = rows?.length ? Math.max(...rows.map(r => Number(r.week))) : null;
  return { teams: teams || [], rankings: week ? (rows || []).filter(r => Number(r.week) === week).sort((a,b) => a.rank-b.rank) : [], week };
}

export default async function Rankings() {
  const { teams, rankings, week } = await getRankings();
  const byId = Object.fromEntries(teams.map(t => [t.id, t]));
  return <PageShell title="POWER RANKINGS" kicker="COMMISSIONER'S BOARD">
    {rankings.length ? <><div className="weekSummary"><div><span>WEEK</span><strong>{week}</strong></div><b>OFFICIAL RANKINGS</b></div><div className="rankingCards">{rankings.map(r => { const t=byId[r.team_id]; return <article className="panel rankCard" key={r.id}><b className="rankNumber">#{r.rank}</b><div><h2>{t?.name || 'Team'}</h2><p>{t?.manager || ''}</p>{r.commentary && <p className="rankComment">{r.commentary}</p>}</div></article>})}</div></> : <section className="panel emptyPage"><h2>PRESEASON RANKINGS PENDING</h2><p>The first official Dirty Dozens ranking has not been published yet.</p></section>}
  </PageShell>;
}
