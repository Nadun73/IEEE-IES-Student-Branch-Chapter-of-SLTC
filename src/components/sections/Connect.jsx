import { ExternalLink } from 'lucide-react';
import SectionLabel from '../ui/SectionLabel.jsx';

export default function Connect() {
  return (
    <section className="connect" id="connect">
      <div className="connect-grid" aria-hidden="true" />
      <div className="shell connect__inner" data-reveal>
        <div className="connect__number">IES / 01</div>
        <div className="connect__copy">
          <SectionLabel>Be part of it</SectionLabel>
          <h2>
            Ready to engineer
            <span> what&apos;s next?</span>
          </h2>
          <p>
            Learn, contribute, and connect with the technologies and people
            shaping intelligent industry.
          </p>
        </div>
        <div className="connect__actions">
          <a
            className="button button--navy"
            href="https://www.ieee-ies.org/"
            target="_blank"
            rel="noreferrer"
          >
            Explore IEEE IES
            <ExternalLink size={17} aria-hidden="true" />
          </a>
          <span>Official chapter contact channels will be added soon.</span>
        </div>
      </div>
    </section>
  );
}
