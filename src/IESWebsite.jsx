import { ArrowUp } from 'lucide-react';
import Header from './components/layout/Header.jsx';
import Footer from './components/layout/Footer.jsx';
import About from './components/sections/About.jsx';
import Activities from './components/sections/Activities.jsx';
import Connect from './components/sections/Connect.jsx';
import FocusAreas from './components/sections/FocusAreas.jsx';
import Hero from './components/sections/Hero.jsx';
import MastermindsHero from './components/sections/MastermindsHero.jsx';
import LoadingScreen from './components/ui/LoadingScreen.jsx';
import usePageSignals from './hooks/usePageSignals.js';
import useRevealOnScroll from './hooks/useRevealOnScroll.js';

export default function IESWebsite() {
  const { activeSection, isScrolled, showScrollTop, scrollProgress } =
    usePageSignals();
  useRevealOnScroll();

  return (
    <>
      <LoadingScreen />

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
          <Hero />
          <About />
          <FocusAreas />
          <Activities />
          <MastermindsHero embedded />
          <Connect />
        </main>

        <Footer />

        <a
          className={`back-to-top ${showScrollTop ? 'is-visible' : ''}`}
          href="#home"
          aria-label="Back to top"
        >
          <ArrowUp size={18} aria-hidden="true" />
        </a>
      </div>
    </>
  );
}
