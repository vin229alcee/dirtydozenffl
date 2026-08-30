import Image from "next/image";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import PageShell from "../../../components/PageShell";
import { mascotForTeam } from "../../../lib/teamMascots";

export const dynamic = "force-dynamic";
const ESPN_LEAGUE_ID = "2145514194";
const CURRENT_SEASON = 2026;
const START_SEASON = 2022;
const MAP_RECORD = "__OWNER_MAP__";
const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const KNOWN_TITLE_COUNTS = { antoniosamilton: 1, lukeerbacher: 2, vinalcee: 1 };

function teamName(team) {
  if (!team) return "Team";
  if (team.name) return team.name;
  return [team.location, team.nickname].filter(Boolean).join(" ").trim() || team.abbrev || `Team ${team.id}`;
}

function headers() {
  const h = { accept: "application/json, text/plain, */*", "user-agent": "DirtyDozensFFL/1.0" };
  if (process.env.ESPN_S2 && process.env.ESPN_SWID) h.cookie = `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.ESPN_SWID}`;
  return h;
}

function rawOwner(team, members) {
  const member = members.get(team?.owners?.[0]);
  return member?.displayName || [member?.firstName, member?.lastName].filter(Boolean).join(" ") || "";
}

function readableOwner(value) {
  const clean = normalize(value);
  if (!clean) return false;
  if (/^espnfan\d+$/i.test(clean)) return false;
  if (/^[a-z]+\d{2,}$/i.test(clean)) return false;
  return true;
}

function pct(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

async function getLocal() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { teams: [], rankings: [], mappings: new Map(), profiles: new Map() };

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [{ data: teams }, { data: rankings }, { data: rows }, { data: profiles }] = await Promise.all([
    supabase.from("teams").select("*").order("id"),
    supabase.from("power_rankings").select("*").eq("season", CURRENT_SEASON).order("week", { ascending: false }).order("rank"),
    supabase.from("league_records").select("record_value,team_id").eq("record_name", MAP_RECORD),
    supabase.from("team_profiles").select("team_id,profile_image_path,manager_bio,franchise_bio,updated_at"),
  ]);

  const teamRows = teams || [];
  const byId = Object.fromEntries(teamRows.map((team) => [Number(team.id), team]));
  const mappings = new Map((rows || []).map((row) => {
    const team = byId[Number(row.team_id)];
    return [normalize(row.record_value), team ? { manager: team.manager || team.name, currentTeam: team.name || "" } : null];
  }).filter(([, value]) => value));

  const profileMap = new Map((profiles || []).map((profile) => {
    const imageUrl = profile.profile_image_path
      ? supabase.storage.from("manager-profiles").getPublicUrl(profile.profile_image_path).data.publicUrl
      : "";
    return [Number(profile.team_id), { ...profile, imageUrl }];
  }));

  return { teams: teamRows, rankings: rankings || [], mappings, profiles: profileMap };
}

