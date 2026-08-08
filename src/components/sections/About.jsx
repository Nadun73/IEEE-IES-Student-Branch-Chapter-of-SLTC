import {
  ArrowRight,
  Award,
  CircuitBoard,
  Globe2,
  Target,
} from 'lucide-react';
import { chapterValues } from '../../data/siteContent.js';
import SectionLabel from '../ui/SectionLabel.jsx';

const chapterValueIcons = {
  award: Award,
  globe: Globe2,
  target: Target,
};

export default function About() {
  return (
    <section className="section section--light about" id="about">
      <div className="shell">
        <div className="section-intro section-intro--split" data-reveal>
          <div>
            <SectionLabel>The chapter</SectionLabel>
            <h2>
              Built for curious
              <span> engineers.</span>
            </h2>
          </div>
          <div className="section-intro__copy">
            <p>
              The IEEE Industrial Electronics Society Student Branch Chapter of
              SLTC brings together students who want to explore, learn, and
              collaborate around technologies used across modern industry.
            </p>
            <a className="about__learn-more" href="/chapter/">
              Learn more
              <ArrowRight size={17} aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="about-layout">
          <div className="about-visual" data-reveal>
            <div className="about-visual__topline">
              <span>SLTC / SRI LANKA</span>
              <span>STUDENT-LED</span>
            </div>
            <div className="about-visual__core">
              <span>IES</span>
              <div className="core-rings" aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
            </div>
            <div className="about-visual__caption">
              <CircuitBoard size={22} aria-hidden="true" />
              <p>
                Engineering knowledge that moves from the classroom into the
                systems around us.
              </p>
            </div>
          </div>

          <div className="value-stack">
            {chapterValues.map((value, index) => {
              const Icon = chapterValueIcons[value.icon];

              return (
                <article
                  className="value-item"
                  data-reveal
                  style={{ '--reveal-delay': `${index * 90}ms` }}
                  key={value.number}
                >
                  <span>{value.number}</span>
                  <div className="value-item__content">
                    <h3>{value.title}</h3>
                    <p>{value.text}</p>
                  </div>
                  <div
                    className={`value-item__icon value-item__icon--${value.icon}`}
                    aria-hidden="true"
                  >
                    <Icon size={25} strokeWidth={1.7} />
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>

      <div className="chapter-name-rail" aria-label="Official chapter name">
        <div>
          <span>IEEE Industrial Electronics Society</span>
          <i />
          <span>Student Branch Chapter of SLTC</span>
          <i />
          <span>Engineering for intelligent industry</span>
          <i />
        </div>
      </div>
    </section>
  );
}
