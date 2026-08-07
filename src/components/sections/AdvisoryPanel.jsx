import { advisoryPanelMembers } from '../../data/siteContent.js';
import CommitteeMemberCard from '../ui/CommitteeMemberCard.jsx';
import SectionLabel from '../ui/SectionLabel.jsx';

export default function AdvisoryPanel() {
  return (
    <section className="section section--paper advisory-panel" id="advisory">
      <div className="advisory-panel__grid" aria-hidden="true" />
      <div className="shell">
        <div className="section-intro section-intro--split" data-reveal>
          <div>
            <SectionLabel>Chapter guidance</SectionLabel>
            <h2>
              Advisory
              <span> Panel.</span>
            </h2>
          </div>
          <div className="section-intro__copy">
            <p>
              Academic and student advisors bringing experience, continuity,
              and thoughtful guidance to the chapter&apos;s direction.
            </p>
          </div>
        </div>

        <div
          className="advisory-panel__members"
          role="list"
          aria-label="Advisory Panel members"
        >
          {advisoryPanelMembers.map((member, index) => (
            <CommitteeMemberCard
              member={member}
              variant="advisory"
              delay={index * 80}
              key={member.id}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
