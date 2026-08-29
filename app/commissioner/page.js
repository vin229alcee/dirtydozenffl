'use client';

import { useEffect, useMemo, useState } from 'react';
import PageShell from '../../components/PageShell';
import { getSupabase } from '../../lib/supabase';

const supabase = getSupabase();
const blankMatchups = () => Array.from({ length: 6 }, () => ({ team1_id: '', team2_id: '', team1_score: '', team2_score: '' }));
const blankRankings = () => Array.from({ length: 12 }, () => ({ team_id: '', commentary: '' }));
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export default function CommissionerPage() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [teams, setTeams] = useState([]);
  const [week, setWeek] = useState(1);
  const [weekLoading, setWeekLoading] = useState(false);
  const [existingWeek, setExistingWeek] = useState(false);
  const [existingRankings, setExistingRankings] = useState(false);
  const [matchups, setMatchups] = useState(blankMatchups());
  const [rankings, setRankings] = useState(blankRankings());
  const [dirtyPlayer, setDirtyPlayer] = useState({ team_id: '', player_name: '', reason: '' });
  const [news, setNews] = useState({ title: '', body: '' });
  const [newsItems, setNewsItems] = useState([]);
  const [editingNewsId, setEditingNewsId] = useState(null);
  const [record, setRecord] = useState({ record_name: '', record_value: '', team_id: '', season: '', week: '' });
  const [champion, setChampion] = useState({ season: '', team_id: '' });
  const [espnLeagueId, setEspnLeagueId] = useState('');
  const [espnLoading, setEspnLoading] = useState(false);
  const [espnPreview, setEspnPreview] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) return;
    supabase.from('teams').select('*').order('id').then(({ data }) => setTeams(data || []));
    loadNews();
    const savedLeagueId = window.localStorage.getItem('dirty-dozens-espn-league-id');
    if (savedLeagueId) setEspnLeagueId(savedLeagueId);
  }, [session]);

  useEffect(() => {
    if (!supabase || !session) return;
    loadWeek(Number(week));
  }, [session, week]);

  async function loadWeek(selectedWeek) {
    setWeekLoading(true);
    const [{ data: savedMatchups }, { data: savedRankings }, { data: dirty }] = await Promise.all([
      supabase.from('matchups').select('*').eq('season', 2026).eq('week', selectedWeek).order('id'),
      supabase.from('power_rankings').select('*').eq('season', 2026).eq('week', selectedWeek).order('rank'),
      supabase.from('dirty_players').select('*').eq('season', 2026).eq('week', selectedWeek).maybeSingle(),
    ]);
    const hasMatchups = (savedMatchups || []).length === 6;
    const hasRankings = (savedRankings || []).length === 12;
    setExistingWeek(hasMatchups);
    setExistingRankings(hasRankings);
    setMatchups(hasMatchups ? savedMatchups.map(m => ({ team1_id: String(m.team1_id), team2_id: String(m.team2_id), team1_score: m.team1_score == null ? '' : String(m.team1_score), team2_score: m.team2_score == null ? '' : String(m.team2_score) })) : blankMatchups());
    setRankings(hasRankings ? savedRankings.map(r => ({ team_id: String(r.team_id), commentary: r.commentary || '' })) : blankRankings());
    setDirtyPlayer(dirty ? { team_id: String(dirty.team_id), player_name: dirty.player_name || '', reason: dirty.reason || '' } : { team_id: '', player_name: '', reason: '' });
    setWeekLoading(false);
  }

  async function loadNews() {
    const { data } = await supabase.from('league_news').select('*').order('published_at', { ascending: false }).limit(12);
    setNewsItems(data || []);
  }

  const scoreEntries = useMemo(() => matchups.flatMap(m => [
    m.team1_id && m.team1_score !== '' ? { team_id: Number(m.team1_id), score: Number(m.team1_score) } : null,
    m.team2_id && m.team2_score !== '' ? { team_id: Number(m.team2_id), score: Number(m.team2_score) } : null,
  ]).filter(Boolean), [matchups]);

  function updateMatchup(i, field, value) { setMatchups(prev => prev.map((m, x) => x === i ? { ...m, [field]: value } : m)); }
  function updateRanking(i, field, value) { setRankings(prev => prev.map((r, x) => x === i ? { ...r, [field]: value } : r)); }

  async function signIn(e) {
    e.preventDefault(); setStatus('Signing in…');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setStatus(error ? error.message : 'Signed in.');
  }

  async function previewEspnImport() {
    if (!/^\d+$/.test(espnLeagueId.trim())) return setStatus('Enter the numeric ESPN league ID first.');
    setEspnLoading(true); setEspnPreview(null); setStatus(`Checking ESPN Week ${week}…`);
    window.localStorage.setItem('dirty-dozens-espn-league-id', espnLeagueId.trim());
    try {
      const response = await fetch(`/api/espn/import?leagueId=${encodeURIComponent(espnLeagueId.trim())}&season=2026&week=${Number(week)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) { setStatus(data.error || 'ESPN import failed.'); setEspnPreview(data); return; }
      setEspnPreview(data);
      setStatus(data.matchups?.length ? `ESPN Week ${week} loaded. Review before applying.` : `ESPN returned no Week ${week} matchups yet.`);
    } catch (error) { setStatus(`ESPN import failed: ${error.message}`); }
    finally { setEspnLoading(false); }
  }

  function applyEspnPreview() {
    const games = espnPreview?.matchups || [];
    if (games.length !== 6) return setStatus(`ESPN returned ${games.length} matchup${games.length === 1 ? '' : 's'}; expected 6.`);
    const findLocal = espnTeam => teams.find(team => normalize(team.name) === normalize(espnTeam.name));
    const mapped = games.map(game => {
      const home = findLocal(game.home), away = findLocal(game.away);
      return home && away ? { team1_id: String(home.id), team2_id: String(away.id), team1_score: game.home.score == null ? '' : String(game.home.score), team2_score: game.away.score == null ? '' : String(game.away.score) } : null;
    });
    if (mapped.some(item => !item)) {
      const missing = [...new Set(games.flatMap(game => [game.home, game.away]).filter(team => !findLocal(team)).map(team => team.name))];
      return setStatus(`ESPN loaded, but these team names need mapping: ${missing.join(', ')}`);
    }
    setMatchups(mapped); setStatus(`ESPN Week ${week} copied into the editor. Review the scores, then tap Save Week ${week}.`);
  }

  async function recalculateStandings() {
    const { data: all, error } = await supabase.from('matchups').select('*').eq('season', 2026).eq('completed', true);
    if (error) throw error;
    const standings = Object.fromEntries(teams.map(t => [t.id, { wins: 0, losses: 0, points_for: 0, points_against: 0 }]));
    for (const m of all || []) {
      if (!standings[m.team1_id] || !standings[m.team2_id]) continue;
      const s1 = Number(m.team1_score || 0), s2 = Number(m.team2_score || 0);
      standings[m.team1_id].points_for += s1; standings[m.team1_id].points_against += s2;
      standings[m.team2_id].points_for += s2; standings[m.team2_id].points_against += s1;
      if (s1 > s2) { standings[m.team1_id].wins++; standings[m.team2_id].losses++; }
      else if (s2 > s1) { standings[m.team2_id].wins++; standings[m.team1_id].losses++; }
    }
    for (const team of teams) {
      const { error: updateError } = await supabase.from('teams').update(standings[team.id]).eq('id', team.id);
      if (updateError) throw updateError;
    }
  }

  async function saveWeek() {
    const valid = matchups.filter(m => m.team1_id && m.team2_id && m.team1_score !== '' && m.team2_score !== '');
    if (valid.length !== 6 || new Set(valid.flatMap(m => [m.team1_id, m.team2_id])).size !== 12) return setStatus('Enter all 6 matchups with each team exactly once.');
    if (existingWeek && !window.confirm(`Week ${week} already has saved results. Replace them with these scores?`)) return;
    setStatus(`Saving Week ${week}…`);
    let { error } = await supabase.from('matchups').delete().eq('season', 2026).eq('week', Number(week));
    if (error) return setStatus(error.message);
    ({ error } = await supabase.from('matchups').insert(valid.map(m => ({ season: 2026, week: Number(week), team1_id: Number(m.team1_id), team2_id: Number(m.team2_id), team1_score: Number(m.team1_score), team2_score: Number(m.team2_score), completed: true }))));
    if (error) return setStatus(error.message);
    const high = [...scoreEntries].sort((a, b) => b.score - a.score)[0];
    if (high) {
      ({ error } = await supabase.from('weekly_high_scores').upsert({ season: 2026, week: Number(week), team_id: high.team_id, score: high.score }, { onConflict: 'season,week' }));
      if (error) return setStatus(error.message);
    }
    try { await recalculateStandings(); } catch (e) { return setStatus(e.message); }
    setExistingWeek(true); setStatus(`Week ${week} saved. Standings and high score updated.`);
  }

  async function resetWeek() {
    if (!window.confirm(`Delete all saved Week ${week} results and recalculate standings?`)) return;
    setStatus(`Resetting Week ${week}…`);
    for (const table of ['matchups', 'weekly_high_scores', 'dirty_players']) {
      const { error } = await supabase.from(table).delete().eq('season', 2026).eq('week', Number(week));
      if (error) return setStatus(error.message);
    }
    try { await recalculateStandings(); } catch (e) { return setStatus(e.message); }
    setMatchups(blankMatchups()); setDirtyPlayer({ team_id: '', player_name: '', reason: '' }); setExistingWeek(false); setStatus(`Week ${week} reset.`);
  }

  async function saveRankings() {
    const filled = rankings.filter(r => r.team_id);
    if (filled.length !== 12 || new Set(filled.map(r => r.team_id)).size !== 12) return setStatus('Rank all 12 teams exactly once.');
    if (existingRankings && !window.confirm(`Week ${week} rankings already exist. Replace them?`)) return;
    setStatus(`Publishing Week ${week} rankings…`);
    let { error } = await supabase.from('power_rankings').delete().eq('season', 2026).eq('week', Number(week));
    if (!error) ({ error } = await supabase.from('power_rankings').insert(filled.map((r, i) => ({ season: 2026, week: Number(week), rank: i + 1, team_id: Number(r.team_id), commentary: r.commentary.trim() }))));
    if (!error) setExistingRankings(true);
    setStatus(error ? error.message : `Week ${week} power rankings published.`);
  }

  async function clearRankings() {
    if (!window.confirm(`Clear all Week ${week} power rankings?`)) return;
    const { error } = await supabase.from('power_rankings').delete().eq('season', 2026).eq('week', Number(week));
    if (!error) { setRankings(blankRankings()); setExistingRankings(false); }
    setStatus(error ? error.message : `Week ${week} rankings cleared.`);
  }

  async function saveNews() {
    if (!news.title.trim()) return setStatus('Add a headline first.');
    let error;
    if (editingNewsId) ({ error } = await supabase.from('league_news').update({ title: news.title.trim(), body: news.body.trim() }).eq('id', editingNewsId));
    else ({ error } = await supabase.from('league_news').insert({ title: news.title.trim(), body: news.body.trim() }));
    if (!error) { setNews({ title: '', body: '' }); setEditingNewsId(null); await loadNews(); }
    setStatus(error ? error.message : editingNewsId ? 'League news updated.' : 'League news published.');
  }

  function editNews(item) { setEditingNewsId(item.id); setNews({ title: item.title || '', body: item.body || '' }); }
  function cancelNewsEdit() { setEditingNewsId(null); setNews({ title: '', body: '' }); }
  async function deleteNews(id) {
    if (!window.confirm('Delete this league news post?')) return;
    const { error } = await supabase.from('league_news').delete().eq('id', id);
    if (!error) { if (editingNewsId === id) cancelNewsEdit(); await loadNews(); }
    setStatus(error ? error.message : 'League news deleted.');
  }

  async function saveDirtyPlayer() {
    if (!dirtyPlayer.team_id || !dirtyPlayer.player_name.trim()) return setStatus('Choose a team and enter a player name.');
    const { error } = await supabase.from('dirty_players').upsert({ season: 2026, week: Number(week), team_id: Number(dirtyPlayer.team_id), player_name: dirtyPlayer.player_name.trim(), reason: dirtyPlayer.reason.trim() }, { onConflict: 'season,week' });
    setStatus(error ? error.message : 'Dirty Player of the Week saved.');
  }

  async function saveRecord() {
    if (!record.record_name.trim() || !record.record_value.trim()) return setStatus('Record name and value are required.');
    const { error } = await supabase.from('league_records').insert({ record_name: record.record_name.trim(), record_value: record.record_value.trim(), team_id: record.team_id ? Number(record.team_id) : null, season: record.season ? Number(record.season) : null, week: record.week ? Number(record.week) : null });
    if (!error) setRecord({ record_name: '', record_value: '', team_id: '', season: '', week: '' });
    setStatus(error ? error.message : 'Historical record added.');
  }

  async function saveChampion() {
    if (!champion.season || !champion.team_id) return setStatus('Choose a season and champion.');
    const season = Number(champion.season);
    if (season < 1900 || season > 2100) return setStatus('Enter a valid championship season.');
    let { error } = await supabase.from('champions').upsert({ season, team_id: Number(champion.team_id) }, { onConflict: 'season' });
    if (error) return setStatus(error.message);
    const { data: history, error: historyError } = await supabase.from('champions').select('team_id');
    if (historyError) return setStatus(historyError.message);
    const counts = {}; for (const row of history || []) counts[row.team_id] = (counts[row.team_id] || 0) + 1;
    for (const team of teams) {
      const { error: updateError } = await supabase.from('teams').update({ championships: counts[team.id] || 0 }).eq('id', team.id);
      if (updateError) return setStatus(updateError.message);
    }
    setTeams(prev => prev.map(team => ({ ...team, championships: counts[team.id] || 0 })));
    setChampion({ season: '', team_id: '' }); setStatus(`${season} champion saved. Team title counts updated.`);
  }

  if (!supabase) return <PageShell title="Commissioner"><section className="panel"><p>Supabase configuration is missing.</p></section></PageShell>;
  if (!session) return <PageShell title="Commissioner"><section className="panel commissionerAuth"><div className="panelTitle"><h3>COMMISSIONER LOGIN</h3><span>SECURE ACCESS</span></div><form className="commissionerForm" onSubmit={signIn}><label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label><label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label><button className="primaryButton">Sign In</button></form>{status && <p>{status}</p>}</section></PageShell>;

  const options = <><option value="">Choose Team</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</>;

  return <PageShell title="Commissioner">
    <div className="commissionerTopbar"><div><strong>Commissioner Control Room</strong><div style={{ color: '#8e98a3', fontSize: 12 }}>Weekly data loads automatically when you change weeks.</div></div><button className="secondaryButton" onClick={() => supabase.auth.signOut()}>Sign Out</button></div>

    <section className="panel commissionerPanel"><div className="panelTitle"><h3>ESPN IMPORT</h3><span>WEEK {week}</span></div><div className="commissionerForm"><label>ESPN League ID<input inputMode="numeric" placeholder="Numeric league ID" value={espnLeagueId} onChange={e => setEspnLeagueId(e.target.value)} /></label><button className="primaryButton" onClick={previewEspnImport} disabled={espnLoading}>{espnLoading ? 'Checking ESPN…' : `Preview ESPN Week ${week}`}</button>{espnPreview?.matchups?.length > 0 && <><div className="espnPreviewList">{espnPreview.matchups.map((game, i) => <div className="espnPreviewGame" key={game.espnMatchupId ?? i}><span>{game.away.name} <b>{game.away.score ?? '—'}</b></span><span>{game.home.name} <b>{game.home.score ?? '—'}</b></span></div>)}</div><button className="secondaryButton" onClick={applyEspnPreview}>Copy ESPN Scores Into Week Editor</button></>}<small style={{ color: '#8e98a3', lineHeight: 1.5 }}>Preview first. Nothing is saved until you review the imported scores and tap Save Week below.</small></div></section>

    <section className="panel commissionerPanel"><div className="panelTitle"><h3>WEEKLY RESULTS</h3><span>{weekLoading ? 'LOADING…' : existingWeek ? `WEEK ${week} SAVED` : `WEEK ${week} NEW`}</span></div><label className="weekPicker">Week<input type="number" min="1" max="18" value={week} onChange={e => setWeek(e.target.value)} /></label><div className="matchupEditor">{matchups.map((m, i) => <div className="matchupCard" key={i}><div className="matchupNumber">MATCHUP {i + 1}</div><div className="matchupTeamLine"><select value={m.team1_id} onChange={e => updateMatchup(i, 'team1_id', e.target.value)}>{options}</select><input inputMode="decimal" placeholder="Score" value={m.team1_score} onChange={e => updateMatchup(i, 'team1_score', e.target.value)} /></div><div className="matchupVs">VS</div><div className="matchupTeamLine"><select value={m.team2_id} onChange={e => updateMatchup(i, 'team2_id', e.target.value)}>{options}</select><input inputMode="decimal" placeholder="Score" value={m.team2_score} onChange={e => updateMatchup(i, 'team2_score', e.target.value)} /></div></div>)}</div><div style={{ display: 'grid', gap: 10 }}><button className="primaryButton saveWeekButton" onClick={saveWeek}>{existingWeek ? `Update Week ${week}` : `Save Week ${week}`}</button><button className="secondaryButton" onClick={resetWeek}>Reset Week {week}</button></div></section>

    <section className="panel commissionerPanel"><div className="panelTitle"><h3>POWER RANKINGS</h3><span>{existingRankings ? `WEEK ${week} PUBLISHED` : `WEEK ${week}`}</span></div><div className="rankingEditor">{rankings.map((r, i) => <div className="rankingEditRow" key={i}><b>#{i + 1}</b><select value={r.team_id} onChange={e => updateRanking(i, 'team_id', e.target.value)}>{options}</select><input placeholder="Commissioner comment (optional)" value={r.commentary} onChange={e => updateRanking(i, 'commentary', e.target.value)} /></div>)}</div><div style={{ display: 'grid', gap: 10 }}><button className="primaryButton saveWeekButton" onClick={saveRankings}>{existingRankings ? 'Update Rankings' : 'Publish Rankings'}</button>{existingRankings && <button className="secondaryButton" onClick={clearRankings}>Clear Week {week} Rankings</button>}</div></section>

    <section className="commissionerGrid"><div className="panel commissionerPanel"><div className="panelTitle"><h3>LEAGUE NEWS</h3><span>{editingNewsId ? 'EDITING' : 'PUBLISH'}</span></div><div className="commissionerForm"><label>Headline<input value={news.title} onChange={e => setNews({ ...news, title: e.target.value })} /></label><label>Story<textarea rows="5" value={news.body} onChange={e => setNews({ ...news, body: e.target.value })} /></label><button className="primaryButton" onClick={saveNews}>{editingNewsId ? 'Save Changes' : 'Publish News'}</button>{editingNewsId && <button className="secondaryButton" onClick={cancelNewsEdit}>Cancel Edit</button>}</div>{newsItems.length > 0 && <div style={{ marginTop: 18, display: 'grid', gap: 8 }}>{newsItems.map(item => <div key={item.id} style={{ borderTop: '1px solid #2a3138', paddingTop: 10 }}><strong style={{ display: 'block', marginBottom: 7 }}>{item.title}</strong><div style={{ display: 'flex', gap: 8 }}><button className="secondaryButton" onClick={() => editNews(item)}>Edit</button><button className="secondaryButton" onClick={() => deleteNews(item.id)}>Delete</button></div></div>)}</div>}</div><div className="panel commissionerPanel"><div className="panelTitle"><h3>DIRTY PLAYER OF THE WEEK</h3><span>WEEK {week}</span></div><div className="commissionerForm"><label>Team<select value={dirtyPlayer.team_id} onChange={e => setDirtyPlayer({ ...dirtyPlayer, team_id: e.target.value })}>{options}</select></label><label>Player<input value={dirtyPlayer.player_name} onChange={e => setDirtyPlayer({ ...dirtyPlayer, player_name: e.target.value })} /></label><label>Why they were dirty<textarea rows="3" value={dirtyPlayer.reason} onChange={e => setDirtyPlayer({ ...dirtyPlayer, reason: e.target.value })} /></label><button className="primaryButton" onClick={saveDirtyPlayer}>Save Dirty Player</button></div></div></section>

    <section className="panel commissionerPanel"><div className="panelTitle"><h3>CHAMPIONSHIP HISTORY</h3><span>TROPHY CASE</span></div><div className="commissionerForm"><label>Season<input inputMode="numeric" placeholder="2025" value={champion.season} onChange={e => setChampion({ ...champion, season: e.target.value })} /></label><label>Champion<select value={champion.team_id} onChange={e => setChampion({ ...champion, team_id: e.target.value })}>{options}</select></label><button className="primaryButton" onClick={saveChampion}>Save Champion</button></div></section>

    <section className="panel commissionerPanel"><div className="panelTitle"><h3>HISTORICAL RECORD BOOK</h3><span>MANUAL ENTRY</span></div><div className="commissionerForm"><label>Record<input placeholder="e.g. Most Points in a Season" value={record.record_name} onChange={e => setRecord({ ...record, record_name: e.target.value })} /></label><label>Record Value<input placeholder="e.g. 1,842.6" value={record.record_value} onChange={e => setRecord({ ...record, record_value: e.target.value })} /></label><label>Team<select value={record.team_id} onChange={e => setRecord({ ...record, team_id: e.target.value })}>{options}</select></label><label>Season<input inputMode="numeric" placeholder="2025" value={record.season} onChange={e => setRecord({ ...record, season: e.target.value })} /></label><label>Week (optional)<input inputMode="numeric" placeholder="Optional" value={record.week} onChange={e => setRecord({ ...record, week: e.target.value })} /></label><button className="primaryButton" onClick={saveRecord}>Add Historical Record</button></div></section>

    {status && <div className="statusBar" onClick={() => setStatus('')}>{status}<span>×</span></div>}
  </PageShell>;
}
