import Link from "next/link";

const links = [
  ["/", "Home"],
  ["/teams", "Teams"],
  ["/matchups", "Matchups"],
  ["/standings", "Standings"],
  ["/power-rankings", "Power Rankings"],
  ["/recap", "Recap"],
  ["/analytics", "Analytics"],
  ["/history", "History"],
  ["/records", "Records"],
  ["/news", "News"],
  ["/rules", "Rules"],
];

export default function Header() {
  return (
    <header className="siteHeader">
      <div className="headerInner">
        <Link href="/" className="brand" aria-label="Dirty Dozens FFL home">
          <span className="brandShield">DD</span>
          <span><strong>DIRTY DOZENS</strong><em>FFL</em></span>
        </Link>
        <nav className="nav" aria-label="Main navigation">
          {links.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
      </div>
    </header>
  );
}
