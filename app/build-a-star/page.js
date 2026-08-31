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
];

function archetype(overall) {
  if (overall >= 98) return "Generational Talent";
  if (overall >= 95) return "MVP Quarterback";
  if (overall >= 92) return "All-Pro Quarterback";
  if (overall >= 88) return "Pro Bowl Quarterback";
  if (overall >= 84) return "Franchise Quarterback";
  if (overall >= 80) return "Quality Starter";
  return "Developmental Starter";
}

function initials(name) {
  return String(name || "QB").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

export default function BuildAStarPage() {
  const [session, setSession] = useState(null);
  const [managerTeam, setManagerTeam] = useState(null);
  const [teams, setTeams] = useState([]);
  const [week, setWeek] = useState(1);
  const [results, setResults] = useState({});
  const [leaderboard, setLeaderboard] = useState([]);
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
    setLeaderboard((entriesRes.data || []).map((entry) => ({ ...entry, team: byId[Number(entry.manager_team_id)] })));
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

  const completed = TRAITS.every(([key]) => results[key]);
  const overall = useMemo(() => {
    const values = TRAITS.map(([key]) => Number(results[key]?.rating)).filter(Number.isFinite);
    return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
  }, [results]);
  const title = archetype(overall);
  const existing = managerTeam ? leaderboard.find((entry) => Number(entry.manager_team_id) === Number(managerTeam.team_id)) : null;

  function spin(key) {
    if (spinning) return;
    setMessage("");
    setSpinning(key);
    window.setTimeout(() => {
      const source = QB_POOL[Math.floor(Math.random() * QB_POOL.length)];
      setResults((current) => ({ ...current, [key]: { player: source.name, rating: source.ratings[key] } }));
      setSpinning("");
    }, 520);
  }

  function spinNext() {
    const next = TRAITS.find(([key]) => !results[key]);
    if (next) spin(next[0]);
  }

  function reset() {
    if (spinning) return;
    setResults({});
    setMessage("");
  }

  async function saveBuild() {
    if (!supabase || !session?.user || !managerTeam || !completed) return;
    setSaving(true); setMessage("");
    const payload = {
      season: SEASON,
      week: Number(week),
      manager_team_id: Number(managerTeam.team_id),
      user_id: session.user.id,
      position: "QB",
      overall,
      archetype: title,
      traits: results,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("build_a_star_entries").upsert(payload, { onConflict: "season,week,manager_team_id,position" });
    if (error) setMessage(error.message);
    else {
      setMessage(`Week ${week} QB submitted to the league leaderboard.`);
      await loadPublic(week);
    }
    setSaving(false);
  }

  return (
    <PageShell title="BUILD-A-STAR" kicker="QB LAB · SPIN 9 TRAITS · BUILD A LEGEND">
      <div className={styles.layout}>
        <section className={`panel ${styles.game}`}>
          <div className={styles.topline}><span>WEEK {week} · QB EDITION</span><span>{Object.keys(results).length}/9 TRAITS</span></div>
          <div className={styles.stage}>
            <div className={styles.leftTraits}>
              {TRAITS.slice(0, 4).map(([key, label]) => <TraitCard key={key} traitKey={key} label={label} result={results[key]} spinning={spinning === key} onSpin={() => spin(key)} />)}
            </div>
            <div className={styles.playerWrap}>
              <div className={styles.player}><div className={styles.helmet}>DD</div><div className={styles.jersey}>12</div></div>
              <div className={styles.rating}><span>OVR</span><strong>{overall || "--"}</strong></div>
              <h2>{completed ? title : "Build Your Quarterback"}</h2>
            </div>
            <div className={styles.rightTraits}>
              {TRAITS.slice(4).map(([key, label]) => <TraitCard key={key} traitKey={key} label={label} result={results[key]} spinning={spinning === key} onSpin={() => spin(key)} />)}
            </div>
          </div>
          <div className={styles.actions}>
            <button className="primaryButton" onClick={spinNext} disabled={completed || Boolean(spinning)}>{spinning ? "SPINNING..." : completed ? "BUILD COMPLETE" : "SPIN NEXT TRAIT"}</button>
            <button className="secondaryButton" onClick={reset} disabled={Boolean(spinning)}>RESET BUILD</button>
          </div>
          {completed && <div className={styles.finalCard}><span>FINAL BUILD</span><strong>{overall} OVR</strong><b>{title}</b><p>Your QB combines nine randomly drawn elite traits. Submit it to see where you rank this week.</p></div>}
          <div className={styles.submitRow}>
            {!session ? <p>Sign in through Manager HQ or Weekly Pick 'Em to submit your build.</p> : !managerTeam ? <p>Your login is not linked to a franchise yet.</p> : <button className="primaryButton" onClick={saveBuild} disabled={!completed || saving}>{saving ? "SAVING..." : existing ? "UPDATE WEEKLY BUILD" : "SUBMIT TO LEADERBOARD"}</button>}
            {message ? <span>{message}</span> : null}
          </div>
        </section>

        <aside className={`panel ${styles.board}`}>
          <div className="panelTitle"><h3>WEEK {week} LEADERBOARD</h3><span>QB OVR</span></div>
          {loading ? <p>Loading league builds...</p> : leaderboard.length ? leaderboard.map((entry, index) => <div className={styles.boardRow} key={entry.id}><b>#{index + 1}</b><span className={styles.avatar}>{initials(entry.team?.manager || entry.team?.name)}</span><div><strong>{entry.team?.name || "Franchise"}</strong><small>{entry.team?.manager || "Manager"} · {entry.archetype}</small></div><em>{entry.overall}</em></div>) : <p className={styles.empty}>No Week {week} builds yet. Set the bar.</p>}
          <div className={styles.rules}><strong>HOW IT WORKS</strong><p>Spin once for each trait. The source quarterback supplies that trait's rating. Your final OVR is the average of all nine ratings. One saved QB per franchise each week.</p></div>
        </aside>
      </div>
    </PageShell>
  );
}

function TraitCard({ label, result, spinning, onSpin }) {
  return <button className={`${styles.trait} ${result ? styles.filled : ""}`} onClick={onSpin} disabled={Boolean(result) || spinning}><span>{label}</span>{spinning ? <strong>...</strong> : result ? <><strong>{result.rating}</strong><small>{result.player}</small></> : <><strong>SPIN</strong><small>Tap to draw</small></>}</button>;
}
