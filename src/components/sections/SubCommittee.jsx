import { subCommitteeHeads } from '../../data/siteContent.js';
import CommitteeMemberCard from '../ui/CommitteeMemberCard.jsx';
import SectionLabel from '../ui/SectionLabel.jsx';

export default function SubCommittee() {
  return (
    <section
      className="section section--ink subcommittee"
      id="subcommittee"
    >
      <div className="subcommittee-grid-pattern" aria-hidden="true" />
      <div className="shell">
        <div className="section-intro section-intro--split" data-reveal>
          <div>
            <SectionLabel light>Extended leadership</SectionLabel>
            <h2>
              Sub-
              <span>Committee.</span>
            </h2>
          </div>
          <div className="section-intro__copy">
            <p>
              Seven focused leadership roles that move membership, engagement,
              communication, programmes, visibility, and industry connections
              forward.
            </p>
          </div>
        </div>

        <div
          className="subcommittee-grid"
          role="list"
          aria-label="Sub-Committee heads"
        >
          {subCommitteeHeads.map((member, index) => (
            <CommitteeMemberCard
              member={member}
              variant="subcommittee"
              delay={index * 65}
              key={member.id}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
