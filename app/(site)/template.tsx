/**
 * Each page arrives with a short lift-and-focus, so navigating feels continuous. Played by CSS (site.css:
 * s-page-enter) from the first paint; the template remounts on every navigation, so the entrance plays each time.
 */
export default function SiteTemplate({ children }: { children: React.ReactNode }) {
  return <div className="s-page-enter">{children}</div>;
}
