import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  UsersRound,
} from 'lucide-react';

const mastermindGroups = [
  {
    number: '01',
    title: 'Advisory Panel',
    description: 'Chapter guidance and perspective.',
    href: '#advisory',
  },
  {
    number: '02',
    title: 'Executive Committee',
    description: 'The team guiding chapter operations.',
    href: '#executive',
  },
  {
    number: '03',
    title: 'Sub-Committee',
    description: 'Focused heads extending the chapter.',
    href: '#subcommittee',
  },
];

export default function MastermindsHero({ embedded = false }) {
  const Heading = embedded ? 'h2' : 'h1';
  const sectionId = embedded ? 'masterminds-preview' : 'masterminds-home';

  return (
    <section
      className={`masterminds-hero ${
        embedded ? 'masterminds-hero--embedded' : ''
      }`}
      id={sectionId}
    >
      <div className="masterminds-hero__grid" aria-hidden="true" />
      <div
        className="masterminds-hero__orb masterminds-hero__orb--blue"
        aria-hidden="true"
      />
      <div
        className="masterminds-hero__orb masterminds-hero__orb--orange"
        aria-hidden="true"
      />

      <div className="shell masterminds-hero__inner">
        <div className="masterminds-hero__copy" data-reveal>
          {embedded ? (
            <a
              className="masterminds-hero__back masterminds-hero__back--forward"
              href="/masterminds/"
            >
              Explore the full Masterminds page
              <ArrowRight size={15} aria-hidden="true" />
            </a>
          ) : (
            <a className="masterminds-hero__back" href="/#home">
              <ArrowLeft size={15} aria-hidden="true" />
              Back to the main page
            </a>
          )}

          <div className="masterminds-hero__eyebrow">
            <UsersRound size={16} aria-hidden="true" />
            The people behind the chapter
          </div>

          <Heading>
            Meet the
            <span> Masterminds.</span>
          </Heading>

          <p>
            Explore the advisory, executive, and focused leadership teams that
            guide the IEEE IES Student Branch Chapter of SLTC.
          </p>
        </div>

        <nav
          className="masterminds-hero__links"
          aria-label={
            embedded
              ? 'Open Masterminds team sections'
              : 'Masterminds page sections'
          }
          data-reveal
        >
          {mastermindGroups.map((group) => (
            <a
              href={embedded ? `/masterminds/${group.href}` : group.href}
              key={group.href}
            >
              <span>{group.number}</span>
              <div>
                <strong>{group.title}</strong>
                <small>{group.description}</small>
              </div>
              <ArrowDownRight size={20} aria-hidden="true" />
            </a>
          ))}
        </nav>
      </div>
    </section>
  );
}
