'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageShell from '../../../components/PageShell';
import { getSupabase } from '../../../lib/supabase';

const supabase = getSupabase();
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg','image/png','image/webp'];

export default function ManagerProfileEditor(){
  const [session,setSession]=useState(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [status,setStatus]=useState('');
  const [team,setTeam]=useState(null);
  const [profile,setProfile]=useState({profile_image_path:'',manager_bio:'',franchise_bio:''});
  const [file,setFile]=useState(null);

  useEffect(()=>{
    if(!supabase){setLoading(false);return;}
    supabase.auth.getSession().then(({data})=>setSession(data.session||null));
    const {data:listener}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next));
    return()=>listener.subscription.unsubscribe();
  },[]);

  useEffect(()=>{if(session)loadProfile();else setLoading(false)},[session]);

  async function loadProfile(){
    setLoading(true);setStatus('');
    const {data:link,error:linkError}=await supabase.from('manager_teams').select('team_id').eq('user_id',session.user.id).maybeSingle();
    if(linkError||!link){setStatus(linkError?.message||'This account is not linked to a team.');setLoading(false);return;}
    const [teamRes,profileRes]=await Promise.all([
      supabase.from('teams').select('id,name,manager').eq('id',link.team_id).maybeSingle(),
      supabase.from('team_profiles').select('*').eq('team_id',link.team_id).maybeSingle()
    ]);
    setTeam(teamRes.data||null);
    if(profileRes.data)setProfile(profileRes.data);
    setLoading(false);
  }

  function publicImageUrl(path){
    if(!path||!supabase)return '';
    return supabase.storage.from('manager-profiles').getPublicUrl(path).data.publicUrl;
  }

  function chooseFile(event){
    const next=event.target.files?.[0]||null;
    if(!next){setFile(null);return;}
    if(!ACCEPTED_TYPES.includes(next.type)){setStatus('Use a JPG, PNG, or WEBP image.');event.target.value='';return;}
    if(next.size>MAX_FILE_SIZE){setStatus('Profile pictures must be 5 MB or smaller.');event.target.value='';return;}
    setStatus('');setFile(next);
  }

  async function saveProfile(event){
    event.preventDefault();
    if(!team||!session)return;
    setSaving(true);setStatus('Saving profile…');
    let imagePath=profile.profile_image_path||'';
    try{
      if(file){
        const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
        imagePath=`${session.user.id}/profile-${Date.now()}.${ext||'jpg'}`;
        const {error:uploadError}=await supabase.storage.from('manager-profiles').upload(imagePath,file,{contentType:file.type,upsert:false});
        if(uploadError)throw uploadError;
      }
      const payload={
        team_id:Number(team.id),
        profile_image_path:imagePath||null,
        manager_bio:String(profile.manager_bio||'').trim().slice(0,600),
        franchise_bio:String(profile.franchise_bio||'').trim().slice(0,1000),
        updated_at:new Date().toISOString()
      };
      const {data,error}=await supabase.from('team_profiles').upsert(payload,{onConflict:'team_id'}).select().single();
      if(error)throw error;
      setProfile(data);setFile(null);setStatus('Profile updated.');
    }catch(error){setStatus(error?.message||'Unable to update profile.');}
    finally{setSaving(false);}
  }

  if(!supabase)return <PageShell title="EDIT PROFILE" kicker="MANAGER HQ"><section className="panel">Supabase is not configured.</section></PageShell>;
  if(!session)return <PageShell title="EDIT PROFILE" kicker="MANAGER HQ"><section className="panel"><h2>Manager login required</h2><p>Sign in through Manager HQ to edit your franchise profile.</p><Link className="primaryButton" href="/manager">Go to Manager HQ</Link></section></PageShell>;
  if(loading)return <PageShell title="EDIT PROFILE" kicker="MANAGER HQ"><section className="panel emptyPanel">Loading your profile…</section></PageShell>;
  if(!team)return <PageShell title="EDIT PROFILE" kicker="MANAGER HQ"><section className="panel"><h2>Account not linked</h2><p>{status}</p></section></PageShell>;

  const imageUrl=publicImageUrl(profile.profile_image_path);
  return <PageShell title="EDIT PROFILE" kicker="MANAGER HQ">
    <section className="panel" style={{marginBottom:18}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',flexWrap:'wrap'}}>
        <div><span className="eyebrow">YOUR FRANCHISE</span><h2 style={{fontFamily:'Oswald',fontSize:32,margin:'5px 0'}}>{team.name}</h2><p style={{margin:0,color:'#9aa6b2'}}>{team.manager}</p></div>
        <div style={{display:'flex',gap:10,flexWrap:'wrap'}}><Link className="secondaryButton" href={`/teams/${team.id}`}>View Public Profile</Link><Link className="secondaryButton" href="/manager">Back to HQ</Link></div>
      </div>
    </section>

    <form className="commissionerGrid" onSubmit={saveProfile}>
      <section className="panel">
        <div className="panelTitle"><h3>PROFILE PICTURE</h3><span>PUBLIC</span></div>
        <div style={{display:'grid',gap:16}}>
          <div style={{width:150,height:150,borderRadius:18,overflow:'hidden',border:'1px solid #34414c',background:'#080d11',display:'grid',placeItems:'center'}}>
            {imageUrl?<img src={imageUrl} alt={`${team.manager} profile`} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<strong style={{fontFamily:'Oswald',fontSize:42,color:'#7d8992'}}>{team.manager?.split(' ').map(n=>n[0]).join('').slice(0,2)||'DD'}</strong>}
          </div>
          <div><label style={{display:'block',fontSize:11,fontWeight:800,marginBottom:7}}>UPLOAD NEW PHOTO</label><input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile}/><small style={{display:'block',marginTop:8,color:'#8f9ba5'}}>JPG, PNG, or WEBP · max 5 MB</small></div>
        </div>
      </section>

      <section className="panel">
        <div className="panelTitle"><h3>ABOUT YOU</h3><span>PUBLIC</span></div>
        <label style={{display:'block',fontSize:11,fontWeight:800,marginBottom:7}}>MANAGER BIO</label>
        <textarea value={profile.manager_bio||''} onChange={e=>setProfile(p=>({...p,manager_bio:e.target.value}))} maxLength={600} rows={7} placeholder="Tell the league a little about yourself…" style={{width:'100%',resize:'vertical',background:'#090c0f',border:'1px solid #343c45',color:'#fff',padding:12,borderRadius:7}}/>
        <small style={{color:'#8f9ba5'}}>{(profile.manager_bio||'').length}/600</small>
      </section>

      <section className="panel" style={{gridColumn:'1 / -1'}}>
        <div className="panelTitle"><h3>FRANCHISE STORY</h3><span>PUBLIC</span></div>
        <label style={{display:'block',fontSize:11,fontWeight:800,marginBottom:7}}>ABOUT THE FRANCHISE</label>
        <textarea value={profile.franchise_bio||''} onChange={e=>setProfile(p=>({...p,franchise_bio:e.target.value}))} maxLength={1000} rows={7} placeholder="Team origin, philosophy, rivalries, championship aspirations, legendary bad beats…" style={{width:'100%',resize:'vertical',background:'#090c0f',border:'1px solid #343c45',color:'#fff',padding:12,borderRadius:7}}/>
        <small style={{color:'#8f9ba5'}}>{(profile.franchise_bio||'').length}/1000</small>
      </section>

      <section style={{gridColumn:'1 / -1',display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
        <button className="primaryButton" type="submit" disabled={saving}>{saving?'Saving…':'Save Profile'}</button>
        {status&&<span style={{color:status==='Profile updated.'?'#9ce4af':'#d5dde3',fontSize:12}}>{status}</span>}
      </section>
    </form>
  </PageShell>;
}
