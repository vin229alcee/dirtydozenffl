import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import Header from "../components/Header";
import { league, records, headlines } from "../data/league";

export const dynamic = "force-dynamic";

async function getLiveLeagueData() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { teams: [], matchups: [], highScores: [], news: [], dirtyPlayer: null, week: 1 };

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [teamsRes, matchupsRes, highRes, newsRes, dirtyRes] = await Promise.all([
    supabase.from("teams").select("*") ,
    supabase.from("matchups").select("*").eq("season", 2026).order("week", { ascending: false }).order("id"),
    supabase.from("weekly_high_scores").select("*").eq("season", 2026).order("week", { ascending: false }),
    supabase.from("league_news").select("id,title,body,published_at").order("published_at", { ascending: false }).limit(3),
    supabase.from("dirty_players").select("*").eq("season", 2026).order("week", { ascending: false }).limit(1),
  ]);

  const teams = teamsRes.data || [];
  const allMatchups = matchupsRes.data || [];
  const latestWeek = allMatchups.length ? Math.max(...allMatchups.map((m) => Number(m.week))) : 1;
  return {
    teams,
    matchups: allMatchups.filter((m) => Number(m.week) === latestWeek),
    highScores: highRes.data || [],
    news: newsRes.data || [],
    dirtyPlayer: dirtyRes.data?.[0] || null,
    week: latestWeek,
  };
}

export default async function Home() {
  const live = await getLiveLeagueData();
  const byId = Object.fromEntries(live.teams.map((t) => [t.id, t]));
  const standings = [...live.teams].sort((a, b) => Number(b.wins || 0) - Number(a.wins || 0) || Number(b.points_for || 0) - Number(a.points_for || 0) || String(a.name).localeCompare(String(b.name)));
  const homepageNews = live.news.length ? live.news.map((item) => ({ title: item.title, deck: item.body || "" })) : headlines;
  const dirtyTeam = live.dirtyPlayer ? byId[live.dirtyPlayer.team_id] : null;

  return <>
    <div className="topline">{league.tagline}</div>
    <Header />
    <main className="homeGrid pageWrap">
      <section className="pageHero homeHero">
        <div className="heroCopy"><span className="eyebrow">WELCOME TO</span><h1>DIRTY DOZENS <em>FFL</em></h1><p>{league.subtagline}</p><Link className="button" href="/teams">Meet the Dirty Dozen →</Link></div>
        <div className="heroMark">12</div>
      </section>

      <section className="panel championCard"><span className="eyebrow">DEFENDING CHAMPION</span><h2>{league.defendingChampion}</h2><strong>{league.defendingChampionManager}</strong><div className="belt">CHAMPION</div><p>{league.defendingChampionSeason} SEASON</p></section>

      <section className="panel matchupFeature">
        <div className="panelTitle"><h3>NEXT UP — WEEK {live.week}</h3></div>
        {live.matchups.length ? <div className="pendingState"><strong>{live.matchups.every((m) => m.completed) ? "RESULTS POSTED" : "MATCHUPS READY"}</strong><p>{live.matchups.length} matchups are loaded for Week {live.week}.</p></div> : <div className="pendingState"><strong>SCHEDULE PENDING</strong><p>Add the official ESPN matchups when they are set.</p></div>}
        <Link className="ghostButton" href="/matchups">View matchups</Link>
      </section>

      <section className="panel span2">
        <div className="panelTitle"><h3>WEEK {live.week} MATCHUPS</h3><Link href="/matchups">VIEW ALL</Link></div>
        {live.matchups.length ? <div className="scoreList">{live.matchups.map((m) => <div className="scoreRow" key={m.id}><strong>{byId[m.team1_id]?.name || "Team"}</strong><strong>{m.team1_score == null ? "—" : Number(m.team1_score).toFixed(1)}</strong><span>{m.completed ? "FINAL" : "SCHEDULED"}</span><strong>{m.team2_score == null ? "—" : Number(m.team2_score).toFixed(1)}</strong><strong>{byId[m.team2_id]?.name || "Team"}</strong></div>)}</div> : <div className="emptyPanel">Official Week 1 matchups have not been added yet.</div>}
      </section>

      <section className="panel span2 highScoreTracker">
        <div className="panelTitle"><h3>WEEKLY HIGH SCORE TRACKER</h3><span>2026 SEASON</span></div>
        {live.highScores.length ? <div className="scoreList">{live.highScores.map((entry) => <div className="scoreRow" key={entry.week}><strong>WEEK {entry.week}</strong><span>{byId[entry.team_id]?.name || "Team"}</span><strong>{Number(entry.score).toFixed(1)}</strong></div>)}</div> : <div className="emptyPanel">Week 1 high score will appear here after the official results are saved.</div>}
      </section>

      <section className="panel standingsPanel">
        <div className="panelTitle"><h3>STANDINGS</h3><Link href="/standings">FULL</Link></div>
        {standings.length ? <table><thead><tr><th>#</th><th>Team</th><th>W</th><th>L</th><th>PF</th></tr></thead><tbody>{standings.slice(0,8).map((t,i)=><tr key={t.id}><td>{i+1}</td><td>{t.name}</td><td>{t.wins ?? 0}</td><td>{t.losses ?? 0}</td><td>{Number(t.points_for || 0).toFixed(1)}</td></tr>)}</tbody></table> : <div className="emptyPanel">Standings will appear here once league data is available.</div>}
      </section>

      <section className="panel rankingsPanel"><div className="panelTitle"><h3>POWER RANKINGS</h3><Link href="/power-rankings">FULL</Link></div><div className="emptyPanel">Preseason rankings have not been published.</div></section>

      <section className="panel newsPanel"><div className="panelTitle"><h3>LEAGUE NEWS</h3><Link href="/news">VIEW ALL</Link></div>{homepageNews.map((h,i)=><article key={`${h.title}-${i}`}><span className="newsIndex">0{i+1}</span><div><h4>{h.title}</h4><p>{h.deck}</p></div></article>)}</section>

      <section className="panel recordsPanel"><div className="panelTitle"><h3>RECORD BOOK</h3><Link href="/records">VIEW ALL</Link></div>{records.map(([label,value])=><div className="recordRow" key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>

      <section className="panel dirtyPlayer">
        <span className="eyebrow">DIRTY PLAYER OF THE WEEK</span><div className="trashIcon">★</div>
        {live.dirtyPlayer ? <><h2>{live.dirtyPlayer.player_name}</h2><strong>{dirtyTeam?.name || "Dirty Dozens"} — WEEK {live.dirtyPlayer.week}</strong><p>{live.dirtyPlayer.reason || "Commissioner's choice."}</p></> : <><h2>COMING WEEK 1</h2><strong>WHO EARNS IT?</strong><p>The commissioner's weekly selection will be featured here.</p></>}
      </section>

      <section className="panel trashTalk"><div className="panelTitle"><h3>TRASH TALK FEED</h3></div><blockquote>“Receipts will be kept.”</blockquote><blockquote>“Twelve teams. One trophy.”</blockquote><blockquote>“Nobody is safe from the weekly recap.”</blockquote></section>
    </main>
    <footer><strong>DIRTY DOZENS <span>FFL</span></strong><small>{league.subtagline}</small></footer>
  </>;
}
