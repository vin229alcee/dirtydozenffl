import { NextResponse } from 'next/server';

const ESPN_NFL_RSS = 'https://www.espn.com/espn/rss/nfl/news';

function decodeXml(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function field(item, tag) {
  const match = item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return decodeXml(match?.[1]?.trim() || '');
}

export async function GET() {
  try {
    const response = await fetch(ESPN_NFL_RSS, {
      headers: { 'User-Agent': 'DirtyDozensFFL/1.0' },
      next: { revalidate: 900 },
    });

    if (!response.ok) throw new Error(`ESPN feed returned ${response.status}`);

    const xml = await response.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
      .slice(0, 12)
      .map((match, index) => {
        const item = match[1];
        return {
          id: `${index}-${field(item, 'guid') || field(item, 'link')}`,
          title: field(item, 'title'),
          url: field(item, 'link'),
          publishedAt: field(item, 'pubDate'),
          source: 'ESPN',
        };
      })
      .filter(item => item.title && item.url);

    return NextResponse.json({
      stories: items,
      source: 'ESPN NFL Headlines',
      refreshedAt: new Date().toISOString(),
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' },
    });
  } catch (error) {
    return NextResponse.json({ stories: [], error: 'NFL headlines are temporarily unavailable.' }, { status: 502 });
  }
}
