import { ArrowRight, Cpu, Network, Workflow, Zap } from 'lucide-react';
import automationControlImage from '../../assets/focus/automation-control.jpg';
import connectedIndustryImage from '../../assets/focus/connected-industry.jpg';
import powerElectronicsImage from '../../assets/focus/power-electronics-energy.jpg';
import roboticsIntelligenceImage from '../../assets/focus/robotics-intelligent-systems.jpg';
import { focusAreas } from '../../data/siteContent.js';
import SectionLabel from '../ui/SectionLabel.jsx';

const focusIcons = {
  cpu: Cpu,
  network: Network,
  workflow: Workflow,
  zap: Zap,
};

const focusImages = {
  workflow: {
    src: automationControlImage,
    alt: 'An automated robotic arm, conveyor, sensor, and control unit.',
  },
  cpu: {
    src: roboticsIntelligenceImage,
    alt: 'An intelligent collaborative robot working with machine vision and embedded electronics.',
  },
  zap: {
    src: powerElectronicsImage,
    alt: 'A power converter with visible electronics, battery storage, and energy flow.',
  },
  network: {
    src: connectedIndustryImage,
    alt: 'Smart industrial machines connected through an industrial network gateway.',
  },
};

export default function FocusAreas() {
  return (
    <section className="section section--light focus" id="focus">
      <div className="shell">
        <div className="section-intro section-intro--split" data-reveal>
          <div>
            <SectionLabel>What we explore</SectionLabel>
            <h2>
              One chapter.
              <span> Many systems.</span>
            </h2>
          </div>
          <div className="section-intro__copy">
            <p>
              Industrial electronics lives at the intersection of hardware,
              intelligence, energy, and connected systems. These are the fields
              we are here to explore.
            </p>
          </div>
        </div>

        <div className="focus-grid">
          {focusAreas.map((area, index) => {
            const Icon = focusIcons[area.icon];
            const image = focusImages[area.icon];
            return (
              <article
                className="focus-card"
                data-reveal
                style={{ '--reveal-delay': `${index * 70}ms` }}
                key={area.number}
              >
                <div className="focus-card__header">
                  <span>{area.number}</span>
                  <div className="focus-card__icon">
                    <Icon size={24} strokeWidth={1.7} aria-hidden="true" />
                  </div>
                </div>
                <div className="focus-card__media">
                  <img src={image.src} alt={image.alt} decoding="async" />
                </div>
                <div className="focus-card__body">
                  <span className="focus-card__short">{area.shortTitle}</span>
                  <h3>{area.title}</h3>
                  <p>{area.description}</p>
                </div>
                <div className="focus-card__footer">
                  {area.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </article>
            );
          })}
        </div>

        <div className="systems-flow" data-reveal>
          <span className="systems-flow__label">A connected engineering loop</span>
          <div className="systems-flow__track">
            <div>
              <span>Sense</span>
              <small>01</small>
            </div>
            <ArrowRight aria-hidden="true" />
            <div>
              <span>Think</span>
              <small>02</small>
            </div>
            <ArrowRight aria-hidden="true" />
            <div>
              <span>Control</span>
              <small>03</small>
            </div>
            <ArrowRight aria-hidden="true" />
            <div>
              <span>Improve</span>
              <small>04</small>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
