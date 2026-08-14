import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  CircuitBoard,
  Cpu,
  Globe2,
  Network,
  Target,
  UsersRound,
  Workflow,
  Zap,
} from 'lucide-react';
import {
  activityTypes,
  chapterValues,
  focusAreas,
} from '../../data/siteContent.js';
import SectionLabel from '../ui/SectionLabel.jsx';

const chapterLayers = [
  {
    number: '01',
    title: 'IEEE',
    label: 'The wider community',
    text: 'A professional community connecting people around electrical, electronic, and computing technologies.',
    icon: Globe2,
  },
  {
    number: '02',
    title: 'Industrial Electronics Society',
    label: 'The technical home',
    text: 'The IEEE society focused on the electronics, control, automation, energy, and intelligent systems used across modern industry.',
    icon: CircuitBoard,
  },
  {
    number: '03',
    title: 'Student Branch Chapter of SLTC',
    label: 'The local chapter',
    text: 'A student-led space at SLTC that brings those ideas into learning, collaboration, and practical engineering.',
    icon: UsersRound,
  },
];

const valueIcons = {
  award: Award,
  globe: Globe2,
  target: Target,
};

const focusIcons = {
  workflow: Workflow,
  cpu: Cpu,
  zap: Zap,
  network: Network,
};

const activityIcons = {
  bookOpen: BookOpen,
  circuitBoard: CircuitBoard,
  users: UsersRound,
};

const chapterLinks = [
  {
    number: '01',
    title: 'Who we are',
    description: 'Read the chapter name in three connected parts.',
    href: '#chapter-identity',
  },
  {
    number: '02',
    title: 'Why we exist',
    description: 'See the mission and purpose behind the community.',
    href: '#chapter-purpose',
  },
  {
    number: '03',
    title: 'How students engage',
    description: 'Discover how learning becomes shared practice.',
    href: '#chapter-experience',
  },
];

