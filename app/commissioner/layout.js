'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabase } from '../../lib/supabase';

const supabase = getSupabase();

export default function CommissionerLayout({ children }) {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!supabase) {
      setChecking(false);
      return;
    }

    let active = true;

    async function verify(nextSession) {
      if (!active) return;
      setSession(nextSession || null);
      setMessage('');

      // Unauthenticated visitors are allowed through to the existing
      // Commissioner login screen. Authorization is checked immediately
      // after a successful sign-in.
      if (!nextSession?.user) {
        setAuthorized(false);
        setChecking(false);
        return;
      }

      setChecking(true);
      const { data, error } = await supabase
        .from('manager_teams')
        .select('team_id,is_commissioner')
        .eq('user_id', nextSession.user.id)
        .maybeSingle();

      if (!active) return;
      if (error) {
        setAuthorized(false);
        setMessage('Unable to verify commissioner access.');
      } else {
        setAuthorized(Boolean(data?.is_commissioner));
      }
      setChecking(false);
    }

    supabase.auth.getSession().then(({ data }) => verify(data.session || null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => verify(nextSession));

    return () => {
      active = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  async function signOut() {
    await supabase?.auth.signOut();
  }

  if (checking) {
    return <main className="page"><section className="panel emptyPanel">Verifying commissioner access…</section></main>;
  }

  if (!session) return children;
  if (authorized) return children;

  return (
    <main className="page">
      <section className="panel commissionerDenied">
        <span className="eyebrow">RESTRICTED AREA</span>
        <h1>Commissioner access only</h1>
        <p>{message || 'This signed-in account is not marked as a Dirty Dozens commissioner.'}</p>
        <div className="commissionerDeniedActions">
          <Link className="primaryButton" href="/manager">Back to Manager HQ</Link>
          <button type="button" className="secondaryButton" onClick={signOut}>Sign Out</button>
        </div>
      </section>
    </main>
  );
}
