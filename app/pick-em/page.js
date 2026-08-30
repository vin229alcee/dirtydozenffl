"use client";

import { useEffect, useMemo, useState } from "react";
import { track } from "@vercel/analytics";
import PageShell from "../../components/PageShell";
import { getSupabase } from "../../lib/supabase";
import styles from "./page.module.css";

const supabase = getSupabase();
const SEASON = 2026;
const CHALLENGE_TYPES = [
  ["bullseye", "Bullseye", "Predict your own team's final score. Closest prediction wins."],
  ["highest_score", "Crystal Ball", "Predict the week's highest-scoring team."],
  ["lowest_score", "Cold Take", "Predict the week's lowest-scoring team."],
  ["game_of_week", "Game of the Week", "Pick the winner of one featured matchup."],
  ["upset_alert", "Upset Alert", "Predict YES or NO on a selected underdog winning."],
];

function kickoffLabel(value) {
  if (!value) return "Kickoff TBD";
  try {
    return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
  } catch {
    return "Kickoff TBD";
  }
}

function isLocked(game) {
  if (game.completed) return true;
  if (!game.kickoffAt) return false;
  return Date.now() >= new Date(game.kickoffAt).getTime();
}

function projectionLabel(value) {
  return value == null || !Number.isFinite(Number(value)) ? null : `Proj ${Number(value).toFixed(1)}`;
}

function emptyChallengeForm(week = 1) {
  return { week, title: "", description: "", challenge_type: "bullseye", points: 3, lock_at: "", team1_id: "", team2_id: "", underdog_team_id: "", opponent_team_id: "" };
}

