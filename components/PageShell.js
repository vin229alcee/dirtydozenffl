import Header from "./Header";
import ProfileExtras from "./ProfileExtras";
import { league } from "../data/league";

export default function PageShell({ title, kicker, children }) {
  return <>
    <div className="topline">{league.tagline}</div>
    <Header />
    <main className="pageWrap">
      <section className="pageHero compact">
        <div><span className="eyebrow">{kicker || league.season}</span><h1>{title}</h1></div>
      </section>
      {children}
      <ProfileExtras />
    </main>
    <footer><strong>DIRTY DOZENS <span>FFL</span></strong><small>{league.subtagline}</small></footer>
  </>;
}
