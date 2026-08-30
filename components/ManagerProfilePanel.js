'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '../lib/supabase';

const supabase = getSupabase();
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg','image/png','image/webp'];

export default function ManagerProfilePanel({ session, team }){
  const [profile,setProfile]=useState({profile_image_path:'',manager_bio:'',franchise_bio:'',primary_color:'#d62828',secondary_color:'#3a86ff'});
  const [poll,setPoll]=useState({question:'',option_a:'Yes',option_b:'No'});
  const [file,setFile]=useState(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [status,setStatus]=useState('');

  useEffect(()=>{
    let active=true;
    async function load(){
      if(!supabase||!team?.id){setLoading(false);return;}
      const [{data,error},{data:activePoll}] = await Promise.all([
        supabase.from('team_profiles').select('*').eq('team_id',team.id).maybeSingle(),
        supabase.from('manager_polls').select('*').eq('team_id',team.id).eq('is_active',true).order('created_at',{ascending:false}).limit(1).maybeSingle()
      ]);
      if(!active)return;
      if(error)setStatus(error.message);
      if(data)setProfile(p=>({...p,...data}));
      if(activePoll)setPoll(activePoll);
      setLoading(false);
    }
    load();
    return()=>{active=false};
  },[team?.id]);

  function imageUrl(path){if(!path||!supabase)return '';return supabase.storage.from('manager-profiles').getPublicUrl(path).data.publicUrl;}
  function chooseFile(event){const next=event.target.files?.[0]||null;if(!next){setFile(null);return;}if(!ACCEPTED_TYPES.includes(next.type)){setStatus('Use a JPG, PNG, or WEBP image.');event.target.value='';return;}if(next.size>MAX_FILE_SIZE){setStatus('Profile pictures must be 5 MB or smaller.');event.target.value='';return;}setStatus('');setFile(next);}

  async function saveProfile(event){
    event.preventDefault();if(!supabase||!team?.id||!session?.user?.id)return;setSaving(true);setStatus('Saving profile…');let imagePath=profile.profile_image_path||'';
    try{
      if(file){const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');imagePath=`${session.user.id}/profile-${Date.now()}.${ext||'jpg'}`;const {error:uploadError}=await supabase.storage.from('manager-profiles').upload(imagePath,file,{contentType:file.type,upsert:false});if(uploadError)throw uploadError;}
      const payload={team_id:Number(team.id),profile_image_path:imagePath||null,manager_bio:String(profile.manager_bio||'').trim().slice(0,600),franchise_bio:String(profile.franchise_bio||'').trim().slice(0,1000),primary_color:profile.primary_color||'#d62828',secondary_color:profile.secondary_color||'#3a86ff',updated_at:new Date().toISOString()};
      const {data,error}=await supabase.from('team_profiles').upsert(payload,{onConflict:'team_id'}).select().single();if(error)throw error;setProfile(data);setFile(null);setStatus('Profile updated.');
    }catch(error){setStatus(error?.message||'Unable to update profile.');}finally{setSaving(false);}
  }

  async function savePoll(){
    if(!poll.question?.trim()){setStatus('Add a poll question first.');return;}setSaving(true);setStatus('Saving poll…');
    try{
      await supabase.from('manager_polls').update({is_active:false}).eq('team_id',team.id).eq('is_active',true);
      const {data,error}=await supabase.from('manager_polls').insert({team_id:Number(team.id),question:poll.question.trim().slice(0,180),option_a:(poll.option_a||'Yes').trim().slice(0,60),option_b:(poll.option_b||'No').trim().slice(0,60),created_by:session.user.id,is_active:true}).select().single();
      if(error)throw error;setPoll(data);setStatus('Manager poll is live.');
    }catch(error){setStatus(error?.message||'Unable to save poll.');}finally{setSaving(false);}
  }

  const photo=imageUrl(profile.profile_image_path);const initials=String(team?.manager||'DD').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();

  return <details className="panel managerProfilePanel">
    <summary><div><span className="eyebrow">FRANCHISE PROFILE</span><strong>Edit your public profile</strong><small>Photo, story, franchise colors, and manager poll</small></div><span className="managerProfileChevron" aria-hidden="true">▾</span></summary>
    <form onSubmit={saveProfile} className="managerProfileForm">
      {loading?<div className="emptyPanel">Loading profile…</div>:<>
        <div className="managerProfilePhotoColumn"><div className="managerProfileThumb">{photo?<img src={photo} alt={`${team.manager} profile`}/>:<strong>{initials}</strong>}</div><label className="managerProfileUpload"><span>PROFILE PHOTO</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile}/><small>JPG, PNG, WEBP · max 5 MB</small></label></div>
        <div className="managerProfileFields">
          <label><span>ABOUT YOU</span><textarea value={profile.manager_bio||''} onChange={e=>setProfile(p=>({...p,manager_bio:e.target.value}))} maxLength={600} rows={5} placeholder="Tell the league a little about yourself…"/><small>{(profile.manager_bio||'').length}/600</small></label>
          <label><span>FRANCHISE STORY</span><textarea value={profile.franchise_bio||''} onChange={e=>setProfile(p=>({...p,franchise_bio:e.target.value}))} maxLength={1000} rows={6} placeholder="Team origin, philosophy, rivalries, legendary bad beats…"/><small>{(profile.franchise_bio||'').length}/1000</small></label>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}><label><span>PRIMARY COLOR</span><input type="color" value={profile.primary_color||'#d62828'} onChange={e=>setProfile(p=>({...p,primary_color:e.target.value}))}/></label><label><span>SECONDARY COLOR</span><input type="color" value={profile.secondary_color||'#3a86ff'} onChange={e=>setProfile(p=>({...p,secondary_color:e.target.value}))}/></label></div>
          <div className="managerProfileActions"><button className="primaryButton" type="submit" disabled={saving}>{saving?'Saving…':'Save Profile'}</button></div>
          <div style={{borderTop:'1px solid #2b3945',paddingTop:16,marginTop:8}}><span className="eyebrow">MANAGER POLL</span><label><span>QUESTION</span><input value={poll.question||''} onChange={e=>setPoll(p=>({...p,question:e.target.value}))} maxLength={180} placeholder="Will this franchise make the playoffs?"/></label><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}><label><span>OPTION A</span><input value={poll.option_a||''} onChange={e=>setPoll(p=>({...p,option_a:e.target.value}))} maxLength={60}/></label><label><span>OPTION B</span><input value={poll.option_b||''} onChange={e=>setPoll(p=>({...p,option_b:e.target.value}))} maxLength={60}/></label></div><button className="secondaryButton" type="button" onClick={savePoll} disabled={saving}>Publish New Poll</button></div>
          {status&&<div className="managerProfileActions"><span>{status}</span></div>}
        </div>
      </>}
    </form>
  </details>;
}
