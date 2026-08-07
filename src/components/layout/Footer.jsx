import { ArrowUp } from 'lucide-react';
import iesLogoWhite from '../../assets/ies-logo-white-web.png';
import { navItems } from '../../data/siteContent.js';

export default function Footer({ topHref = '#home' }) {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="shell">
        <div className="footer-main">
          <div className="footer-brand">
            <img
              src={iesLogoWhite}
              alt="IEEE Industrial Electronics Society Student Branch Chapter of SLTC"
            />
            <p>
              A student-led community exploring the technologies behind
              intelligent industry.
            </p>
          </div>

          <div className="footer-nav">
            <span>Explore</span>
            {navItems.map((item) => (
              <a href={item.href} key={item.href}>
                {item.label}
              </a>
            ))}
          </div>

          <div className="footer-note">
            <span>Chapter</span>
            <p>
              IEEE Industrial Electronics Society Student Branch Chapter of
              SLTC
            </p>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© {year} IEEE IES Student Branch Chapter of SLTC</span>
          <a href={topHref}>
            Back to top
            <ArrowUp size={15} aria-hidden="true" />
          </a>
        </div>
      </div>
    </footer>
  );
}