export default function ChapterOverview() {
  return (
    <>
      <section className="chapter-page-hero" id="chapter-home">
        <div className="chapter-page-hero__grid" aria-hidden="true" />
        <div
          className="chapter-page-hero__orbit chapter-page-hero__orbit--blue"
          aria-hidden="true"
        />
        <div
          className="chapter-page-hero__orbit chapter-page-hero__orbit--orange"
          aria-hidden="true"
        />

        <div className="shell chapter-page-hero__inner">
          <div className="chapter-page-hero__copy" data-reveal>
            <a className="chapter-page-hero__back" href="/#about">
              <ArrowLeft size={15} aria-hidden="true" />
              Back to the chapter section
            </a>

            <div className="chapter-page-hero__eyebrow">
              <CircuitBoard size={16} aria-hidden="true" />
              The chapter / SLTC
            </div>

            <h1>
              <span>What is</span>{' '}
              IEEE Industrial Electronics Society{' '}
              <strong>Student Branch Chapter of SLTC?</strong>
            </h1>

            <p>
              The IEEE Industrial Electronics Society Student Branch Chapter of
              SLTC brings together students who want to explore, learn, and
              collaborate around technologies used across modern industry.
            </p>
          </div>

          <nav
            className="chapter-page-hero__links"
            aria-label="Explore this chapter introduction"
            data-reveal
          >
            {chapterLinks.map((link) => (
              <a href={link.href} key={link.href}>
                <span>{link.number}</span>
                <div>
                  <strong>{link.title}</strong>
                  <small>{link.description}</small>
                </div>
                <ArrowDownRight size={20} aria-hidden="true" />
              </a>
            ))}
          </nav>
        </div>
      </section>

      <section
        className="section section--light chapter-page-identity"
        id="chapter-identity"
      >
        <div className="shell">
          <div className="section-intro section-intro--split" data-reveal>
            <div>
              <SectionLabel>Chapter identity</SectionLabel>
              <h2>
                One name. Three
                <span> connected parts.</span>
              </h2>
            </div>
            <div className="section-intro__copy">
              <p>
                The full chapter name describes the wider community, its
                technical focus, and the student-led space that brings both to
                life at SLTC.
              </p>
            </div>
          </div>

          <div className="chapter-page-layers">
            {chapterLayers.map((layer, index) => {
              const Icon = layer.icon;

              return (
                <article
                  className="chapter-page-layer"
                  data-reveal
                  style={{ '--reveal-delay': `${index * 90}ms` }}
                  key={layer.number}
                >
                  <div className="chapter-page-layer__topline">
                    <span>{layer.number}</span>
                    <Icon size={24} strokeWidth={1.55} aria-hidden="true" />
                  </div>
                  <div>
                    <span>{layer.label}</span>
                    <h3>{layer.title}</h3>
                    <p>{layer.text}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section
        className="section section--paper chapter-page-purpose"
        id="chapter-purpose"
      >
        <div className="shell">
          <div className="section-intro section-intro--split" data-reveal>
            <div>
              <SectionLabel>Why the chapter exists</SectionLabel>
              <h2>
                A student-led space for
                <span> curious engineers.</span>
              </h2>
            </div>
            <div className="section-intro__copy">
              <p>
                In simple terms, this is the IEEE IES community at SLTC: a
                place to explore industrial electronics, learn with others,
                turn ideas into practical work, and connect beyond the
                classroom.
              </p>
            </div>
          </div>

          <div className="chapter-page-purpose__layout">
            <article className="chapter-page-definition" data-reveal>
              <div className="chapter-page-definition__topline">
                <span>IES / SLTC</span>
                <span>Student-led</span>
              </div>
              <div className="chapter-page-definition__mark" aria-hidden="true">
                <span>IES</span>
                <i />
                <i />
                <i />
              </div>
              <p>
                Engineering knowledge that moves from the classroom into the
                systems around us.
              </p>
            </article>

            <div className="chapter-page-values">
              {chapterValues.map((value, index) => {
                const Icon = valueIcons[value.icon];

                return (
                  <article
                    className="chapter-page-value"
                    data-reveal
                    style={{ '--reveal-delay': `${index * 90}ms` }}
                    key={value.number}
                  >
                    <span>{value.number}</span>
                    <div>
                      <h3>{value.title}</h3>
                      <p>{value.text}</p>
                    </div>
                    <Icon size={24} strokeWidth={1.6} aria-hidden="true" />
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="section section--ink chapter-page-focus" id="chapter-focus">
        <div className="shell">
          <div className="section-intro section-intro--split" data-reveal>
            <div>
              <SectionLabel light>What we explore</SectionLabel>
              <h2>
                Ideas behind
                <span> intelligent industry.</span>
              </h2>
            </div>
            <div className="section-intro__copy">
              <p>
                The chapter connects students with four broad areas where
                electronics, intelligence, energy, and communication meet real
                industrial systems.
              </p>
              <a href="/albums/">
                See the chapter in action
                <ArrowRight size={17} aria-hidden="true" />
              </a>
            </div>
          </div>

          <div className="chapter-page-focus__grid">
            {focusAreas.map((area, index) => {
              const Icon = focusIcons[area.icon];

              return (
                <article
                  className="chapter-page-focus__item"
                  data-reveal
                  style={{ '--reveal-delay': `${index * 70}ms` }}
                  key={area.number}
                >
                  <span>{area.number}</span>
                  <Icon size={27} strokeWidth={1.5} aria-hidden="true" />
                  <h3>{area.title}</h3>
                  <p>{area.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section
        className="section section--light chapter-page-experience"
        id="chapter-experience"
      >
        <div className="shell">
          <div className="section-intro section-intro--split" data-reveal>
            <div>
              <SectionLabel>The chapter experience</SectionLabel>
              <h2>
                Learn. Build.
                <span> Connect.</span>
              </h2>
            </div>
            <div className="section-intro__copy">
              <p>
                The chapter is designed as an active learning space where
                technical curiosity can grow into practical confidence and
                shared progress.
              </p>
            </div>
          </div>

          <div className="chapter-page-experience__grid">
            {activityTypes.map((activity, index) => {
              const Icon = activityIcons[activity.icon];

              return (
                <article
                  className="chapter-page-experience__item"
                  data-reveal
                  style={{ '--reveal-delay': `${index * 90}ms` }}
                  key={activity.title}
                >
                  <div className="chapter-page-experience__topline">
                    <span>0{index + 1}</span>
                    <Icon size={26} strokeWidth={1.5} aria-hidden="true" />
                  </div>
                  <span>{activity.kicker}</span>
                  <h3>{activity.title}</h3>
                  <p>{activity.description}</p>
                </article>
              );
            })}
          </div>

          <div className="chapter-page-cta" data-reveal>
            <div>
              <span>Continue exploring</span>
              <h2>Meet the people behind the chapter.</h2>
            </div>
            <div className="chapter-page-cta__actions">
              <a href="/masterminds/">
                Meet the Masterminds
                <ArrowRight size={17} aria-hidden="true" />
              </a>
              <a href="/#connect">
                Contact the chapter
                <ArrowRight size={17} aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
