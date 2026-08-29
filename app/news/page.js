'use client';

import { useEffect, useState } from 'react';
import PageShell from '../../components/PageShell';
import { getSupabase } from '../../lib/supabase';

const supabase = getSupabase();

export default function News() {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadStories() {
      if (!supabase) {
        setError('News database is not configured.');
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('league_news')
        .select('id,title,body,published_at')
        .order('published_at', { ascending: false });

      if (error) setError(error.message);
      else setStories(data || []);
      setLoading(false);
    }

    loadStories();
  }, []);

  return (
    <PageShell title="LEAGUE NEWS" kicker="FROM THE COMMISH">
      <div className="newsGrid">
        {loading && <div className="panel emptyPanel">Loading league news…</div>}
        {!loading && error && <div className="panel emptyPanel">{error}</div>}
        {!loading && !error && stories.length === 0 && <div className="panel emptyPanel">No league news has been published yet.</div>}
        {!loading && !error && stories.map((story) => (
          <article className="panel storyCard" key={story.id}>
            <span className="eyebrow">FROM THE COMMISH</span>
            <h2>{story.title}</h2>
            <p>{story.body || ''}</p>
            <small>{story.published_at ? new Date(story.published_at).toLocaleString() : ''}</small>
          </article>
        ))}
      </div>
    </PageShell>
  );
}
