"use client";

import { useEffect, useMemo, useState } from "react";
import PageShell from "../../components/PageShell";
import { getSupabase } from "../../lib/supabase";
import styles from "./page.module.css";

const supabase = getSupabase();
const SEASON = 2026;
const TRAITS = [
  ["processing", "Processing"],
  ["accuracy", "Accuracy / Touch"],
  ["arm", "Arm Talent"],
  ["legs", "Mobility"],
  ["vision", "Vision"],
  ["leadership", "Leadership"],
  ["playmaking", "Playmaking"],
  ["build", "Build / Toughness"],
  ["clutch", "Clutch"],
];

const QB_POOL = [
  { name: "Patrick Mahomes", ratings: { processing: 98, accuracy: 96, arm: 99, legs: 91, vision: 98, leadership: 97, playmaking: 100, build: 91, clutch: 100 } },
  { name: "Josh Allen", ratings: { processing: 94, accuracy: 94, arm: 100, legs: 98, vision: 94, leadership: 96, playmaking: 98, build: 99, clutch: 96 } },
  { name: "Lamar Jackson", ratings: { processing: 94, accuracy: 93, arm: 94, legs: 100, vision: 95, leadership: 95, playmaking: 100, build: 90, clutch: 94 } },
  { name: "Joe Burrow", ratings: { processing: 99, accuracy: 99, arm: 93, legs: 85, vision: 99, leadership: 98, playmaking: 95, build: 88, clutch: 99 } },
  { name: "Justin Herbert", ratings: { processing: 94, accuracy: 96, arm: 99, legs: 91, vision: 94, leadership: 93, playmaking: 95, build: 96, clutch: 94 } },
  { name: "Jalen Hurts", ratings: { processing: 91, accuracy: 92, arm: 93, legs: 97, vision: 91, leadership: 98, playmaking: 96, build: 98, clutch: 96 } },
  { name: "Jayden Daniels", ratings: { processing: 94, accuracy: 95, arm: 94, legs: 99, vision: 95, leadership: 95, playmaking: 98, build: 88, clutch: 97 } },
  { name: "Brock Purdy", ratings: { processing: 97, accuracy: 96, arm: 88, legs: 89, vision: 97, leadership: 94, playmaking: 94, build: 87, clutch: 95 } },
  { name: "Jordan Love", ratings: { processing: 92, accuracy: 93, arm: 97, legs: 90, vision: 92, leadership: 93, playmaking: 96, build: 91, clutch: 94 } },
  { name: "Dak Prescott", ratings: { processing: 95, accuracy: 96, arm: 94, legs: 86, vision: 95, leadership: 96, playmaking: 92, build: 94, clutch: 90 } },
  { name: "Matthew Stafford", ratings: { processing: 98, accuracy: 97, arm: 98, legs: 76, vision: 98, leadership: 95, playmaking: 95, build: 92, clutch: 98 } },
  { name: "Drake Maye", ratings: { processing: 91, accuracy: 93, arm: 97, legs: 95, vision: 92, leadership: 92, playmaking: 96, build: 94, clutch: 92 } },
  { name: "Kirk Cousins", ratings: { processing: 88, accuracy: 89, arm: 85, legs: 62, vision: 88, leadership: 89, playmaking: 77, build: 82, clutch: 78 } },
  { name: "Geno Smith", ratings: { processing: 85, accuracy: 86, arm: 88, legs: 76, vision: 84, leadership: 86, playmaking: 83, build: 84, clutch: 80 } },
  { name: "Gardner Minshew", ratings: { processing: 78, accuracy: 79, arm: 74, legs: 78, vision: 77, leadership: 84, playmaking: 80, build: 78, clutch: 80 } },
  { name: "Jacoby Brissett", ratings: { processing: 81, accuracy: 78, arm: 80, legs: 73, vision: 80, leadership: 87, playmaking: 75, build: 88, clutch: 77 } },
  { name: "Mac Jones", ratings: { processing: 76, accuracy: 79, arm: 72, legs: 65, vision: 75, leadership: 74, playmaking: 68, build: 73, clutch: 69 } },
  { name: "Kenny Pickett", ratings: { processing: 73, accuracy: 75, arm: 76, legs: 78, vision: 72, leadership: 78, playmaking: 74, build: 79, clutch: 73 } },
  { name: "Daniel Jones", ratings: { processing: 74, accuracy: 76, arm: 83, legs: 88, vision: 72, leadership: 79, playmaking: 79, build: 84, clutch: 69 } },
  { name: "Desmond Ridder", ratings: { processing: 68, accuracy: 70, arm: 78, legs: 84, vision: 66, leadership: 73, playmaking: 72, build: 82, clutch: 64 } },
  { name: "Zach Wilson", ratings: { processing: 64, accuracy: 69, arm: 91, legs: 84, vision: 63, leadership: 68, playmaking: 76, build: 78, clutch: 61 } },
  { name: "Mitchell Trubisky", ratings: { processing: 69, accuracy: 72, arm: 78, legs: 82, vision: 67, leadership: 76, playmaking: 73, build: 80, clutch: 66 } },
  { name: "Bailey Zappe", ratings: { processing: 66, accuracy: 70, arm: 69, legs: 64, vision: 65, leadership: 70, playmaking: 64, build: 72, clutch: 65 } },
  { name: "Nathan Peterman", ratings: { processing: 58, accuracy: 61, arm: 67, legs: 62, vision: 55, leadership: 66, playmaking: 58, build: 68, clutch: 48 } },
  { name: "Tim Boyle", ratings: { processing: 57, accuracy: 60, arm: 74, legs: 55, vision: 56, leadership: 65, playmaking: 55, build: 69, clutch: 52 } },
  { name: "P.J. Walker", ratings: { processing: 63, accuracy: 64, arm: 81, legs: 77, vision: 61, leadership: 70, playmaking: 70, build: 75, clutch: 60 } },
  { name: "Brett Rypien", ratings: { processing: 62, accuracy: 67, arm: 65, legs: 58, vision: 63, leadership: 69, playmaking: 59, build: 68, clutch: 58 } },
  { name: "Jeff Driskel", ratings: { processing: 61, accuracy: 63, arm: 76, legs: 86, vision: 59, leadership: 68, playmaking: 68, build: 81, clutch: 57 } },
];

