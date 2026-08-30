'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageShell from '../../components/PageShell';
import { getSupabase } from '../../lib/supabase';

const supabase=getSupabase();

export default function JoinPage(){
  const [session,setSession]=useState(null);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [status,setStatus]=useState('');
  const [linkedTeam,setLinkedTeam]=useState(null);

  useEffect(()=>{
    if(!supabase)return;
    supabase.auth.getSession().then(({data})=>setSession(data.session||null));
    const {data:listener}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next));
    return()=>listener.subscription.unsubscribe();
  },[]);

  useEffect(()=>{ if(session) checkLink(session.user.id); },[session]);

  async function checkLink(userId){
    const {data:link}=await supabase.from('manager_teams').select('team_id').eq('user_id',userId).maybeSingle();
    if(!link)return setLinkedTeam(null);
    const {data:team}=await supabase.from('teams').select('id,name,manager').eq('id',link.team_id).maybeSingle();
    setLinkedTeam(team||null);
  }

  async function register(e){
    e.preventDefault();
    if(password.length<8)return setStatus('Use a password with at least 8 characters.');
    setStatus('Creating account…');
    const {data,error}=await supabase.auth.signUp({email:email.trim().toLowerCase(),password});
    if(error)return setStatus(error.message);
    if(data.session){setSession(data.session);setStatus('Account created and signed in.');}
    else setStatus('Account created. Check your email to confirm your address, then sign in on Trash Talk.');
  }

  if(!supabase)return <PageShell title="JOIN DIRTY DOZENS" kicker="MANAGER ACCESS"><section className="panel">Supabase configuration is missing.</section></PageShell>;

  return <PageShell title="JOIN DIRTY DOZENS" kicker="MANAGER ACCESS">
    {session?<section className="panel"><div className="panelTitle"><h3>{linkedTeam?'ACCOUNT LINKED':'ACCOUNT CREATED'}</h3></div>{linkedTeam?<><p>Your login is connected to <strong>{linkedTeam.name}</strong> — {linkedTeam.manager}.</p><Link className="primaryButton" href="/trash-talk">Go to Trash Talk</Link></>:<><p>This login is not linked to a team yet. Make sure you registered with the exact email your commissioner entered for you.</p><Link className="secondaryButton" href="/trash-talk">Go to Trash Talk</Link></>}</section>:
    <section className="panel"><div className="panelTitle"><h3>CREATE MANAGER LOGIN</h3><span>INVITED MANAGERS</span></div><p style={{color:'#aab2bb',lineHeight:1.6}}>Use the same email address your commissioner assigned to your fantasy team. Your account will be linked automatically.</p><form onSubmit={register} style={{display:'grid',gap:12,maxWidth:520}}><input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required/><input type="password" placeholder="Password (8+ characters)" value={password} onChange={e=>setPassword(e.target.value)} required minLength={8}/><button className="primaryButton" type="submit">Create Manager Account</button></form>{status&&<p style={{marginTop:14}}>{status}</p>}<p style={{marginTop:18}}><Link href="/trash-talk">Already registered? Sign in to Trash Talk →</Link></p></section>}
  </PageShell>;
}
