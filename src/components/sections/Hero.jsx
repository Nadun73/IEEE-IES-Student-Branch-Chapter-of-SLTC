import { ArrowRight } from 'lucide-react';
import { chapterMetrics } from '../../data/siteContent.js';

export default function Hero() {
  return (
    <section className="hero" id="home">
      <div className="hero-grid-pattern" aria-hidden="true" />
      <div className="hero-beam hero-beam--one" aria-hidden="true" />
      <div className="hero-beam hero-beam--two" aria-hidden="true" />
      <div className="hero-orbit" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>

      <div className="shell hero__inner">
        <div className="hero-copy">
          <div className="hero-eyebrow">
            <span className="status-dot" />
            Ideas for intelligent industry.
          </div>
          <h1>
            <span className="hero-title__society">
              <strong>IEEE</strong> Industrial Electronics Society
            </span>{' '}
            <span className="hero-title__chapter">
              Student Branch Chapter of SLTC
            </span>
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
            <a className="button button--ghost" href="#albums">
              View photo albums
            </a>
          </div>

          <ul className="hero-metrics" aria-label="Chapter at a glance">
            {chapterMetrics.map(({ code, value, label }) => (
              <li className="hero-metric" key={code}>
                <span className="hero-metric__code" aria-hidden="true">
                  {code}
                </span>
                <strong className="hero-metric__value">{value}</strong>
                <span className="hero-metric__label">{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <a className="scroll-cue" href="#about" aria-label="Scroll to the about section">
        <span>Scroll to explore</span>
        <i aria-hidden="true" />
      </a>
    </section>
  );
}
