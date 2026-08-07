import { BookOpen, CircuitBoard, Factory, Users } from 'lucide-react';
import { activityTypes } from '../../data/siteContent.js';
import SectionLabel from '../ui/SectionLabel.jsx';

const activityIcons = {
  bookOpen: BookOpen,
  circuitBoard: CircuitBoard,
  users: Users,
};

export default function Activities() {
  return (
    <section className="section section--paper activities" id="activities">
      <div className="shell">
        <div className="activities-heading" data-reveal>
          <SectionLabel>Chapter experience</SectionLabel>
          <h2>
            Learn it. Build it.
            <span> Share it.</span>
          </h2>
          <p>
            The chapter is designed as an active learning space—one where
            technical curiosity becomes practical confidence and shared progress.
          </p>
        </div>

        <div className="activity-grid">
          {activityTypes.map((activity, index) => {
            const Icon = activityIcons[activity.icon];
            return (
              <article
                className={`activity-card activity-card--${activity.accent}`}
                data-reveal
                style={{ '--reveal-delay': `${index * 90}ms` }}
                key={activity.title}
              >
                <div className="activity-card__number">0{index + 1}</div>
                <div className="activity-card__graphic" aria-hidden="true">
                  <Icon size={42} strokeWidth={1.35} />
                  <span />
                  <span />
                </div>
                <div className="activity-card__content">
                  <span>{activity.kicker}</span>
                  <h3>{activity.title}</h3>
                  <p>{activity.description}</p>
                </div>
              </article>
            );
          })}
        </div>

        <div className="programme-panel" data-reveal>
          <div className="programme-panel__graphic" aria-hidden="true">
            <span className="programme-orbit programme-orbit--one" />
            <span className="programme-orbit programme-orbit--two" />
            <Factory />
          </div>
          <div className="programme-panel__content">
            <div className="programme-status">
              <span />
              Programme calendar in preparation
            </div>
            <h3>What&apos;s ahead</h3>
            <p>
              Talks, workshops, projects, and chapter initiatives will appear
              here as soon as the first programme line-up is confirmed.
            </p>
          </div>
          <div className="programme-panel__index" aria-hidden="true">
            <span>NEXT</span>
            <strong>→</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
