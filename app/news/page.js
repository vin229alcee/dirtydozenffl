'use client';

import { useEffect, useState } from 'react';
import PageShell from '../../components/PageShell';
import { getSupabase } from '../../lib/supabase';

const supabase = getSupabase();

function formatDate(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
  } catch {
    return '';
  }
}

export default function News() {
  const [stories, setStories] = useState([]);
  const [nflStories, setNflStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nflLoading, setNflLoading] = useState(true);
  const [error, setError] = useState('');
  const [nflError, setNflError] = useState('');

  useEffect(() => {
    async function loadStories() {
      if (!supabase) {
        setError('News database is not configured.');
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.from('league_news').select('id,title,body,published_at').order('published_at', { ascending: false });
      if (error) setError(error.message);
      else setStories(data || []);
      setLoading(false);
    }

    async function loadNflNews() {
      try {
        const response = await fetch('/api/nfl-news', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load NFL news.');
        setNflStories(data.stories || []);
      } catch (err) {
        setNflError(err.message || 'NFL headlines are temporarily unavailable.');
      } finally {
        setNflLoading(false);
      }
    }

    loadStories();
    loadNflNews();
  }, []);

  return (
    <PageShell title="NEWS" kicker="DIRTY DOZENS + AROUND THE NFL">
      <section style={{ marginBottom: 28 }}>
        <div className="panelTitle" style={{ marginBottom: 12 }}><h3>DIRTY DOZENS NEWS</h3><span>FROM THE COMMISH</span></div>
        <div className="newsGrid">
          {loading && <div className="panel emptyPanel">Loading league news…</div>}
          {!loading && error && <div className="panel emptyPanel">{error}</div>}
          {!loading && !error && stories.length === 0 && <div className="panel emptyPanel">No league news has been published yet.</div>}
          {!loading && !error && stories.map((story) => (
            <article className="panel storyCard" key={story.id}>
              <span className="eyebrow">FROM THE COMMISH</span>
              <h2>{story.title}</h2>
              <p>{story.body || ''}</p>
              <small>{formatDate(story.published_at)}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 20 }}>
        <div className="panelTitle"><h3>NFL WIRE</h3><span>AUTO REFRESH</span></div>
        <p style={{ color: '#aab2bb', lineHeight: 1.6, marginTop: 0 }}>
          The biggest NFL headlines in one place so the league can keep up without leaving Dirty Dozens. Headlines refresh automatically throughout the day.
        </p>
      </section>

      <section>
        <div className="panelTitle" style={{ marginBottom: 12 }}><h3>AROUND THE NFL</h3><span>PROVIDED BY ESPN</span></div>
        <div className="newsGrid">
          {nflLoading && <div className="panel emptyPanel">Loading NFL headlines…</div>}
          {!nflLoading && nflError && <div className="panel emptyPanel">{nflError}</div>}
          {!nflLoading && !nflError && nflStories.length === 0 && <div className="panel emptyPanel">No NFL headlines are available right now.</div>}
          {!nflLoading && !nflError && nflStories.map((story, index) => (
            <a className="panel storyCard" key={story.id} href={story.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textDecoration: 'none' }}>
              <span className="eyebrow">{index === 0 ? 'TOP STORY · ESPN' : 'NFL · ESPN'}</span>
              <h2>{story.title}</h2>
              <small>{formatDate(story.publishedAt)} · Read full story on ESPN →</small>
            </a>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
