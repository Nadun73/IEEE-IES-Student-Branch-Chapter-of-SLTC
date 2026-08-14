import { UserRoundPlus } from 'lucide-react';

export default function VolunteerCallout() {
  return (
    <section
      className="section section--paper volunteer-callout"
      id="volunteer"
      aria-labelledby="volunteer-callout-title"
    >
      <div className="shell">
        <a
          className="programme-panel"
          href="/volunteer/"
          aria-label="Become a Volunteer — open application"
          data-reveal
        >
          <UserRoundPlus
            className="programme-panel__watermark"
            strokeWidth={0.85}
            aria-hidden="true"
          />
          <div className="programme-panel__graphic" aria-hidden="true">
            <span className="programme-orbit programme-orbit--one" />
            <span className="programme-orbit programme-orbit--two" />
            <UserRoundPlus />
          </div>
          <div className="programme-panel__content">
            <div className="programme-status">
              <span />
              Join the chapter team
            </div>
            <h2 className="programme-panel__title" id="volunteer-callout-title">
              Become a Volunteer
            </h2>
            <p>
              Bring your ideas, energy, and skills to the people behind our
              events, projects, and growing IEEE IES community.
            </p>
          </div>
          <div className="programme-panel__index" aria-hidden="true">
            <span>JOIN</span>
            <strong>→</strong>
          </div>
        </a>
      </div>
    </section>
  );
}
