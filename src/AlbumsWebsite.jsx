import { ArrowUp } from 'lucide-react';
import Footer from './components/layout/Footer.jsx';
import Header from './components/layout/Header.jsx';
import PhotoAlbumsArchive from './components/sections/PhotoAlbumsArchive.jsx';
import LoadingScreen from './components/ui/LoadingScreen.jsx';
import usePageSignals from './hooks/usePageSignals.js';
import useRevealOnScroll from './hooks/useRevealOnScroll.js';

export default function AlbumsWebsite() {
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
          <PhotoAlbumsArchive />
        </main>

        <Footer topHref="#albums-home" />

        <a
          className={`back-to-top ${showScrollTop ? 'is-visible' : ''}`}
          href="#albums-home"
          aria-label="Back to top"
        >
          <ArrowUp size={18} aria-hidden="true" />
        </a>
      </div>
    </>
  );
}