async function fetchSeason(season) {
  const url = new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${ESPN_LEAGUE_ID}`);
  for (const view of ["mTeam", "mStandings", "mMatchupScore", "mStatus"]) url.searchParams.append("view", view);
  const response = await fetch(url, { headers: headers(), cache: "no-store" });
  if (!response.ok) throw new Error(`ESPN ${season}: ${response.status}`);
  return response.json();
}

async function getArchive() {
  const seasons = Array.from({ length: CURRENT_SEASON - START_SEASON + 1 }, (_, index) => START_SEASON + index);
  const rows = await Promise.all(seasons.map(async (season) => {
    try {
      return { season, data: await fetchSeason(season) };
    } catch {
      return null;
    }
  }));
  return rows.filter(Boolean);
}

function resolvedManager(team, members, mappings) {
  const raw = rawOwner(team, members);
  const mapped = mappings.get(normalize(raw));
  if (mapped) return mapped.manager;
  return readableOwner(raw) ? raw : "";
}

function autoRanks(teams, schedule, currentWeek) {
  const base = (teams || []).map((team) => {
    const overall = team?.record?.overall || {};
    const games = Number(overall.wins || 0) + Number(overall.losses || 0) + Number(overall.ties || 0);
    return {
      id: Number(team.id),
      wins: Number(overall.wins || 0),
      pointsFor: Number(overall.pointsFor || 0),
      winPct: games ? (Number(overall.wins || 0) + Number(overall.ties || 0) * 0.5) / games : 0,
      qualityWins: 0,
    };
  });
  const byId = Object.fromEntries(base.map((team) => [team.id, team]));
  for (const game of schedule || []) {
    if (!game?.home || !game?.away || Number(game.matchupPeriodId) >= currentWeek) continue;
    const home = byId[Number(game.home.teamId)];
    const away = byId[Number(game.away.teamId)];
    if (!home || !away) continue;
    const homeScore = Number(game.home.totalPoints || 0);
    const awayScore = Number(game.away.totalPoints || 0);
    if (homeScore > awayScore) home.qualityWins += away.winPct;
    else if (awayScore > homeScore) away.qualityWins += home.winPct;
  }
  const maxPF = Math.max(...base.map((team) => team.pointsFor), 1);
  const maxQuality = Math.max(...base.map((team) => team.qualityWins), 1);
  return base
    .map((team) => ({ ...team, score: team.winPct * 0.45 + (team.pointsFor / maxPF) * 0.4 + (team.qualityWins / maxQuality) * 0.15 }))
    .sort((a, b) => b.score - a.score || b.pointsFor - a.pointsFor || b.wins - a.wins)
    .map((team, index) => ({ ...team, rank: index + 1 }));
}

function buildAllTime(localTeam, archive, mappings) {
  const target = normalize(localTeam.manager);
  const games = [];
  const seasonRows = [];
  const titleYears = new Set();

  for (const { season, data } of archive) {
    const members = new Map((data?.members || []).map((member) => [member.id, member]));
    const teamsById = new Map();
    let mine = null;

    for (const team of data?.teams || []) {
      const manager = resolvedManager(team, members, mappings);
      const item = { team, manager, name: teamName(team) };
      teamsById.set(Number(team.id), item);
      if (manager && normalize(manager) === target) mine = item;
    }

    if (!mine) continue;
    if (Number(mine.team.rankCalculatedFinal) === 1) titleYears.add(season);

    const overall = mine.team?.record?.overall || {};
    const wins = Number(overall.wins || 0);
    const losses = Number(overall.losses || 0);
    const ties = Number(overall.ties || 0);
    const played = wins + losses + ties;
    seasonRows.push({
      season,
      wins,
      losses,
      ties,
      pf: Number(overall.pointsFor || 0),
      winPct: played ? (wins + ties * 0.5) / played : 0,
    });

    for (const game of data?.schedule || []) {
      if (!game?.home || !game?.away || !game.winner || game.winner === "UNDECIDED") continue;
      const homeId = Number(game.home.teamId);
      const awayId = Number(game.away.teamId);
      const myId = Number(mine.team.id);
      if (homeId !== myId && awayId !== myId) continue;

      const isHome = homeId === myId;
      const mySide = isHome ? game.home : game.away;
      const oppSide = isHome ? game.away : game.home;
      const opponent = teamsById.get(Number(oppSide.teamId));
      if (!opponent?.manager) continue;
      const myScore = Number(mySide.totalPoints);
      const oppScore = Number(oppSide.totalPoints);
      if (!Number.isFinite(myScore) || !Number.isFinite(oppScore)) continue;

      games.push({
        season,
        week: Number(game.matchupPeriodId || 0),
        opponent: opponent.manager,
        opponentTeam: opponent.name,
        myScore,
        oppScore,
        result: myScore > oppScore ? "W" : myScore < oppScore ? "L" : "T",
        margin: myScore - oppScore,
      });
    }
  }

  const wins = games.filter((game) => game.result === "W").length;
  const losses = games.filter((game) => game.result === "L").length;
  const ties = games.filter((game) => game.result === "T").length;
  const pf = games.reduce((sum, game) => sum + game.myScore, 0);
  const pa = games.reduce((sum, game) => sum + game.oppScore, 0);
  const high = games.length ? [...games].sort((a, b) => b.myScore - a.myScore)[0] : null;
  const biggest = games.filter((game) => game.result === "W").sort((a, b) => b.margin - a.margin)[0] || null;
  const bestSeason = seasonRows.length ? [...seasonRows].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins || b.pf - a.pf)[0] : null;

  const head = {};
  for (const game of games) {
    const key = normalize(game.opponent);
    if (!head[key]) head[key] = { opponent: game.opponent, w: 0, l: 0, t: 0, pf: 0, pa: 0, meetings: 0 };
    const row = head[key];
    row.meetings += 1;
    row.pf += game.myScore;
    row.pa += game.oppScore;
    if (game.result === "W") row.w += 1;
    else if (game.result === "L") row.l += 1;
    else row.t += 1;
  }

  return {
    games: games.sort((a, b) => b.season - a.season || b.week - a.week),
    opponents: Object.values(head).sort((a, b) => b.meetings - a.meetings || b.w - a.w),
    wins,
    losses,
    ties,
    pf,
    pa,
    high,
    biggest,
    bestSeason,
    seasons: seasonRows.sort((a, b) => b.season - a.season),
    espnTitles: titleYears.size,
  };
}

export default async function TeamProfile({ params }) {
  const { id } = await params;
  const local = await getLocal();
  const localTeam = local.teams.find((team) => String(team.id) === String(id));

  if (!localTeam) {
    return <PageShell title="TEAM PROFILE" kicker="FRANCHISE FILE"><section className="panel emptyPanel">This franchise could not be found. <Link href="/teams">Return to Teams</Link></section></PageShell>;
  }

  const profile = local.profiles.get(Number(localTeam.id)) || null;
  const archive = await getArchive();
  const allTime = buildAllTime(localTeam, archive, local.mappings);
  const knownTitles = KNOWN_TITLE_COUNTS[normalize(localTeam.manager)] || 0;
  const titles = Math.max(Number(localTeam.championships || 0), knownTitles, allTime.espnTitles);

  let current = {
    wins: Number(localTeam.wins || 0),
    losses: Number(localTeam.losses || 0),
    ties: 0,
    pf: Number(localTeam.points_for || 0),
    pa: Number(localTeam.points_against || 0),
    rank: null,
    week: 1,
  };

  const currentArchive = archive.find((row) => row.season === CURRENT_SEASON);
  if (currentArchive) {
    const data = currentArchive.data;
    const members = new Map((data?.members || []).map((member) => [member.id, member]));
    const team = (data?.teams || []).find((item) => normalize(resolvedManager(item, members, local.mappings)) === normalize(localTeam.manager))
      || (data?.teams || []).find((item) => normalize(teamName(item)) === normalize(localTeam.name));
    if (team) {
      const overall = team?.record?.overall || {};
      const week = Number(data?.status?.currentMatchupPeriod || 1);
      const auto = autoRanks(data?.teams || [], data?.schedule || [], week).find((row) => row.id === Number(team.id));
      const rows = local.rankings.filter((row) => Number(row.week) === week);
      const override = rows.length === 12 ? rows.find((row) => Number(row.team_id) === Number(localTeam.id)) : null;
      current = {
        wins: Number(overall.wins || 0),
        losses: Number(overall.losses || 0),
        ties: Number(overall.ties || 0),
        pf: Number(overall.pointsFor || 0),
        pa: Number(overall.pointsAgainst || 0),
        rank: Number(override?.rank || auto?.rank || 0) || null,
        week,
      };
    }
  }

  const allGames = allTime.wins + allTime.losses + allTime.ties;
  const allRecord = `${allTime.wins}-${allTime.losses}${allTime.ties ? `-${allTime.ties}` : ""}`;
  const currentRecord = `${current.wins}-${current.losses}${current.ties ? `-${current.ties}` : ""}`;
  const mascot = mascotForTeam(localTeam.name, localTeam.logo || "");
  const initials = String(localTeam.manager || "DD").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return <PageShell title={localTeam.name} kicker="FRANCHISE PROFILE">
    <section className="panel franchiseProfileHero">
      <div className="franchiseProfileVisuals">
        <div className="franchiseManagerPhoto">
          {profile?.imageUrl ? <img src={profile.imageUrl} alt={`${localTeam.manager} profile`} /> : <strong>{initials}</strong>}
        </div>
        <div className="franchiseMascotWrap">
          {mascot ? <Image src={mascot} alt={`${localTeam.name} mascot`} width={190} height={190} /> : null}
        </div>
      </div>
      <div className="franchiseProfileCopy">
        <span className="eyebrow">OWNER & FRANCHISE FILE</span>
        <h2>{localTeam.name}</h2>
        <p className="franchiseManagerName">Managed by <strong>{localTeam.manager}</strong></p>
        <div className="franchiseHeroBadges">
          <span>{current.rank ? `#${current.rank} POWER RANK` : "POWER RANK PENDING"}</span>
          <span>{currentRecord} CURRENT RECORD</span>
          <span>{titles} {titles === 1 ? "TITLE" : "TITLES"}</span>
        </div>
        {profile?.manager_bio ? <p className="franchiseHeroBio">{profile.manager_bio}</p> : <p className="franchiseHeroBio franchiseProfileEmpty">This manager has not added an About Me yet.</p>}
        <div className="franchiseHeroActions">
          <Link href="/teams" className="secondaryButton">← All Teams</Link>
          <Link href="/manager/profile" className="secondaryButton">Manager Profile Editor</Link>
        </div>
      </div>
    </section>

    <section className="franchiseStoryGrid">
      <article className="panel franchiseStoryCard">
        <div className="panelTitle"><h3>FRANCHISE STORY</h3><span>FROM THE OWNER</span></div>
        {profile?.franchise_bio ? <p>{profile.franchise_bio}</p> : <div className="emptyPanel">No franchise story has been added yet.</div>}
      </article>
      <article className="panel franchiseSnapshotCard">
        <div className="panelTitle"><h3>FRANCHISE SNAPSHOT</h3><span>{START_SEASON}–{CURRENT_SEASON}</span></div>
        <div className="franchiseSnapshotStats">
          <div><small>CAREER RECORD</small><strong>{allRecord}</strong></div>
          <div><small>WIN RATE</small><strong>{allGames ? pct((allTime.wins + allTime.ties * 0.5) / allGames) : "—"}</strong></div>
          <div><small>ALL-TIME PF</small><strong>{allTime.pf.toFixed(1)}</strong></div>
          <div><small>AVG SCORE</small><strong>{allGames ? (allTime.pf / allGames).toFixed(1) : "—"}</strong></div>
        </div>
      </article>
    </section>

    <div className="panelTitle franchiseSectionTitle"><h3>ALL-TIME FRANCHISE</h3><span>{allGames} COMPLETED GAMES</span></div>
    <div className="recordCards franchiseRecordCards">
      {[["CAREER RECORD", allRecord], ["WIN %", allGames ? pct((allTime.wins + allTime.ties * 0.5) / allGames) : "—"], ["ALL-TIME PF", allTime.pf.toFixed(1)], ["AVG SCORE", allGames ? (allTime.pf / allGames).toFixed(1) : "—"], ["TITLES", String(titles)], ["SEASONS", String(allTime.seasons.length)]].map(([label, value]) => <article className="panel recordCard" key={label}><h3>{label}</h3><strong>{value}</strong></article>)}
    </div>

    <div className="commissionerGrid franchiseDataGrid">
      <section className="panel">
        <div className="panelTitle"><h3>CURRENT SEASON</h3><span>{CURRENT_SEASON} · WEEK {current.week}</span></div>
        <div className="franchiseDataList">
          <div><small>RECORD</small><strong>{currentRecord}</strong></div>
          <div><small>POWER RANK</small><strong>{current.rank ? `#${current.rank}` : "—"}</strong></div>
          <div><small>POINTS FOR / AGAINST</small><strong>{current.pf.toFixed(1)} / {current.pa.toFixed(1)}</strong></div>
        </div>
      </section>

      <section className="panel">
        <div className="panelTitle"><h3>ALL-TIME HIGHS</h3><span>ESPN ARCHIVE</span></div>
        <div className="franchiseDataList">
          <div><small>HIGHEST SCORE</small><strong>{allTime.high ? allTime.high.myScore.toFixed(1) : "—"}</strong><p>{allTime.high ? `${allTime.high.season} Wk ${allTime.high.week} vs ${allTime.high.opponent}` : "No archived result"}</p></div>
          <div><small>BIGGEST WIN</small><strong>{allTime.biggest ? `+${allTime.biggest.margin.toFixed(1)}` : "—"}</strong><p>{allTime.biggest ? `${allTime.biggest.season} Wk ${allTime.biggest.week} vs ${allTime.biggest.opponent}` : "No archived win"}</p></div>
        </div>
      </section>
    </div>

    <div className="commissionerGrid franchiseDataGrid">
      <section className="panel">
        <div className="panelTitle"><h3>BEST SEASON</h3><span>BY WIN %</span></div>
        {allTime.bestSeason ? <div className="bestSeasonBlock"><strong>{allTime.bestSeason.season}</strong><p>{allTime.bestSeason.wins}-{allTime.bestSeason.losses}{allTime.bestSeason.ties ? `-${allTime.bestSeason.ties}` : ""} · {pct(allTime.bestSeason.winPct)} · {allTime.bestSeason.pf.toFixed(1)} PF</p></div> : <p>No season history available.</p>}
      </section>

      <section className="panel">
        <div className="panelTitle"><h3>RECENT RESULTS</h3><span>LATEST 5</span></div>
        {allTime.games.slice(0, 5).length ? <div className="franchiseRecentList">{allTime.games.slice(0, 5).map((game) => <div key={`${game.season}-${game.week}-${game.opponent}`}><b className={`resultChip result${game.result}`}>{game.result}</b><span>{game.season} Wk {game.week} · {game.opponent}</span><strong>{game.myScore.toFixed(1)}-{game.oppScore.toFixed(1)}</strong></div>)}</div> : <p>No completed archived games.</p>}
      </section>
    </div>

    <section className="panel franchiseHeadToHead">
      <div className="panelTitle"><h3>ALL-TIME HEAD-TO-HEAD</h3><span>BY MANAGER</span></div>
      {allTime.opponents.length ? <div className="franchiseHeadRows">{allTime.opponents.map((opponent) => <div key={normalize(opponent.opponent)}><div><strong>{opponent.opponent}</strong><small>{opponent.meetings} meetings · {opponent.pf.toFixed(1)} PF / {opponent.pa.toFixed(1)} PA</small></div><b>{opponent.w}-{opponent.l}{opponent.t ? `-${opponent.t}` : ""}</b></div>)}</div> : <div className="emptyPanel">Head-to-head history will appear here as archived matchups are available.</div>}
    </section>
  </PageShell>;
}
