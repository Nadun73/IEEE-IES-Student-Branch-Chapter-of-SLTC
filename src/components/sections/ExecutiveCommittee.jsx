import { ArrowDown, UsersRound } from 'lucide-react';
import { executiveCommittee } from '../../data/siteContent.js';
import CommitteeMemberCard from '../ui/CommitteeMemberCard.jsx';
import SectionLabel from '../ui/SectionLabel.jsx';

export default function ExecutiveCommittee() {
  return (
    <section
      className="section section--light executive-committee"
      id="executive"
    >
      <div className="committee-grid-pattern" aria-hidden="true" />
      <div className="shell">
        <div className="section-intro section-intro--split" data-reveal>
          <div>
            <SectionLabel>Chapter leadership</SectionLabel>
            <h2>
              Executive
              <span> Committee.</span>
            </h2>
          </div>
          <div className="section-intro__copy">
            <p>
              Eight leadership roles working together to guide the chapter,
              coordinate its operations, and support its growing community.
            </p>
          </div>
        </div>

        <div className="executive-structure">
          <div className="executive-structure__label" data-reveal>
            <span>Row 01</span>
            <p>Chapter leadership</p>
            <UsersRound size={20} aria-hidden="true" />
          </div>

          <div className="executive-leadership-row">
            {executiveCommittee.leadership.map((member, index) => (
              <CommitteeMemberCard
                member={member}
                delay={index * 80}
                key={member.id}
              />
            ))}
          </div>

          <div className="executive-structure__label executive-structure__label--portfolios" data-reveal>
            <span>Rows 02—03</span>
            <p>Officers and their aligned assistants</p>
            <ArrowDown size={20} aria-hidden="true" />
          </div>

          <div className="executive-portfolio-grid">
            {executiveCommittee.portfolios.map((portfolio, index) => (
              <div
                className="executive-portfolio"
                role="group"
                aria-label={portfolio.label}
                key={portfolio.id}
              >
                <CommitteeMemberCard
                  member={portfolio.officer}
                  delay={index * 80}
                />
                <div className="executive-portfolio__connector" aria-hidden="true">
                  <span />
                  <small>supports</small>
                  <span />
                </div>
                <CommitteeMemberCard
                  member={portfolio.assistant}
                  assistant
                  delay={240 + index * 80}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
