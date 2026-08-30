'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PageShell from '../../../components/PageShell';
import { getSupabase } from '../../../lib/supabase';

const supabase = getSupabase();

export default function ManagerAccessPage(){
  const [session,setSession]=useState(null);
  const [teams,setTeams]=useState([]);
  const [invites,setInvites]=useState([]);
  const [links,setLinks]=useState([]);
  const [emails,setEmails]=useState({});
  const [status,setStatus]=useState('');
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    if(!supabase)return;
    supabase.auth.getSession().then(({data})=>setSession(data.session||null));
    const {data:listener}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next));
    return()=>listener.subscription.unsubscribe();
  },[]);

  useEffect(()=>{ if(session) load(); },[session]);

  async function load(){
    setLoading(true);
    const [{data:teamRows},{data:inviteRows,error:inviteError},{data:linkRows}]=await Promise.all([
      supabase.from('teams').select('id,name,manager').order('id'),
      supabase.from('manager_invites').select('id,email,team_id,created_at,claimed_at').order('team_id'),
      supabase.from('manager_teams').select('user_id,team_id,is_commissioner')
    ]);
    if(inviteError){setStatus(inviteError.message);setLoading(false);return;}
    setTeams(teamRows||[]);setInvites(inviteRows||[]);setLinks(linkRows||[]);setLoading(false);
  }

  const inviteByTeam=useMemo(()=>Object.fromEntries(invites.map(i=>[Number(i.team_id),i])),[invites]);
  const linkedTeams=useMemo(()=>new Set(links.map(l=>Number(l.team_id))),[links]);

  async function saveInvite(team){
    const email=(emails[team.id]??inviteByTeam[team.id]?.email??'').trim().toLowerCase();
    if(!email)return setStatus(`Enter an email for ${team.manager}.`);
    const existing=inviteByTeam[team.id];
    let error;
    if(existing){
      ({error}=await supabase.from('manager_invites').update({email,claimed_at:null}).eq('id',existing.id));
    }else{
      ({error}=await supabase.from('manager_invites').insert({email,team_id:Number(team.id),invited_by:session.user.id}));
    }
    if(error)return setStatus(error.message);
    setStatus(`${team.manager} is ready to register with ${email}.`);
    await load();
  }

  async function removeInvite(team){
    const existing=inviteByTeam[team.id];
    if(!existing)return;
    const {error}=await supabase.from('manager_invites').delete().eq('id',existing.id);
    setStatus(error?error.message:`Invite removed for ${team.manager}.`);
    if(!error)await load();
  }

  if(!supabase)return <PageShell title="MANAGER ACCESS" kicker="COMMISSIONER"><section className="panel">Supabase configuration is missing.</section></PageShell>;
  if(!session)return <PageShell title="MANAGER ACCESS" kicker="COMMISSIONER"><section className="panel"><p>Sign into the Commissioner dashboard first.</p><Link href="/commissioner" className="primaryButton">Commissioner Login</Link></section></PageShell>;

  return <PageShell title="MANAGER ACCESS" kicker="COMMISSIONER TOOL">
    <section className="panel" style={{marginBottom:18}}>
      <div className="panelTitle"><h3>TEAM LOGIN SETUP</h3><span>{links.length}/12 LINKED</span></div>
      <p style={{color:'#aab2bb',lineHeight:1.6}}>Enter each manager's email here. When that manager creates an account on the Join page using the same email, Supabase automatically links the account to the correct fantasy team.</p>
      <div style={{display:'flex',gap:10,flexWrap:'wrap'}}><Link href="/join" className="secondaryButton">Open Manager Join Page</Link><Link href="/commissioner" className="secondaryButton">Back to Commissioner</Link></div>
    </section>

    <section className="panel">
      {loading?<p>Loading manager access…</p>:<div style={{display:'grid',gap:0}}>{teams.map(team=>{
        const invite=inviteByTeam[team.id];
        const linked=linkedTeams.has(Number(team.id));
        return <div key={team.id} style={{borderBottom:'1px solid #2a3138',padding:'16px 0'}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'start'}}><div><strong style={{fontSize:18}}>{team.manager}</strong><small style={{display:'block',color:'#8e98a3',marginTop:4}}>{team.name}</small></div><b style={{color:linked?'#ffc24b':'#9aa6b2'}}>{linked?'LINKED':invite?.claimed_at?'CLAIMED':'PENDING'}</b></div>
          {!linked&&<div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto auto',gap:8,marginTop:12}}><input type="email" placeholder="manager@email.com" value={emails[team.id]??invite?.email??''} onChange={e=>setEmails(prev=>({...prev,[team.id]:e.target.value}))}/><button className="primaryButton" type="button" onClick={()=>saveInvite(team)}>{invite?'Update':'Save Email'}</button>{invite&&<button className="secondaryButton" type="button" onClick={()=>removeInvite(team)}>Remove</button>}</div>}
        </div>})}</div>}
    </section>
    {status&&<div className="statusBar" onClick={()=>setStatus('')}>{status}<span>×</span></div>}
  </PageShell>;
}
