import { ArrowRight } from 'lucide-react';
import HeroVisual from './HeroVisual.jsx';

export default function Hero() {
  return (
    <section className="hero" id="home">
      <div className="hero-grid-pattern" aria-hidden="true" />
      <div className="hero-beam hero-beam--one" aria-hidden="true" />
      <div className="hero-beam hero-beam--two" aria-hidden="true" />

      <div className="shell hero__inner">
        <div className="hero-copy">
          <div className="hero-eyebrow">
            <span className="status-dot" />
            IEEE Industrial Electronics Society
          </div>
          <h1>
            Ideas for
            <span> intelligent industry.</span>
          </h1>
          <p>
            A home for SLTC students exploring industrial electronics,
            automation, intelligent systems, and the technologies shaping modern
            industry.
          </p>
          <div className="hero-actions">
            <a className="button button--orange" href="#about">
              Discover the chapter
              <ArrowRight size={18} aria-hidden="true" />
            </a>
            <a className="button button--ghost" href="#focus">
              Explore focus areas
            </a>
          </div>

          <div className="hero-principles" aria-label="Chapter principles">
            <span>Learn</span>
            <i />
            <span>Build</span>
            <i />
            <span>Connect</span>
          </div>
        </div>

        <HeroVisual />
      </div>

      <a className="scroll-cue" href="#about" aria-label="Scroll to the about section">
        <span>Scroll to explore</span>
        <i aria-hidden="true" />
      </a>
    </section>
  );
}
