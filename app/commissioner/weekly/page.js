'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageShell from '../../../components/PageShell';
import { getSupabase } from '../../../lib/supabase';
const supabase=getSupabase(),SEASON=2026;

export default function WeeklyTake(){
 const [session,setSession]=useState(null),[week,setWeek]=useState(1),[body,setBody]=useState(''),[status,setStatus]=useState(''),[allowed,setAllowed]=useState(false);
 useEffect(()=>{async function load(){if(!supabase)return;const {data:{session:s}}=await supabase.auth.getSession();setSession(s);if(!s)return;const {data:m}=await supabase.from('manager_teams').select('is_commissioner').eq('user_id',s.user.id).maybeSingle();if(!m?.is_commissioner)return;setAllowed(true);try{const r=await fetch('/api/recap',{cache:'no-store'}),d=await r.json();const w=Number(d.currentWeek||d.week||1);setWeek(w);const {data:t}=await supabase.from('weekly_commissioner_takes').select('body').eq('season',SEASON).eq('week',w).maybeSingle();setBody(t?.body||'');}catch{}}load();},[]);
 async function save(e){e.preventDefault();if(!session||!allowed)return;setStatus('Saving…');const text=body.trim();if(!text){const {error}=await supabase.from('weekly_commissioner_takes').delete().eq('season',SEASON).eq('week',week);setStatus(error?error.message:'Commissioner take cleared.');return;}const {error}=await supabase.from('weekly_commissioner_takes').upsert({season:SEASON,week,body:text,updated_by:session.user.id,updated_at:new Date().toISOString()},{onConflict:'season,week'});setStatus(error?error.message:'Commissioner take saved.');}
 return <PageShell title="WEEKLY TAKE" kicker="COMMISSIONER"><div className="panel" style={{maxWidth:760,margin:'0 auto'}}>{!session?<><h2>Commissioner sign-in required</h2><p>Sign in through the commissioner area first.</p><Link className="button" href="/commissioner">Commissioner</Link></>:!allowed?<><h2>Commissioner only</h2><p>This editor is reserved for the league commissioner.</p></>:<form onSubmit={save}><span className="eyebrow">2026 · WEEK {week}</span><h2>Commissioner&apos;s Take</h2><p>Add one short note for this week&apos;s Dirty Dozens Weekly. Leave it blank if the automatic recap says enough.</p><textarea value={body} onChange={e=>setBody(e.target.value.slice(0,500))} rows={6} placeholder="A few sentences about the week…" style={{width:'100%',margin:'14px 0',padding:14}}/><small>{body.length}/500</small><div style={{marginTop:14}}><button className="button" type="submit">Save weekly take</button></div>{status&&<p>{status}</p>}</form>}</div></PageShell>;
}
