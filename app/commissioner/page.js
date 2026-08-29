'use client';

import { useEffect, useMemo, useState } from 'react';
import PageShell from '../../components/PageShell';
import { getSupabase } from '../../lib/supabase';

const supabase = getSupabase();
const blankMatchups = () => Array.from({ length: 6 }, () => ({ team1_id: '', team2_id: '', team1_score: '', team2_score: '' }));

export default function CommissionerPage() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [teams, setTeams] = useState([]);
  const [week, setWeek] = useState(1);
  const [matchups, setMatchups] = useState(blankMatchups());
  const [dirtyPlayer, setDirtyPlayer] = useState({ team_id: '', player_name: '', reason: '' });
  const [news, setNews] = useState({ title: '', body: '' });

  useEffect(() => {
    if (!supabase) { setStatus('Supabase is not configured yet.'); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.from('teams').select('*').order('id').then(({ data }) => setTeams(data || []));
  }, [session]);

  const scoreEntries = useMemo(() => matchups.flatMap((m) => [
    m.team1_id && m.team1_score !== '' ? { team_id: Number(m.team1_id), score: Number(m.team1_score) } : null,
    m.team2_id && m.team2_score !== '' ? { team_id: Number(m.team2_id), score: Number(m.team2_score) } : null,
  ]).filter(Boolean), [matchups]);

  function updateMatchup(i, field, value) {
    setMatchups((prev) => prev.map((m, idx) => idx === i ? { ...m, [field]: value } : m));
  }

  async function signIn(event) {
    event.preventDefault(); setStatus('Signing in…');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setStatus(error ? error.message : 'Signed in.');
  }

  async function recalculateStandings() {
    const { data: allMatchups, error: allError } = await supabase.from('matchups').select('*').eq('season', 2026).eq('completed', true);
    if (allError) throw allError;
    const standings = Object.fromEntries(teams.map((t) => [t.id, { wins: 0, losses: 0, points_for: 0, points_against: 0 }]));
    for (const m of allMatchups || []) {
      if (!standings[m.team1_id] || !standings[m.team2_id]) continue;
      standings[m.team1_id].points_for += Number(m.team1_score || 0); standings[m.team1_id].points_against += Number(m.team2_score || 0);
      standings[m.team2_id].points_for += Number(m.team2_score || 0); standings[m.team2_id].points_against += Number(m.team1_score || 0);
      if (Number(m.team1_score) > Number(m.team2_score)) { standings[m.team1_id].wins++; standings[m.team2_id].losses++; }
      else if (Number(m.team2_score) > Number(m.team1_score)) { standings[m.team2_id].wins++; standings[m.team1_id].losses++; }
    }
    for (const team of teams) {
      const s = standings[team.id];
      const { error } = await supabase.from('teams').update({ wins: s.wins, losses: s.losses, points_for: s.points_for, points_against: s.points_against }).eq('id', team.id);
      if (error) throw error;
    }
  }

  async function saveWeek() {
    setStatus('Saving Week ' + week + '…');
    const valid = matchups.filter((m) => m.team1_id && m.team2_id && m.team1_score !== '' && m.team2_score !== '');
    if (valid.length !== 6) return setStatus('Enter all 6 matchups and scores before saving.');
    const selected = valid.flatMap((m) => [m.team1_id, m.team2_id]);
    if (new Set(selected).size !== 12) return setStatus('Each team must appear exactly once in the week.');
    const rows = valid.map((m) => ({ season: 2026, week: Number(week), team1_id: Number(m.team1_id), team2_id: Number(m.team2_id), team1_score: Number(m.team1_score), team2_score: Number(m.team2_score), completed: true }));
    const { error: deleteError } = await supabase.from('matchups').delete().eq('season', 2026).eq('week', Number(week));
    if (deleteError) return setStatus(deleteError.message);
    const { error: matchupError } = await supabase.from('matchups').insert(rows);
    if (matchupError) return setStatus(matchupError.message);
    const high = [...scoreEntries].sort((a, b) => b.score - a.score)[0];
    if (high) {
      const { error: highError } = await supabase.from('weekly_high_scores').upsert({ season: 2026, week: Number(week), team_id: high.team_id, score: high.score }, { onConflict: 'season,week' });
      if (highError) return setStatus(highError.message);
    }
    try { await recalculateStandings(); } catch (error) { return setStatus(error.message); }
    setStatus('Week ' + week + ' saved. Standings and weekly high score updated.');
  }

  async function resetWeek() {
    if (!window.confirm(`Delete all saved Week ${week} results and recalculate standings?`)) return;
    setStatus('Resetting Week ' + week + '…');
    const { error: matchupError } = await supabase.from('matchups').delete().eq('season', 2026).eq('week', Number(week));
    if (matchupError) return setStatus(matchupError.message);
    const { error: highError } = await supabase.from('weekly_high_scores').delete().eq('season', 2026).eq('week', Number(week));
    if (highError) return setStatus(highError.message);
    const { error: dirtyError } = await supabase.from('dirty_players').delete().eq('season', 2026).eq('week', Number(week));
    if (dirtyError) return setStatus(dirtyError.message);
    try { await recalculateStandings(); } catch (error) { return setStatus(error.message); }
    setMatchups(blankMatchups());
    setDirtyPlayer({ team_id: '', player_name: '', reason: '' });
    setStatus('Week ' + week + ' reset. Matchups, high score, Dirty Player, and standings were cleared/recalculated.');
  }

  async function saveNews() {
    if (!news.title.trim()) return setStatus('Add a news headline first.');
    const { error } = await supabase.from('league_news').insert({ title: news.title.trim(), body: news.body.trim() });
    setStatus(error ? error.message : 'League news published.'); if (!error) setNews({ title: '', body: '' });
  }

  async function saveDirtyPlayer() {
    if (!dirtyPlayer.team_id || !dirtyPlayer.player_name.trim()) return setStatus('Choose a team and enter a player name.');
    const { error } = await supabase.from('dirty_players').upsert({ season: 2026, week: Number(week), team_id: Number(dirtyPlayer.team_id), player_name: dirtyPlayer.player_name.trim(), reason: dirtyPlayer.reason.trim() }, { onConflict: 'season,week' });
    setStatus(error ? error.message : 'Dirty Player of the Week saved.');
  }

  if (!supabase) return <PageShell title="Commissioner"><div className="panel"><p>Supabase configuration is missing.</p></div></PageShell>;
  if (!session) return <PageShell title="Commissioner"><section className="panel commissionerAuth"><div className="panelTitle"><h3>COMMISSIONER LOGIN</h3><span>SECURE ACCESS</span></div><form className="commissionerForm" onSubmit={signIn}><label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label><button className="primaryButton" type="submit">Sign In</button></form>{status && <p className="statusMessage">{status}</p>}</section></PageShell>;

  return <PageShell title="Commissioner">
    <div className="commissionerTopbar"><div><strong>Commissioner Control Room</strong><span>{session.user.email}</span></div><button className="secondaryButton" onClick={() => supabase.auth.signOut()}>Sign Out</button></div>
    <section className="panel commissionerPanel">
      <div className="panelTitle"><h3>WEEKLY RESULTS</h3><span>AUTO-UPDATES STANDINGS + HIGH SCORE</span></div>
      <label className="weekPicker">Week<input type="number" min="1" max="18" value={week} onChange={(e) => setWeek(e.target.value)} /></label>
      <div className="matchupEditor">{matchups.map((m, i) => <div className="matchupCard" key={i}>
        <div className="matchupNumber">MATCHUP {i + 1}</div>
        <div className="matchupTeamLine"><select value={m.team1_id} onChange={(e) => updateMatchup(i, 'team1_id', e.target.value)}><option value="">Choose Team</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select><input inputMode="decimal" placeholder="Score" value={m.team1_score} onChange={(e) => updateMatchup(i, 'team1_score', e.target.value)} /></div>
        <div className="matchupVs">VS</div>
        <div className="matchupTeamLine"><select value={m.team2_id} onChange={(e) => updateMatchup(i, 'team2_id', e.target.value)}><option value="">Choose Team</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select><input inputMode="decimal" placeholder="Score" value={m.team2_score} onChange={(e) => updateMatchup(i, 'team2_score', e.target.value)} /></div>
      </div>)}</div>
      <div style={{display:'grid',gap:'10px'}}><button className="primaryButton saveWeekButton" onClick={saveWeek}>Save Week {week}</button><button className="secondaryButton" onClick={resetWeek}>Reset Week {week}</button></div>
    </section>
    <section className="commissionerGrid">
      <div className="panel commissionerPanel"><div className="panelTitle"><h3>LEAGUE NEWS</h3><span>PUBLISH</span></div><div className="commissionerForm"><label>Headline<input value={news.title} onChange={(e) => setNews({ ...news, title: e.target.value })} /></label><label>Story<textarea rows="5" value={news.body} onChange={(e) => setNews({ ...news, body: e.target.value })} /></label><button className="primaryButton" onClick={saveNews}>Publish News</button></div></div>
      <div className="panel commissionerPanel"><div className="panelTitle"><h3>DIRTY PLAYER OF THE WEEK</h3><span>WEEK {week}</span></div><div className="commissionerForm"><label>Team<select value={dirtyPlayer.team_id} onChange={(e) => setDirtyPlayer({ ...dirtyPlayer, team_id: e.target.value })}><option value="">Choose team</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Player<input value={dirtyPlayer.player_name} onChange={(e) => setDirtyPlayer({ ...dirtyPlayer, player_name: e.target.value })} /></label><label>Why they were dirty<textarea rows="3" value={dirtyPlayer.reason} onChange={(e) => setDirtyPlayer({ ...dirtyPlayer, reason: e.target.value })} /></label><button className="primaryButton" onClick={saveDirtyPlayer}>Save Dirty Player</button></div></div>
    </section>
    {status && <div className="statusBar" onClick={() => setStatus('')}>{status}<span>×</span></div>}
  </PageShell>;
}
