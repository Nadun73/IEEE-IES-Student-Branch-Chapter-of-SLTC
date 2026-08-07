import { UserRound } from 'lucide-react';

export default function CommitteeMemberCard({
  member,
  variant = 'executive',
  assistant = false,
  delay = 0,
}) {
  const roleLabel =
    variant === 'advisory'
      ? 'Advisory role'
      : variant === 'subcommittee'
        ? 'Head role'
        : assistant
          ? 'Assistant role'
          : 'Leadership role';

  return (
    <article
      className={[
        'committee-member-card',
        `committee-member-card--${variant}`,
        assistant ? 'committee-member-card--assistant' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-reveal
      role={
        variant === 'advisory' || variant === 'subcommittee'
          ? 'listitem'
          : undefined
      }
      style={{ '--reveal-delay': `${delay}ms` }}
    >
      <div
        className={[
          'committee-member-card__portrait',
          member.image ? 'has-image' : 'is-placeholder',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="committee-member-card__topline">
          <span>{member.number}</span>
          <span>{member.cardLabel ?? roleLabel}</span>
        </div>

        {member.image ? (
          <img
            src={member.image}
            alt={member.name ?? member.role}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <UserRound aria-hidden="true" strokeWidth={1.35} />
        )}
        <span aria-hidden="true" />
      </div>

      <div className="committee-member-card__content">
        <span>{member.role}</span>
        <h3>{member.name ?? 'Member details coming soon'}</h3>
        {member.details?.length ? (
          <div className="committee-member-card__details">
            {member.details.map((detail) => (
              <p key={detail}>{detail}</p>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
