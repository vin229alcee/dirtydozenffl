'use client';

import { useEffect, useMemo, useState } from 'react';
import PageShell from '../../components/PageShell';
import { getSupabase } from '../../lib/supabase';

const supabase = getSupabase();
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg','image/png','image/webp','image/gif'];
const SIGNED_URL_TTL = 60 * 60;

function formatTime(value){
  try{return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value));}
  catch{return ''}
}

function safeFileName(name='meme'){
  const cleaned=name.toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'');
  return cleaned || 'meme';
}

export default function TrashTalkPage(){
  const [session,setSession]=useState(null);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [access,setAccess]=useState(null);
  const [team,setTeam]=useState(null);
  const [posts,setPosts]=useState([]);
  const [teams,setTeams]=useState([]);
  const [body,setBody]=useState('');
  const [file,setFile]=useState(null);
  const [status,setStatus]=useState('');
  const [loading,setLoading]=useState(true);
  const [posting,setPosting]=useState(false);

  const teamsById=useMemo(()=>Object.fromEntries(teams.map(t=>[Number(t.id),t])),[teams]);

  useEffect(()=>{
    if(!supabase){setStatus('Supabase is not configured.');setLoading(false);return;}
    supabase.auth.getSession().then(({data})=>setSession(data.session||null));
    const {data:listener}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next));
    return()=>listener.subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    if(!supabase)return;
    loadPosts();
    const channel=supabase.channel('trash-talk-feed').on('postgres_changes',{event:'*',schema:'public',table:'trash_talk_posts'},()=>loadPosts()).subscribe();
    return()=>{supabase.removeChannel(channel)};
  },[]);

  useEffect(()=>{
    if(!supabase)return;
    loadIdentity(session);
  },[session]);

  async function loadPosts(){
    if(!supabase)return;
    const [{data:teamRows},{data:postRows,error}]=await Promise.all([
      supabase.from('teams').select('id,name,manager').order('id'),
      supabase.from('trash_talk_posts').select('id,author_id,team_id,body,media_path,created_at,updated_at').order('created_at',{ascending:false}).limit(100)
    ]);
    if(error){
      setStatus(error.message||'Unable to load Trash Talk right now.');
      setLoading(false);
      return;
    }
    const withMedia=await Promise.all((postRows||[]).map(async post=>{
      if(!post.media_path)return {...post,media_url:''};
      const {data,error:signedError}=await supabase.storage.from('trash-talk').createSignedUrl(post.media_path,SIGNED_URL_TTL);
      return {...post,media_url:signedError?'':data?.signedUrl||''};
    }));
    setTeams(teamRows||[]);
    setPosts(withMedia);
    setLoading(false);
  }

  async function loadIdentity(currentSession){
    setAccess(null);setTeam(null);
    if(!supabase||!currentSession)return;
    const {data:row,error}=await supabase.from('manager_teams').select('team_id,is_commissioner').eq('user_id',currentSession.user.id).maybeSingle();
    if(error){setStatus(error.message);return;}
    if(!row){setStatus('Your login is valid, but it has not been linked to a Dirty Dozens team yet.');return;}
    setAccess(row);
    const {data:t}=await supabase.from('teams').select('id,name,manager').eq('id',row.team_id).maybeSingle();
    setTeam(t||null);
    setStatus('');
  }

  async function signIn(e){
    e.preventDefault();
    if(!supabase)return;
    setStatus('Signing in…');
    const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
    setStatus(error?error.message:'');
  }

  async function signOut(){
    if(!supabase)return;
    await supabase.auth.signOut();
    setStatus('');
  }

  async function submitPost(e){
    e.preventDefault();
    if(!supabase||!session||!access||posting)return;
    const text=body.trim();
    if(!text&&!file){setStatus('Add a comment or meme first.');return;}
    if(text.length>1000){setStatus('Keep trash talk under 1,000 characters.');return;}
    if(file&&(!ALLOWED_TYPES.includes(file.type)||file.size>MAX_IMAGE_BYTES)){setStatus('Memes must be JPG, PNG, WEBP, or GIF and 8 MB or smaller.');return;}
    setPosting(true);setStatus('');
    let mediaPath=null;
    if(file){
      mediaPath=`${session.user.id}/${Date.now()}-${safeFileName(file.name)}`;
      const {error:uploadError}=await supabase.storage.from('trash-talk').upload(mediaPath,file,{cacheControl:'3600',upsert:false,contentType:file.type});
      if(uploadError){setStatus(uploadError.message);setPosting(false);return;}
    }
    const {error}=await supabase.from('trash_talk_posts').insert({author_id:session.user.id,team_id:Number(access.team_id),body:text||null,media_path:mediaPath});
    if(error){
      if(mediaPath)await supabase.storage.from('trash-talk').remove([mediaPath]);
      setStatus(error.message);setPosting(false);return;
    }
    setBody('');setFile(null);setPosting(false);await loadPosts();
  }

  async function deletePost(post){
    if(!supabase||!session)return;
    const canDelete=post.author_id===session.user.id||access?.is_commissioner;
    if(!canDelete)return;
    if(!window.confirm('Delete this trash talk post?'))return;
    const {error}=await supabase.from('trash_talk_posts').delete().eq('id',post.id);
    if(error){setStatus(error.message);return;}
    if(post.media_path)await supabase.storage.from('trash-talk').remove([post.media_path]);
    await loadPosts();
  }

  return <PageShell title="TRASH TALK" kicker="LEAGUE SOCIAL FEED">
    <section className="panel trashTalkIntro">
      <div className="panelTitle"><h3>THE LOCKER ROOM</h3><span>MANAGERS ONLY TO POST</span></div>
      <p>Talk your talk, drop a meme, keep receipts. Everyone can read the feed; only linked Dirty Dozens managers can post.</p>
    </section>

    {!session?<section className="panel trashTalkLogin"><div><span className="eyebrow">MANAGER ACCESS</span><h2>Sign in to post</h2><p>Use the Supabase login tied to your league manager account.</p></div><form onSubmit={signIn}><input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required/><input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} required/><button className="primaryButton" type="submit">Sign In</button></form>{status&&<p className="trashTalkStatus">{status}</p>}</section>:
    <section className="panel trashTalkComposer"><div className="trashTalkIdentity"><div><span>POSTING AS</span><strong>{team?.name||'Linked manager'}</strong><small>{team?.manager||session.user.email}</small></div><button className="secondaryButton" type="button" onClick={signOut}>Sign Out</button></div>{access?<form onSubmit={submitPost}><textarea maxLength={1000} placeholder="Say something reckless…" value={body} onChange={e=>setBody(e.target.value)}/><div className="trashTalkComposerBar"><label className="trashTalkFile">Add Meme<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e=>setFile(e.target.files?.[0]||null)}/></label><span>{file?file.name:`${body.length}/1000`}</span><button className="primaryButton" type="submit" disabled={posting}>{posting?'Posting…':'Post Trash Talk'}</button></div></form>:<div className="trashTalkUnlinked">{status||'This account is not linked to a team yet.'}</div>}</section>}

    <section className="trashTalkFeed" aria-live="polite">
      {loading?<div className="panel emptyPanel">Loading the locker room…</div>:posts.length?posts.map(post=>{const t=teamsById[Number(post.team_id)]||{};const canDelete=!!session&&(post.author_id===session.user.id||access?.is_commissioner);return <article className="panel trashTalkPost" key={post.id}><div className="trashTalkPostHead"><div><strong>{t.name||'Dirty Dozens'}</strong><span>{t.manager||'League Manager'} · {formatTime(post.created_at)}</span></div>{canDelete&&<button type="button" onClick={()=>deletePost(post)}>Delete</button>}</div>{post.body&&<p>{post.body}</p>}{post.media_url&&<img src={post.media_url} alt="Meme posted to Dirty Dozens trash talk" loading="lazy"/>}</article>}):<div className="panel emptyPanel"><h3>No trash talk yet.</h3><p>Somebody has to fire the first shot.</p></div>}
    </section>
  </PageShell>;
}
