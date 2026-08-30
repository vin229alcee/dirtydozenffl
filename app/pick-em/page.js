"use client";

import { useEffect, useMemo, useState } from "react";
import PageShell from "../../components/PageShell";
import { getSupabase } from "../../lib/supabase";
import styles from "./page.module.css";

const supabase = getSupabase();
const SEASON = 2026;

function kickoffLabel(value) {
  if (!value) return "Kickoff TBD";
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "Kickoff TBD";
  }
}

function isLocked(game) {
  if (game.completed) return true;
  if (!game.kickoffAt) return false;
  return Date.now() >= new Date(game.kickoffAt).getTime();
}

export default function PickEmPage() {
  const [session, setSession] = useState(null);
  const [managerTeam, setManagerTeam] = useState(null);
  const [teams, setTeams] = useState([]);
  const [schedule, setSchedule] = useState({ currentWeek: 1, games: [] });
  const [entries, setEntries] = useState([]);
  const [myPicks, setMyPicks] = useState({});
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadPublic() {
    if (!supabase) return;
    const [scheduleRes, teamsRes, entriesRes] = await Promise.all([
      fetch("/api/pick-em", { cache: "no-store" }).then((r) => r.json()),
      supabase.from("teams").select("id,name,manager").order("id"),
      supabase.from("pick_em_entries").select("season,week,matchup_id,manager_team_id,picked_team_id").eq("season", SEASON),
    ]);
    setSchedule(scheduleRes || { currentWeek: 1, games: [] });
    setTeams(teamsRes.data || []);
    setEntries(entriesRes.data || []);
  }

  async function loadManager(activeSession) {
    if (!supabase || !activeSession?.user) {
      setManagerTeam(null);
      setMyPicks({});
      return;
    }
    const { data } = await supabase
      .from("manager_teams")
      .select("team_id,is_commissioner")
      .eq("user_id", activeSession.user.id)
      .maybeSingle();
    if (!data) {
      setManagerTeam(null);
      setMyPicks({});
      return;
    }
    const team = teams.find((t) => Number(t.id) === Number(data.team_id));
    setManagerTeam({ ...data, team });
  }

  useEffect(() => {
    let active = true;
    async function boot() {
      if (!supabase) {
        setLoading(false);
        setError("Pick 'Em is temporarily unavailable.");
        return;
      }
      await loadPublic();
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setSession(data.session || null);
      setLoading(false);
    }
    boot();
    const { data: listener } = supabase?.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession || null);
    }) || { data: null };
    return () => {
      active = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!loading) loadManager(session);
  }, [session, teams, loading]);

  useEffect(() => {
    if (!managerTeam) return;
    const week = Number(schedule.currentWeek || 1);
    const next = {};
    for (const entry of entries) {
      if (Number(entry.manager_team_id) === Number(managerTeam.team_id) && Number(entry.week) === week) {
        next[Number(entry.matchup_id)] = Number(entry.picked_team_id);
      }
    }
    setMyPicks(next);
  }, [entries, managerTeam, schedule.currentWeek]);

  const teamById = useMemo(() => Object.fromEntries(teams.map((team) => [Number(team.id), team])), [teams]);
  const currentGames = useMemo(
    () => schedule.games.filter((game) => Number(game.week) === Number(schedule.currentWeek)),
    [schedule]
  );
  const finalGames = useMemo(() => schedule.games.filter((game) => game.completed && game.winnerTeamId), [schedule.games]);
  const finalById = useMemo(() => Object.fromEntries(finalGames.map((game) => [Number(game.id), game])), [finalGames]);

  const leaderboard = useMemo(() => {
    const rows = new Map();
    for (const entry of entries) {
      const managerId = Number(entry.manager_team_id);
      const team = teamById[managerId];
      if (!rows.has(managerId)) rows.set(managerId, { managerId, team, correct: 0, wrong: 0, weekCorrect: 0, weekWrong: 0, finalized: [] });
      const row = rows.get(managerId);
      const game = finalById[Number(entry.matchup_id)];
      if (!game || Number(entry.season) !== SEASON) continue;
      const correct = Number(entry.picked_team_id) === Number(game.winnerTeamId);
      if (correct) row.correct += 1;
      else row.wrong += 1;
      if (Number(entry.week) === Number(schedule.currentWeek)) {
        if (correct) row.weekCorrect += 1;
        else row.weekWrong += 1;
      }
      row.finalized.push({ week: Number(entry.week), matchupId: Number(entry.matchup_id), correct });
    }
    return [...rows.values()]
      .map((row) => {
        row.finalized.sort((a, b) => a.week - b.week || a.matchupId - b.matchupId);
        let streak = 0;
        for (let i = row.finalized.length - 1; i >= 0; i -= 1) {
          if (!row.finalized[i].correct) break;
          streak += 1;
        }
        return { ...row, streak };
      })
      .sort((a, b) => b.correct - a.correct || a.wrong - b.wrong || b.streak - a.streak || String(a.team?.name || "").localeCompare(String(b.team?.name || "")));
  }, [entries, finalById, schedule.currentWeek, teamById]);

  const selectedCount = currentGames.filter((game) => myPicks[Number(game.id)]).length;
  const lockedCount = currentGames.filter(isLocked).length;

  async function signIn(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (authError) setError(authError.message);
    else {
      setEmail("");
      setPassword("");
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setManagerTeam(null);
    setMyPicks({});
  }

  function choose(game, teamId) {
    if (!managerTeam || isLocked(game)) return;
    setMessage("");
    setError("");
    setMyPicks((current) => ({ ...current, [Number(game.id)]: Number(teamId) }));
  }

  async function savePicks() {
    if (!managerTeam) return;
    setSaving(true);
    setMessage("");
    setError("");
    const rows = currentGames
      .filter((game) => !isLocked(game) && myPicks[Number(game.id)])
      .map((game) => ({
        season: SEASON,
        week: Number(schedule.currentWeek),
        matchup_id: Number(game.id),
        manager_team_id: Number(managerTeam.team_id),
        picked_team_id: Number(myPicks[Number(game.id)]),
        updated_at: new Date().toISOString(),
      }));

    if (!rows.length) {
      setSaving(false);
      setError("There are no unlocked picks to save.");
      return;
    }

    const { error: saveError } = await supabase
      .from("pick_em_entries")
      .upsert(rows, { onConflict: "season,week,matchup_id,manager_team_id" });

    if (saveError) {
      setError(saveError.message);
    } else {
      setMessage(`Saved ${rows.length} pick${rows.length === 1 ? "" : "s"} for Week ${schedule.currentWeek}.`);
      await loadPublic();
    }
    setSaving(false);
  }

  return (
    <PageShell title="WEEKLY PICK 'EM" kicker="CALL YOUR SHOT · EARN BRAGGING RIGHTS">
      <div className={styles.shell}>
        <section className={`panel ${styles.hero}`}>
          <div className={styles.heroCopy}>
            <span className="eyebrow">WEEK {schedule.currentWeek} · DIRTY DOZENS PICK 'EM</span>
            <h2>Pick every league matchup. Best record wins the week.</h2>
            <p>Choose who you think will win each Dirty Dozens matchup before kickoff. Results score automatically from ESPN, and the season leaderboard keeps a running record.</p>

            {!session ? (
              <form className={styles.loginRow} onSubmit={signIn}>
                <input aria-label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Manager email" required />
                <input aria-label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required />
                <button type="submit">Sign In to Pick</button>
              </form>
            ) : (
              <div className={styles.loginRow}>
                <div className={styles.status}>{managerTeam ? `Picking as ${managerTeam.team?.name || "your team"}` : "This account is not linked to a league team."}</div>
                <button type="button" className={styles.signOut} onClick={signOut}>Sign Out</button>
              </div>
            )}
            {message ? <div className={`${styles.status} ${styles.success}`}>{message}</div> : null}
            {error ? <div className={`${styles.status} ${styles.error}`}>{error}</div> : null}
          </div>

          <div className={styles.heroStats}>
            <div className={styles.heroStat}><span>WEEK</span><strong>{schedule.currentWeek}</strong></div>
            <div className={styles.heroStat}><span>MATCHUPS</span><strong>{currentGames.length}</strong></div>
            <div className={styles.heroStat}><span>YOUR PICKS</span><strong>{managerTeam ? `${selectedCount}/${currentGames.length}` : "—"}</strong></div>
            <div className={styles.heroStat}><span>LOCKED</span><strong>{lockedCount}</strong></div>
          </div>
        </section>

        <div className={styles.contentGrid}>
          <section>
            <div className={styles.sectionTitle}><h2>Week {schedule.currentWeek} Board</h2><span>PICKS LOCK AT KICKOFF</span></div>
            <div className={styles.games}>
              {loading ? <div className={`panel ${styles.empty}`}>Loading this week's board…</div> : currentGames.length ? currentGames.map((game) => {
                const locked = isLocked(game);
                const home = teamById[Number(game.home.id)] || { name: game.home.name, manager: "" };
                const away = teamById[Number(game.away.id)] || { name: game.away.name, manager: "" };
                const pick = myPicks[Number(game.id)];
                return (
                  <article className={styles.game} key={game.id}>
                    <div className={styles.gameHead}>
                      <span>{locked ? game.completed ? "FINAL" : "LOCKED" : kickoffLabel(game.kickoffAt)}</span>
                      <span>{pick ? `YOUR PICK: ${teamById[Number(pick)]?.name || (Number(pick) === Number(game.home.id) ? game.home.name : game.away.name)}` : "NO PICK YET"}</span>
                    </div>
                    <div className={styles.choices}>
                      <button type="button" disabled={!managerTeam || locked} onClick={() => choose(game, game.home.id)} className={`${styles.choice} ${Number(pick) === Number(game.home.id) ? styles.selected : ""}`}>
                        <span className={styles.teamName}>{home.name}</span>
                        <span className={styles.managerName}>{home.manager || "Manager"}</span>
                        {game.completed ? <span className={styles.score}>{Number(game.home.score || 0).toFixed(1)}</span> : null}
                      </button>
                      <div className={styles.versus}>VS</div>
                      <button type="button" disabled={!managerTeam || locked} onClick={() => choose(game, game.away.id)} className={`${styles.choice} ${Number(pick) === Number(game.away.id) ? styles.selected : ""}`}>
                        <span className={styles.teamName}>{away.name}</span>
                        <span className={styles.managerName}>{away.manager || "Manager"}</span>
                        {game.completed ? <span className={styles.score}>{Number(game.away.score || 0).toFixed(1)}</span> : null}
                      </button>
                    </div>
                  </article>
                );
              }) : <div className={`panel ${styles.empty}`}>ESPN has not posted this week's matchups yet.</div>}
            </div>
            {managerTeam ? (
              <div className={styles.pickFooter}>
                <p>{selectedCount} of {currentGames.length} selected · You can change any unlocked pick.</p>
                <button type="button" className={styles.saveButton} disabled={saving || !currentGames.some((game) => !isLocked(game) && myPicks[Number(game.id)])} onClick={savePicks}>{saving ? "Saving…" : "Save Picks"}</button>
              </div>
            ) : null}
          </section>

          <aside className="panel">
            <div className="panelTitle"><h3>SEASON LEADERBOARD</h3><span>{SEASON}</span></div>
            <div className={styles.leaderboard}>
              {leaderboard.length ? leaderboard.map((row, index) => (
                <div className={styles.leaderRow} key={row.managerId}>
                  <div className={styles.rank}>#{index + 1}</div>
                  <div className={styles.leaderTeam}>
                    <strong>{row.team?.name || `Team ${row.managerId}`}</strong>
                    <small>{row.team?.manager || "Manager"}{row.streak ? ` · 🔥 ${row.streak} straight` : ""}</small>
                  </div>
                  <div className={styles.leaderScore}>
                    <strong>{row.correct}-{row.wrong}</strong>
                    <small>W{schedule.currentWeek}: {row.weekCorrect}-{row.weekWrong}</small>
                  </div>
                </div>
              )) : <div className={styles.empty}>The leaderboard starts as soon as the first picks are scored.</div>}
            </div>
            <p className={styles.rules}>One point for every correct matchup winner. No confidence points, no spreads, no real money—just straight-up Dirty Dozens bragging rights.</p>
          </aside>
        </div>
      </div>
    </PageShell>
  );
}