function archetype(overall) {
  if (overall >= 98) return "Generational Talent";
  if (overall >= 95) return "MVP Quarterback";
  if (overall >= 92) return "All-Pro Quarterback";
  if (overall >= 88) return "Pro Bowl Quarterback";
  if (overall >= 84) return "Franchise Quarterback";
  if (overall >= 80) return "Quality Starter";
  if (overall >= 75) return "Bridge Starter";
  if (overall >= 70) return "Journeyman QB";
  if (overall >= 65) return "Backup Quarterback";
  if (overall >= 60) return "Roster Bubble";
  return "Historic Bust";
}

function initials(name) {
  return String(name || "QB").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function traitCount(entry) {
  return Object.keys(entry?.traits || {}).length;
}

export default function BuildAStarPage() {
  const [session, setSession] = useState(null);
  const [managerTeam, setManagerTeam] = useState(null);
  const [teams, setTeams] = useState([]);
  const [week, setWeek] = useState(1);
  const [results, setResults] = useState({});
  const [entries, setEntries] = useState([]);
  const [spinning, setSpinning] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadPublic(targetWeek = week) {
    if (!supabase) return;
    const [teamsRes, entriesRes] = await Promise.all([
      supabase.from("teams").select("id,name,manager").order("id"),
      supabase.from("build_a_star_entries").select("*").eq("season", SEASON).eq("week", Number(targetWeek)).eq("position", "QB").order("overall", { ascending: false }),
    ]);
    const nextTeams = teamsRes.data || [];
    setTeams(nextTeams);
    const byId = Object.fromEntries(nextTeams.map((team) => [Number(team.id), team]));
    setEntries((entriesRes.data || []).map((entry) => ({ ...entry, team: byId[Number(entry.manager_team_id)] })));
  }

  useEffect(() => {
    let alive = true;
    async function boot() {
      if (!supabase) { setLoading(false); return; }
      let currentWeek = 1;
      try {
        const schedule = await fetch("/api/pick-em", { cache: "no-store" }).then((r) => r.json());
        currentWeek = Number(schedule?.currentWeek || 1);
      } catch {}
      if (!alive) return;
      setWeek(currentWeek);
      await loadPublic(currentWeek);
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      setSession(data.session || null);
      setLoading(false);
    }
    boot();
    const { data: listener } = supabase?.auth.onAuthStateChange((_event, next) => setSession(next || null)) || { data: null };
    return () => { alive = false; listener?.subscription?.unsubscribe(); };
  }, []);

  useEffect(() => {
    async function resolveManager() {
      if (!supabase || !session?.user) { setManagerTeam(null); return; }
      const { data } = await supabase.from("manager_teams").select("team_id,is_commissioner").eq("user_id", session.user.id).maybeSingle();
      const team = teams.find((row) => Number(row.id) === Number(data?.team_id));
      setManagerTeam(data ? { ...data, team } : null);
    }
    resolveManager();
  }, [session, teams]);

  const existing = managerTeam ? entries.find((entry) => Number(entry.manager_team_id) === Number(managerTeam.team_id)) : null;
  const leaderboard = entries.filter((entry) => traitCount(entry) === TRAITS.length);

  useEffect(() => {
    if (existing?.traits) {
      setResults(existing.traits);
      if (traitCount(existing) >= TRAITS.length) setMessage(`Your Week ${week} build is permanently locked.`);
      else if (traitCount(existing) > 0) setMessage(`Week ${week} build restored. Your previous spins are locked.`);
    }
  }, [existing?.id, existing?.updated_at]);

  const completed = TRAITS.every(([key]) => results[key]);
  const locked = Boolean(existing && traitCount(existing) >= TRAITS.length);
  const overall = useMemo(() => {
    const values = TRAITS.map(([key]) => Number(results[key]?.rating)).filter(Number.isFinite);
    return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
  }, [results]);
  const title = archetype(overall);

  async function persistSpin(key, result) {
    if (!supabase || !session?.user || !managerTeam) throw new Error("Sign in with your manager account before spinning.");
    const nextTraits = { ...results, [key]: result };
    const nextCount = Object.keys(nextTraits).length;
    const values = TRAITS.map(([traitKey]) => Number(nextTraits[traitKey]?.rating)).filter(Number.isFinite);
    const nextOverall = nextCount === TRAITS.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
    const nextArchetype = nextCount === TRAITS.length ? archetype(nextOverall) : "IN PROGRESS";
    const now = new Date().toISOString();

    let response;
    if (existing?.id) {
      response = await supabase.from("build_a_star_entries").update({ traits: nextTraits, overall: nextOverall, archetype: nextArchetype, updated_at: now }).eq("id", existing.id);
    } else {
      response = await supabase.from("build_a_star_entries").insert({ season: SEASON, week: Number(week), manager_team_id: Number(managerTeam.team_id), user_id: session.user.id, position: "QB", traits: nextTraits, overall: nextOverall, archetype: nextArchetype, created_at: now, updated_at: now });
    }
    if (response.error) throw response.error;
    setResults(nextTraits);
    await loadPublic(week);
    if (nextCount === TRAITS.length) setMessage(`Week ${week} build complete and permanently locked.`);
  }

  function spin(key) {
    if (spinning || locked || results[key]) return;
    if (!session?.user || !managerTeam) {
      setMessage("Sign in with your manager account before spinning. Every spin is permanent.");
      return;
    }
    setMessage("");
    setSpinning(key);
    window.setTimeout(async () => {
      const source = QB_POOL[Math.floor(Math.random() * QB_POOL.length)];
      const result = { player: source.name, rating: source.ratings[key] };
      try {
        await persistSpin(key, result);
      } catch (error) {
        setMessage(error?.message || "That spin could not be saved. Try again.");
      } finally {
        setSpinning("");
      }
    }, 520);
  }

  function spinNext() {
    if (locked) return;
    const next = TRAITS.find(([key]) => !results[key]);
    if (next) spin(next[0]);
  }

  async function lockBuild() {
    if (!completed || locked) return;
    setSaving(true);
    await loadPublic(week);
    setMessage(`Week ${week} QB is already locked. Every trait was saved at the moment it was spun.`);
    setSaving(false);
  }

  return (
    <PageShell title="BUILD-A-STAR" kicker="QB LAB · ONE SHOT · NO REROLLS">
      <div className={styles.layout}>
        <section className={`panel ${styles.game}`}>
          <div className={styles.topline}><span>WEEK {week} · QB EDITION</span><span>{Object.keys(results).length}/9 TRAITS</span></div>
          <div className={styles.stage}>
            <div className={styles.leftTraits}>
              {TRAITS.slice(0, 4).map(([key, label]) => <TraitCard key={key} label={label} result={results[key]} spinning={spinning === key} locked={locked} onSpin={() => spin(key)} />)}
            </div>
            <div className={styles.playerWrap}>
              <div className={styles.player}><div className={styles.helmet}>DD</div><div className={styles.jersey}>12</div></div>
              <div className={styles.rating}><span>OVR</span><strong>{overall || "--"}</strong></div>
              <h2>{completed ? title : locked ? "Weekly Build Locked" : "Build Your Quarterback"}</h2>
            </div>
            <div className={styles.rightTraits}>
              {TRAITS.slice(4).map(([key, label]) => <TraitCard key={key} label={label} result={results[key]} spinning={spinning === key} locked={locked} onSpin={() => spin(key)} />)}
            </div>
          </div>
          <div className={styles.actions}>
            <button className="primaryButton" onClick={spinNext} disabled={locked || completed || Boolean(spinning)}>{locked ? "BUILD LOCKED" : spinning ? "SPINNING..." : completed ? "BUILD COMPLETE" : "SPIN NEXT TRAIT"}</button>
          </div>
          {completed && <div className={styles.finalCard}><span>FINAL BUILD</span><strong>{overall} OVR</strong><b>{title}</b><p>This is your official weekly QB. Every trait was locked the instant it was spun.</p></div>}
          <div className={styles.submitRow}>
            {!session ? <p>Sign in through Manager HQ or Weekly Pick 'Em before spinning.</p> : !managerTeam ? <p>Your login is not linked to a franchise yet.</p> : completed ? <button className="primaryButton" onClick={lockBuild} disabled={saving || locked}>{locked ? `WEEK ${week} BUILD LOCKED` : "CONFIRM BUILD"}</button> : <p>Each spin saves instantly. Closing or refreshing the page will not reset your build.</p>}
            {message ? <span>{message}</span> : null}
          </div>
        </section>

        <aside className={`panel ${styles.board}`}>
          <div className="panelTitle"><h3>WEEK {week} LEADERBOARD</h3><span>QB OVR</span></div>
          {loading ? <p>Loading league builds...</p> : leaderboard.length ? leaderboard.map((entry, index) => <div className={styles.boardRow} key={entry.id}><b>#{index + 1}</b><span className={styles.avatar}>{initials(entry.team?.manager || entry.team?.name)}</span><div><strong>{entry.team?.name || "Franchise"}</strong><small>{entry.team?.manager || "Manager"} · {entry.archetype}</small></div><em>{entry.overall}</em></div>) : <p className={styles.empty}>No completed Week {week} builds yet. Set the bar.</p>}
          <div className={styles.rules}><strong>HOW IT WORKS</strong><p>Each trait gets exactly one spin. Stars, starters, backups and disasters all live in the QB pool. Every result saves immediately, and previously spun traits cannot be changed, removed or rerolled.</p></div>
        </aside>
      </div>
    </PageShell>
  );
}

function TraitCard({ label, result, spinning, locked, onSpin }) {
  return <button className={`${styles.trait} ${result ? styles.filled : ""}`} onClick={onSpin} disabled={Boolean(result) || spinning || locked}><span>{label}</span>{spinning ? <strong>...</strong> : result ? <><strong>{result.rating}</strong><small>{result.player}</small></> : locked ? <><strong>LOCKED</strong><small>Weekly build complete</small></> : <><strong>SPIN</strong><small>One chance only</small></>}</button>;
}
