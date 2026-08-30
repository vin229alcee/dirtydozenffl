import Link from "next/link";

const primaryLinks = [
  ["/", "Home"],
  ["/teams", "Teams"],
  ["/matchups", "Matchups"],
  ["/standings", "Standings"],
  ["/power-rankings", "Power Rankings"],
  ["/pick-em", "Weekly Pick 'Em"],
];

const moreLinks = [
  ["/manager", "Manager HQ"],
  ["/trash-talk", "Trash Talk"],
  ["/playoff-race", "Playoff Race"],
  ["/recap", "Recap"],
  ["/awards", "Awards"],
  ["/hall-of-fame", "Hall of Fame"],
  ["/rivalries", "Rivalries"],
  ["/analytics", "Analytics"],
  ["/history", "History"],
  ["/records", "Records"],
  ["/news", "News"],
  ["/rules", "Rules"],
];

const allLinks = [...primaryLinks, ...moreLinks];

export default function Header() {
  return (
    <header className="siteHeader">
      <div className="headerInner">
        <Link href="/" className="brand" aria-label="Dirty Dozens FFL home">
          <span className="brandShield">DD</span>
          <span><strong>DIRTY DOZENS</strong><em>FFL</em></span>
        </Link>

        <nav className="nav desktopNav" aria-label="Main navigation">
          {primaryLinks.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
          <details className="navMenu">
            <summary>More <span aria-hidden="true">▾</span></summary>
            <div className="navMenuPanel">
              {moreLinks.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
            </div>
          </details>
        </nav>

        <nav className="mobileNav" aria-label="Mobile navigation">
          <details className="mobileMenu">
            <summary>Menu <span aria-hidden="true">▾</span></summary>
            <div className="mobileMenuPanel">
              {allLinks.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
            </div>
          </details>
        </nav>
      </div>
    </header>
  );
}
