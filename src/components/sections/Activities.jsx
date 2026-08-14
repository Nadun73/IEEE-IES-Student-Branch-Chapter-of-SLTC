import ieeeIesDayLogo from '../../assets/events/ieee-ies-day.png';
import siliconPulseLogo from '../../assets/events/silicon-pulse.png';
import sriLankaArduinoChallengeLogo from '../../assets/events/sri-lanka-arduino-challenge.png';
import { flagshipEvents } from '../../data/siteContent.js';
import SectionLabel from '../ui/SectionLabel.jsx';

const eventLogos = {
  'ieee-ies-day': ieeeIesDayLogo,
  'silicon-pulse': siliconPulseLogo,
  'sri-lanka-arduino-challenge': sriLankaArduinoChallengeLogo,
};

export default function Activities() {
  return (
    <section className="section section--paper activities" id="activities">
      <div className="shell">
        <div className="activities-heading" data-reveal>
          <SectionLabel>Signature events</SectionLabel>
          <h2>
            Our
            <span> Flagship Events.</span>
          </h2>
          <p>
            Three signature programmes spanning Arduino innovation, analog
            electronics, and the global IEEE IES community.
          </p>
        </div>

        <div className="activity-grid">
          {flagshipEvents.map((event, index) => {
            const logo = eventLogos[event.logo];
            return (
              <article
                className={`activity-card activity-card--${event.accent}`}
                data-reveal
                style={{ '--reveal-delay': `${index * 90}ms` }}
                key={event.title}
              >
                <img
                  className={`activity-card__watermark activity-card__watermark--${event.logo}`}
                  src={logo}
                  alt=""
                  aria-hidden="true"
                  decoding="async"
                />
                <div className="activity-card__number">0{index + 1}</div>
                <div className="activity-card__graphic" aria-hidden="true">
                  <img
                    className={`activity-card__logo activity-card__logo--${event.logo}`}
                    src={logo}
                    alt=""
                    decoding="async"
                  />
                  <span />
                  <span />
                </div>
                <div className="activity-card__content">
                  <span>{event.kicker}</span>
                  <h3>{event.title}</h3>
                  <p>{event.description}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