export default function PickEmPage() {
  const [session, setSession] = useState(null);
  const [managerTeam, setManagerTeam] = useState(null);
  const [teams, setTeams] = useState([]);
  const [schedule, setSchedule] = useState({ currentWeek: 1, games: [] });
  const [entries, setEntries] = useState([]);
  const [myPicks, setMyPicks] = useState({});
  const [challenge, setChallenge] = useState(null);
  const [challengeEntry, setChallengeEntry] = useState(null);
  const [challengeAnswer, setChallengeAnswer] = useState("");
  const [challengeSaving, setChallengeSaving] = useState(false);
  const [challengeForm, setChallengeForm] = useState(emptyChallengeForm());
  const [challengeMessage, setChallengeMessage] = useState("");
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
    const nextSchedule = scheduleRes || { currentWeek: 1, games: [] };
    setSchedule(nextSchedule);
    setTeams(teamsRes.data || []);
    setEntries(entriesRes.data || []);
    await loadChallenge(Number(nextSchedule.currentWeek || 1));
  }

  async function loadChallenge(week) {
    if (!supabase) return;
    const { data } = await supabase.from("commissioner_challenges").select("*").eq("season", SEASON).eq("week", week).maybeSingle();
    setChallenge(data || null);
    if (!data) {
      setChallengeForm(emptyChallengeForm(week));
      setChallengeEntry(null);
      setChallengeAnswer("");
      return;
    }
    const cfg = data.config || {};
    setChallengeForm({
      week: data.week,
      title: data.title || "",
      description: data.description || "",
      challenge_type: data.challenge_type || "bullseye",
      points: Number(data.points || 3),
      lock_at: data.lock_at ? new Date(data.lock_at).toISOString().slice(0, 16) : "",
      team1_id: String(cfg.team1_id || ""),
      team2_id: String(cfg.team2_id || ""),
      underdog_team_id: String(cfg.underdog_team_id || ""),
      opponent_team_id: String(cfg.opponent_team_id || ""),
    });
  }

  async function loadManager(activeSession) {
    if (!supabase || !activeSession?.user) {
      setManagerTeam(null);
      setMyPicks({});
      setChallengeEntry(null);
      setChallengeAnswer("");
      return;
    }
    const { data } = await supabase.from("manager_teams").select("team_id,is_commissioner").eq("user_id", activeSession.user.id).maybeSingle();
    if (!data) {
      setManagerTeam(null);
      setMyPicks({});
      return;
    }
    const team = teams.find((t) => Number(t.id) === Number(data.team_id));
    setManagerTeam({ ...data, team });
    if (challenge?.id) {
      const { data: existing } = await supabase.from("commissioner_challenge_entries").select("*").eq("challenge_id", challenge.id).eq("user_id", activeSession.user.id).maybeSingle();
      setChallengeEntry(existing || null);
      setChallengeAnswer(existing?.answer || "");
    }
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
    return () => { active = false; listener?.subscription?.unsubscribe(); };
  }, []);

  useEffect(() => { if (!loading) loadManager(session); }, [session, teams, loading, challenge?.id]);

  useEffect(() => {
    if (!managerTeam) return;
    const week = Number(schedule.currentWeek || 1);
    const next = {};
    for (const entry of entries) {
      if (Number(entry.manager_team_id) === Number(managerTeam.team_id) && Number(entry.week) === week) next[Number(entry.matchup_id)] = Number(entry.picked_team_id);
    }
    setMyPicks(next);
  }, [entries, managerTeam, schedule.currentWeek]);

  const teamById = useMemo(() => Object.fromEntries(teams.map((team) => [Number(team.id), team])), [teams]);
  const currentGames = useMemo(() => schedule.games.filter((game) => Number(game.week) === Number(schedule.currentWeek)), [schedule]);
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
      if (correct) row.correct += 1; else row.wrong += 1;
      if (Number(entry.week) === Number(schedule.currentWeek)) { if (correct) row.weekCorrect += 1; else row.weekWrong += 1; }
      row.finalized.push({ week: Number(entry.week), matchupId: Number(entry.matchup_id), correct });
    }
    return [...rows.values()].map((row) => {
      row.finalized.sort((a, b) => a.week - b.week || a.matchupId - b.matchupId);
      let streak = 0;
      for (let i = row.finalized.length - 1; i >= 0; i -= 1) { if (!row.finalized[i].correct) break; streak += 1; }
      return { ...row, streak };
    }).sort((a, b) => b.correct - a.correct || a.wrong - b.wrong || b.streak - a.streak || String(a.team?.name || "").localeCompare(String(b.team?.name || "")));
  }, [entries, finalById, schedule.currentWeek, teamById]);

  const selectedCount = currentGames.filter((game) => myPicks[Number(game.id)]).length;
  const lockedCount = currentGames.filter(isLocked).length;
  const challengeLocked = challenge ? challenge.status !== "open" || (challenge.lock_at && Date.now() >= new Date(challenge.lock_at).getTime()) : true;

  async function signIn(event) {
    event.preventDefault(); setError(""); setMessage("");
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (authError) setError(authError.message); else { setEmail(""); setPassword(""); }
  }

  async function signOut() { await supabase.auth.signOut(); setManagerTeam(null); setMyPicks({}); }
  function choose(game, teamId) { if (!managerTeam || isLocked(game)) return; setMessage(""); setError(""); setMyPicks((current) => ({ ...current, [Number(game.id)]: Number(teamId) })); }

  async function savePicks() {
    if (!managerTeam) return;
    setSaving(true); setMessage(""); setError("");
    const rows = currentGames.filter((game) => !isLocked(game) && myPicks[Number(game.id)]).map((game) => ({ season: SEASON, week: Number(schedule.currentWeek), matchup_id: Number(game.id), manager_team_id: Number(managerTeam.team_id), picked_team_id: Number(myPicks[Number(game.id)]), updated_at: new Date().toISOString() }));
    if (!rows.length) { setSaving(false); setError("There are no unlocked picks to save."); return; }
    const { error: saveError } = await supabase.from("pick_em_entries").upsert(rows, { onConflict: "season,week,matchup_id,manager_team_id" });
    if (saveError) setError(saveError.message);
    else {
      track("Pick Em Submitted", { season: SEASON, week: Number(schedule.currentWeek), picksSaved: rows.length, boardSize: currentGames.length, completeBoard: selectedCount === currentGames.length });
      setMessage(`Saved ${rows.length} pick${rows.length === 1 ? "" : "s"} for Week ${schedule.currentWeek}.`);
      await loadPublic();
    }
    setSaving(false);
  }

  async function saveChallengeEntry() {
    if (!managerTeam || !session?.user || !challenge || challengeLocked || !challengeAnswer.trim()) return;
    setChallengeSaving(true); setChallengeMessage("");
    const now = new Date().toISOString();
    let result;
    if (challengeEntry?.id) {
      result = await supabase.from("commissioner_challenge_entries").update({ answer: challengeAnswer.trim(), updated_at: now }).eq("id", challengeEntry.id);
    } else {
      result = await supabase.from("commissioner_challenge_entries").insert({ challenge_id: challenge.id, manager_team_id: Number(managerTeam.team_id), user_id: session.user.id, answer: challengeAnswer.trim(), created_at: now, updated_at: now });
    }
    if (result.error) setChallengeMessage(result.error.message);
    else {
      setChallengeMessage("Challenge answer saved.");
      await loadManager(session);
    }
    setChallengeSaving(false);
  }

  function setChallengeField(key, value) { setChallengeForm((current) => ({ ...current, [key]: value })); }

  async function publishChallenge() {
    if (!managerTeam?.is_commissioner || !session?.user) return;
    if (!challengeForm.title.trim()) return setChallengeMessage("Add a challenge title.");
    if (challengeForm.challenge_type === "game_of_week" && (!challengeForm.team1_id || !challengeForm.team2_id || challengeForm.team1_id === challengeForm.team2_id)) return setChallengeMessage("Choose two different teams for Game of the Week.");
    if (challengeForm.challenge_type === "upset_alert" && (!challengeForm.underdog_team_id || !challengeForm.opponent_team_id || challengeForm.underdog_team_id === challengeForm.opponent_team_id)) return setChallengeMessage("Choose the underdog and its opponent.");
    const config = challengeForm.challenge_type === "game_of_week" ? { team1_id: Number(challengeForm.team1_id), team2_id: Number(challengeForm.team2_id) } : challengeForm.challenge_type === "upset_alert" ? { underdog_team_id: Number(challengeForm.underdog_team_id), opponent_team_id: Number(challengeForm.opponent_team_id) } : {};
    const payload = { season: SEASON, week: Number(schedule.currentWeek), title: challengeForm.title.trim(), description: challengeForm.description.trim(), challenge_type: challengeForm.challenge_type, points: Number(challengeForm.points), status: "open", lock_at: challengeForm.lock_at ? new Date(challengeForm.lock_at).toISOString() : null, config, created_by: session.user.id, scored_at: null };
    const { error: publishError } = await supabase.from("commissioner_challenges").upsert(payload, { onConflict: "season,week" });
    setChallengeMessage(publishError ? publishError.message : `Week ${schedule.currentWeek} challenge published.`);
    if (!publishError) await loadChallenge(Number(schedule.currentWeek));
  }

  function challengeInput() {
    if (!challenge) return null;
    const cfg = challenge.config || {};
    if (challenge.challenge_type === "bullseye") return <input inputMode="decimal" value={challengeAnswer} onChange={(e) => setChallengeAnswer(e.target.value)} placeholder="Your team's final score" disabled={challengeLocked} />;
    if (challenge.challenge_type === "highest_score" || challenge.challenge_type === "lowest_score") return <select value={challengeAnswer} onChange={(e) => setChallengeAnswer(e.target.value)} disabled={challengeLocked}><option value="">Choose team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>;
    if (challenge.challenge_type === "game_of_week") return <select value={challengeAnswer} onChange={(e) => setChallengeAnswer(e.target.value)} disabled={challengeLocked}><option value="">Choose winner</option>{[cfg.team1_id, cfg.team2_id].filter(Boolean).map((id) => <option key={id} value={id}>{teamById[Number(id)]?.name || `Team ${id}`}</option>)}</select>;
    if (challenge.challenge_type === "upset_alert") return <select value={challengeAnswer} onChange={(e) => setChallengeAnswer(e.target.value)} disabled={challengeLocked}><option value="">Choose answer</option><option value="yes">YES</option><option value="no">NO</option></select>;
    return null;
  }

  return (
    <PageShell title="WEEKLY PICK 'EM" kicker="CALL YOUR SHOT · EARN BRAGGING RIGHTS">
      <div className={styles.shell}>
        <section className={`panel ${styles.hero}`}>
          <div className={styles.heroCopy}>
            <span className="eyebrow">WEEK {schedule.currentWeek} · DIRTY DOZENS PICK 'EM</span>
            <h2>Pick every league matchup. Best record wins the week.</h2>
            <p>Choose each matchup winner before kickoff, then take the weekly commissioner challenge below. ESPN projections and final results score automatically.</p>
            {!session ? <form className={styles.loginRow} onSubmit={signIn}><input aria-label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Manager email" required /><input aria-label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required /><button type="submit">Sign In to Pick</button></form> : <div className={styles.loginRow}><div className={styles.status}>{managerTeam ? `Picking as ${managerTeam.team?.name || "your team"}` : "This account is not linked to a league team."}</div><button type="button" className={styles.signOut} onClick={signOut}>Sign Out</button></div>}
            {message ? <div className={`${styles.status} ${styles.success}`}>{message}</div> : null}
            {error ? <div className={`${styles.status} ${styles.error}`}>{error}</div> : null}
          </div>
          <div className={styles.heroStats}><div className={styles.heroStat}><span>WEEK</span><strong>{schedule.currentWeek}</strong></div><div className={styles.heroStat}><span>MATCHUPS</span><strong>{currentGames.length}</strong></div><div className={styles.heroStat}><span>YOUR PICKS</span><strong>{managerTeam ? `${selectedCount}/${currentGames.length}` : "—"}</strong></div><div className={styles.heroStat}><span>LOCKED</span><strong>{lockedCount}</strong></div></div>
        </section>

        <div className={styles.contentGrid}>
          <section>
            <div className={styles.sectionTitle}><h2>Week {schedule.currentWeek} Board</h2><span>PICKS LOCK AT KICKOFF</span></div>
            <div className={styles.games}>
              {loading ? <div className={`panel ${styles.empty}`}>Loading this week's board…</div> : currentGames.length ? currentGames.map((game) => {
                const locked = isLocked(game), home = teamById[Number(game.home.id)] || { name: game.home.name, manager: "" }, away = teamById[Number(game.away.id)] || { name: game.away.name, manager: "" }, pick = myPicks[Number(game.id)], homeProjection = projectionLabel(game.home.projectedScore), awayProjection = projectionLabel(game.away.projectedScore);
                return <article className={styles.game} key={game.id}><div className={styles.gameHead}><span>{locked ? game.completed ? "FINAL" : "LOCKED" : kickoffLabel(game.kickoffAt)}</span><span>{pick ? `YOUR PICK: ${teamById[Number(pick)]?.name || (Number(pick) === Number(game.home.id) ? game.home.name : game.away.name)}` : "NO PICK YET"}</span></div><div className={styles.choices}><button type="button" disabled={!managerTeam || locked} onClick={() => choose(game, game.home.id)} className={`${styles.choice} ${Number(pick) === Number(game.home.id) ? styles.selected : ""}`}><span className={styles.teamName}>{home.name}</span><span className={styles.managerName}>{home.manager || "Manager"}</span>{homeProjection ? <span className={styles.projection}>{homeProjection}</span> : null}{game.completed ? <span className={styles.score}>Final {Number(game.home.score || 0).toFixed(1)}</span> : null}</button><div className={styles.versus}>VS</div><button type="button" disabled={!managerTeam || locked} onClick={() => choose(game, game.away.id)} className={`${styles.choice} ${Number(pick) === Number(game.away.id) ? styles.selected : ""}`}><span className={styles.teamName}>{away.name}</span><span className={styles.managerName}>{away.manager || "Manager"}</span>{awayProjection ? <span className={styles.projection}>{awayProjection}</span> : null}{game.completed ? <span className={styles.score}>Final {Number(game.away.score || 0).toFixed(1)}</span> : null}</button></div></article>;
              }) : <div className={`panel ${styles.empty}`}>ESPN has not posted this week's matchups yet.</div>}
            </div>
            {managerTeam ? <div className={styles.pickFooter}><p>{selectedCount} of {currentGames.length} selected · You can change any unlocked pick.</p><button type="button" className={styles.saveButton} disabled={saving || !currentGames.some((game) => !isLocked(game) && myPicks[Number(game.id)])} onClick={savePicks}>{saving ? "Saving…" : "Save Picks"}</button></div> : null}
          </section>

          <aside className="panel"><div className="panelTitle"><h3>SEASON LEADERBOARD</h3><span>{SEASON}</span></div><div className={styles.leaderboard}>{leaderboard.length ? leaderboard.map((row, index) => <div className={styles.leaderRow} key={row.managerId}><div className={styles.rank}>#{index + 1}</div><div className={styles.leaderTeam}><strong>{row.team?.name || `Team ${row.managerId}`}</strong><small>{row.team?.manager || "Manager"}{row.streak ? ` · 🔥 ${row.streak} straight` : ""}</small></div><div className={styles.leaderScore}><strong>{row.correct}-{row.wrong}</strong><small>W{schedule.currentWeek}: {row.weekCorrect}-{row.weekWrong}</small></div></div>) : <div className={styles.empty}>The leaderboard starts as soon as the first picks are scored.</div>}</div><p className={styles.rules}>One point for every correct matchup winner. No confidence points, no spreads, no real money—just straight-up Dirty Dozens bragging rights.</p></aside>
        </div>

        <section className="panel" style={{ marginTop: 20 }}>
          <div className="panelTitle"><h3>WEEKLY COMMISSIONER CHALLENGE</h3><span>{challenge ? `${Number(challenge.points).toFixed(0)} DRAFT RACE PTS` : `WEEK ${schedule.currentWeek}`}</span></div>
          {challenge ? <><span className="eyebrow">{challenge.status.toUpperCase()} · {challenge.challenge_type.replaceAll("_", " ")}</span><h2 style={{ margin: "8px 0" }}>{challenge.title}</h2>{challenge.description ? <p>{challenge.description}</p> : null}{managerTeam ? <div className="commissionerForm" style={{ marginTop: 14 }}><label>Your answer{challengeInput()}</label><button type="button" className="primaryButton" disabled={challengeSaving || challengeLocked || !challengeAnswer.trim()} onClick={saveChallengeEntry}>{challengeSaving ? "Saving…" : challengeEntry ? "Update Challenge Answer" : "Save Challenge Answer"}</button>{challengeLocked ? <small>Challenge entries are locked.</small> : null}{challengeMessage ? <small>{challengeMessage}</small> : null}</div> : <p>Sign in above to enter this challenge.</p>}</> : <div className={styles.empty}>The commissioner has not posted a Week {schedule.currentWeek} challenge yet.</div>}
        </section>

        {managerTeam?.is_commissioner ? <section className="panel" style={{ marginTop: 20 }}><div className="panelTitle"><h3>COMMISSIONER CHALLENGE CREATOR</h3><span>COMMISSIONER ONLY</span></div><p style={{ opacity: .75 }}>Create or update this week's challenge here. Results are scored automatically after all six league matchups are final.</p><div className="commissionerForm"><label>Challenge type<select value={challengeForm.challenge_type} onChange={(e) => setChallengeField("challenge_type", e.target.value)}>{CHALLENGE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><small>{CHALLENGE_TYPES.find(([value]) => value === challengeForm.challenge_type)?.[2]}</small><label>Title<input value={challengeForm.title} maxLength={80} onChange={(e) => setChallengeField("title", e.target.value)} placeholder={`Week ${schedule.currentWeek} · Bullseye`} /></label><label>Description<textarea rows={3} value={challengeForm.description} onChange={(e) => setChallengeField("description", e.target.value)} /></label><label>Draft Race points<select value={challengeForm.points} onChange={(e) => setChallengeField("points", e.target.value)}>{[1,2,3,4,5].map((n) => <option key={n} value={n}>{n} points</option>)}</select></label><label>Lock time<input type="datetime-local" value={challengeForm.lock_at} onChange={(e) => setChallengeField("lock_at", e.target.value)} /></label>{challengeForm.challenge_type === "game_of_week" ? <div className="commissionerGrid"><label>Team 1<select value={challengeForm.team1_id} onChange={(e) => setChallengeField("team1_id", e.target.value)}><option value="">Choose team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label>Team 2<select value={challengeForm.team2_id} onChange={(e) => setChallengeField("team2_id", e.target.value)}><option value="">Choose team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label></div> : null}{challengeForm.challenge_type === "upset_alert" ? <div className="commissionerGrid"><label>Underdog team<select value={challengeForm.underdog_team_id} onChange={(e) => setChallengeField("underdog_team_id", e.target.value)}><option value="">Choose underdog</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label>Opponent<select value={challengeForm.opponent_team_id} onChange={(e) => setChallengeField("opponent_team_id", e.target.value)}><option value="">Choose opponent</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label></div> : null}<button type="button" className="primaryButton" onClick={publishChallenge}>{challenge ? "Update Week Challenge" : "Publish Week Challenge"}</button>{challengeMessage ? <small>{challengeMessage}</small> : null}</div></section> : null}
      </div>
    </PageShell>
  );
}
