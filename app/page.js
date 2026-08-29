import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import Header from "../components/Header";
import { league, records, headlines } from "../data/league";

export const dynamic = "force-dynamic";

const ESPN_LEAGUE_ID = "2145514194";
const SEASON = 2026;
const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function espnTeamName(team) {
  if (!team) return "Unknown Team";
  if (team.name) return team.name;
  return [team.location, team.nickname].filter(Boolean).join(" ").trim() || team.abbrev || `ESPN Team ${team.id}`;
}

async function getEspnMatchups() {
  const url = new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leagues/${ESPN_LEAGUE_ID}`);
  url.searchParams.append("view", "mTeam");
  url.searchParams.append("view", "mMatchupScore");

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
  const week = Number(data?.status?.currentMatchupPeriod || 1);
  const teamById = new Map((data?.teams || []).map((team) => [Number(team.id), team]));
  const games = (data?.schedule || []).filter((game) => Number(game.matchupPeriodId) === week && game.home && game.away);

  return {
    week,
    matchups: games.map((game) => ({
      id: `espn-${game.id}`,
      team1_name: espnTeamName(teamById.get(Number(game.home.teamId))),
      team2_name: espnTeamName(teamById.get(Number(game.away.teamId))),
      team1_score: game.home.totalPoints == null ? null : Number(game.home.totalPoints),
      team2_score: game.away.totalPoints == null ? null : Number(game.away.totalPoints),
      completed: Boolean(game.winner && game.winner !== "UNDECIDED"),
    })),
  };
}

async function getLiveLeagueData() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { teams: [], matchups: [], highScores: [], news: [], dirtyPlayer: null, week: 1, matchupSource: "SAVED RESULTS" };

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [teamsRes, matchupsRes, highRes, newsRes, dirtyRes] = await Promise.all([
    supabase.from("teams").select("*"),
    supabase.from("matchups").select("*").eq("season", SEASON).order("week", { ascending: false }).order("id"),
    supabase.from("weekly_high_scores").select("*").eq("season", SEASON).order("week", { ascending: false }),
    supabase.from("league_news").select("id,title,body,published_at").order("published_at", { ascending: false }).limit(3),
    supabase.from("dirty_players").select("*").eq("season", SEASON).order("week", { ascending: false }).limit(1),
  ]);

  const teams = teamsRes.data || [];
  const allMatchups = matchupsRes.data || [];
  const savedWeek = allMatchups.length ? Math.max(...allMatchups.map((m) => Number(m.week))) : 1;
  const byId = Object.fromEntries(teams.map((t) => [t.id, t]));

  let week = savedWeek;
  let matchupSource = "SAVED RESULTS";
  let matchups = allMatchups.filter((m) => Number(m.week) === savedWeek).map((m) => ({
    ...m,
    team1_name: byId[m.team1_id]?.name || "Team",
    team2_name: byId[m.team2_id]?.name || "Team",
  }));

  try {
    const espn = await getEspnMatchups();
    if (espn.matchups.length) {
      week = espn.week;
      matchups = espn.matchups;
      matchupSource = "ESPN LIVE";
    }
  } catch {
    // Keep saved Supabase matchup data as a fallback.
  }

  return {
    teams,
    matchups,
    highScores: highRes.data || [],
    news: newsRes.data || [],
    dirtyPlayer: dirtyRes.data?.[0] || null,
    week,
    matchupSource,
  };
}

export default async function Home() {
  const live = await getLiveLeagueData();
  const byId = Object.fromEntries(live.teams.map((t) => [t.id, t]));
  const byName = Object.fromEntries(live.teams.map((t) => [normalize(t.name), t]));
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
        <div className="panelTitle"><h3>WEEK {live.week}</h3><span>{live.matchupSource}</span></div>
        {live.matchups.length ? <div className="pendingState"><strong>{live.matchups.every((m) => m.completed) ? "RESULTS POSTED" : "LIVE MATCHUPS"}</strong><p>{live.matchups.length} matchups are updating from ESPN for Week {live.week}.</p></div> : <div className="pendingState"><strong>SCHEDULE PENDING</strong><p>The official ESPN matchups will appear automatically.</p></div>}
        <Link className="ghostButton" href="/matchups">View matchups</Link>
      </section>

      <section className="panel span2 matchupPanel">
        <div className="panelTitle"><h3>WEEK {live.week} MATCHUPS</h3><span>{live.matchupSource}</span><Link href="/matchups">VIEW ALL</Link></div>
        {live.matchups.length ? <div className="matchupList">{live.matchups.map((m) => {
          const team1 = m.team1_name ? byName[normalize(m.team1_name)] : byId[m.team1_id];
          const team2 = m.team2_name ? byName[normalize(m.team2_name)] : byId[m.team2_id];
          const team1Name = m.team1_name || team1?.name || "Team";
          const team2Name = m.team2_name || team2?.name || "Team";
          const score1 = m.team1_score == null ? null : Number(m.team1_score);
          const score2 = m.team2_score == null ? null : Number(m.team2_score);
          return <article className="homeMatchup" key={m.id}>
            <div className={`homeMatchupTeam ${score1 != null && score2 != null && score1 > score2 ? "winner" : ""}`}><span>{team1Name}</span><strong>{score1 == null ? "—" : score1.toFixed(1)}</strong></div>
            <div className="homeMatchupStatus">{m.completed ? "FINAL" : live.matchupSource === "ESPN LIVE" ? "LIVE / SCHEDULED" : "SCHEDULED"}</div>
            <div className={`homeMatchupTeam ${score1 != null && score2 != null && score2 > score1 ? "winner" : ""}`}><span>{team2Name}</span><strong>{score2 == null ? "—" : score2.toFixed(1)}</strong></div>
          </article>;
        })}</div> : <div className="emptyPanel">Official Week {live.week} matchups have not been added yet.</div>}
      </section>

      <section className="panel span2 highScoreTracker">
        <div className="panelTitle"><h3>WEEKLY HIGH SCORE</h3><span>2026 SEASON</span></div>
        {live.highScores.length ? <div className="highScoreList">{live.highScores.map((entry) => <div className="highScoreItem" key={entry.week}><span>WEEK {entry.week}</span><strong>{byId[entry.team_id]?.name || "Team"}</strong><b>{Number(entry.score).toFixed(1)}</b></div>)}</div> : <div className="emptyPanel">Week 1 high score will appear here after the official results are saved.</div>}
      </section>

      <section className="panel standingsPanel">
        <div className="panelTitle"><h3>STANDINGS</h3><Link href="/standings">FULL</Link></div>
        {standings.length ? <div className="standingsScroll"><table><thead><tr><th>#</th><th>Team</th><th>W</th><th>L</th><th>PF</th></tr></thead><tbody>{standings.slice(0,8).map((t,i)=><tr key={t.id}><td>{i+1}</td><td>{t.name}</td><td>{t.wins ?? 0}</td><td>{t.losses ?? 0}</td><td>{Number(t.points_for || 0).toFixed(1)}</td></tr>)}</tbody></table></div> : <div className="emptyPanel">Standings will appear here once league data is available.</div>}
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
