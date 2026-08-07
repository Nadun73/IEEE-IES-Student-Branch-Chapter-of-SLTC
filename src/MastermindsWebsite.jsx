import { ArrowUp } from 'lucide-react';
import Footer from './components/layout/Footer.jsx';
import Header from './components/layout/Header.jsx';
import AdvisoryPanel from './components/sections/AdvisoryPanel.jsx';
import ExecutiveCommittee from './components/sections/ExecutiveCommittee.jsx';
import MastermindsHero from './components/sections/MastermindsHero.jsx';
import SubCommittee from './components/sections/SubCommittee.jsx';
import usePageSignals from './hooks/usePageSignals.js';
import useRevealOnScroll from './hooks/useRevealOnScroll.js';

export default function MastermindsWebsite() {
  const { activeSection, isScrolled, showScrollTop, scrollProgress } =
    usePageSignals();
  useRevealOnScroll();

  return (
    <div className="site">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <Header
        activeSection={activeSection}
        isScrolled={isScrolled}
        scrollProgress={scrollProgress}
      />

      <main id="main-content">
        <MastermindsHero />
        <AdvisoryPanel />
        <ExecutiveCommittee />
        <SubCommittee />
      </main>

      <Footer topHref="#masterminds-home" />

      <a
        className={`back-to-top ${showScrollTop ? 'is-visible' : ''}`}
        href="#masterminds-home"
        aria-label="Back to top"
      >
        <ArrowUp size={18} aria-hidden="true" />
      </a>
    </div>
  );
}
