'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PageShell from '../../../components/PageShell';
import { getSupabase } from '../../../lib/supabase';

const supabase = getSupabase();
const MAP_RECORD = '__OWNER_MAP__';
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const isSuspicious = value => /^espnfan\d+$/i.test(normalize(value)) || /^[a-z]+\d{2,}$/i.test(normalize(value));

export default function OwnerMappingPage() {
  const [session, setSession] = useState(null);
  const [teams, setTeams] = useState([]);
  const [owners, setOwners] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) return;
    load();
  }, [session]);

  async function load() {
    setLoading(true);
    const [{ data: teamRows }, { data: mapRows }, ownersResponse] = await Promise.all([
      supabase.from('teams').select('id,name,manager').order('id'),
      supabase.from('league_records').select('*').eq('record_name', MAP_RECORD).order('id'),
      fetch('/api/espn/owners', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ owners: [] })),
    ]);
    setTeams(teamRows || []);
    setMappings(mapRows || []);
    setOwners(ownersResponse.owners || []);
    setLoading(false);
  }

  const mappedByRaw = useMemo(() => Object.fromEntries(mappings.map(row => [normalize(row.record_value), row])), [mappings]);
  const unresolved = owners.filter(owner => isSuspicious(owner.raw) || !teams.some(team => normalize(team.manager) === normalize(owner.raw)));

  async function saveMapping(raw, teamId) {
    const existing = mappedByRaw[normalize(raw)];
    if (!teamId) {
      if (!existing) return;
      const { error } = await supabase.from('league_records').delete().eq('id', existing.id);
      if (error) return setStatus(error.message);
      setStatus(`Mapping removed for ${raw}.`);
      return load();
    }
    const payload = { record_name: MAP_RECORD, record_value: raw, team_id: Number(teamId), season: null, week: null };
    let error;
    if (existing) ({ error } = await supabase.from('league_records').update(payload).eq('id', existing.id));
    else ({ error } = await supabase.from('league_records').insert(payload));
    if (error) return setStatus(error.message);
    const team = teams.find(t => Number(t.id) === Number(teamId));
    setStatus(`${raw} mapped to ${team?.manager || team?.name || 'manager'}.`);
    await load();
  }

  if (!supabase) return <PageShell title="OWNER MAPPING" kicker="COMMISSIONER"><section className="panel">Supabase configuration is missing.</section></PageShell>;
  if (!session) return <PageShell title="OWNER MAPPING" kicker="COMMISSIONER"><section className="panel"><p>Sign into the Commissioner dashboard first, then return here.</p><Link href="/commissioner" className="primaryButton" style={{textDecoration:'none'}}>Commissioner Login</Link></section></PageShell>;

  return <PageShell title="OWNER MAPPING" kicker="COMMISSIONER TOOL">
    <section className="panel" style={{marginBottom:18}}>
      <div className="panelTitle"><h3>ESPN OWNER MATCHING</h3><span>{loading ? 'LOADING…' : `${unresolved.length} TO REVIEW`}</span></div>
      <p style={{color:'#aab2bb',lineHeight:1.6,marginTop:0}}>Match old ESPN usernames to the correct current league manager. Once saved, Analytics can merge that owner's historical games, rivalry record and scoring history under the real manager name.</p>
      <Link href="/analytics" className="secondaryButton" style={{textDecoration:'none'}}>← Back to Analytics</Link>
    </section>

    <section className="panel">
      {unresolved.length ? <div style={{display:'grid',gap:0}}>{unresolved.map(owner => {
        const existing = mappedByRaw[normalize(owner.raw)];
        return <div key={owner.raw} style={{borderBottom:'1px solid #2a3138',padding:'16px 0'}}>
          <strong style={{display:'block',fontSize:18,overflowWrap:'anywhere'}}>{owner.raw}</strong>
          <small style={{display:'block',color:'#8e98a3',margin:'5px 0 10px'}}>ESPN seasons: {owner.seasons.join(', ')}{owner.teams.length ? ` · Teams: ${owner.teams.join(', ')}` : ''}</small>
          <select defaultValue={existing?.team_id ? String(existing.team_id) : ''} onChange={e => saveMapping(owner.raw, e.target.value)} style={{width:'100%'}}>
            <option value="">Not mapped</option>
            {teams.map(team => <option key={team.id} value={team.id}>{team.manager} — {team.name}</option>)}
          </select>
        </div>;
      })}</div> : <p>{loading ? 'Checking ESPN history…' : 'Every ESPN owner name is either readable or mapped.'}</p>}
    </section>
    {status && <div className="statusBar" onClick={() => setStatus('')}>{status}<span>×</span></div>}
  </PageShell>;
}
