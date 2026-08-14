import { useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  Mail,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UserRoundPlus,
  UsersRound,
} from 'lucide-react';
import { chapterContact } from '../../data/siteContent.js';

const contributionAreas = [
  'Event planning & logistics',
  'Technical & programme',
  'Marketing & communications',
  'Design, photo & video',
  'Sponsorships & partnerships',
  'Registration & attendee support',
  'Web & IT',
];

const iesEvents = [
  'Sri Lanka Arduino Challenge',
  'Silicon Pulse',
  'IEEE IES Day',
  'IES Industry Visit',
  'Engineering Beyond GPA',
];

const yearOptions = [
  'Foundation',
  'Year 1',
  'Year 2',
  'Year 3',
  'Year 4',
  'DAIT',
];

const ieeeStatusOptions = [
  'IEEE Student Member',
  'IEEE Member',
  'Planning to join IEEE',
  'Not currently an IEEE member',
];

const valueFrom = (formData, name, fallback = 'Not provided') => {
  const value = String(formData.get(name) ?? '').trim();
  return value || fallback;
};

const prepareApplication = (form) => {
  const formData = new FormData(form);
  const firstName = valueFrom(formData, 'firstName', '');
  const lastName = valueFrom(formData, 'lastName', '');
  const fullName = `${firstName} ${lastName}`.trim();
  const interests = formData
    .getAll('interests')
    .map((interest) => String(interest).trim())
    .filter(Boolean);
  const subject = `IEEE IES SLTC - Volunteer application - ${fullName}`;
  const body = [
    'Hello IEEE IES Student Branch Chapter of SLTC,',
    '',
    'I would like to apply as a chapter volunteer.',
    '',
    'ABOUT ME',
    `Name: ${fullName}`,
    `Email: ${valueFrom(formData, 'email')}`,
    `Mobile / WhatsApp: ${valueFrom(formData, 'phone')}`,
    '',
    'ACADEMIC PROFILE',
    `Institution / organisation: ${valueFrom(formData, 'institution')}`,
    `Programme / field of study: ${valueFrom(formData, 'programme')}`,
    `Current year / stage: ${valueFrom(formData, 'yearOfStudy')}`,
    `IEEE membership status: ${valueFrom(formData, 'ieeeStatus')}`,
    `IEEE member number: ${valueFrom(formData, 'ieeeMemberNumber')}`,
    '',
    'PREFERRED IES EVENT',
    valueFrom(formData, 'preferredEvent'),
    '',
    'HOW I WOULD LIKE TO CONTRIBUTE',
    ...interests.map((interest) => `- ${interest}`),
    '',
    'MOTIVATION AND RELEVANT SKILLS',
    valueFrom(formData, 'motivation'),
    '',
    'PREVIOUS VOLUNTEERING / PROJECT EXPERIENCE',
    valueFrom(formData, 'experience'),
    '',
    `Portfolio or profile link: ${valueFrom(formData, 'portfolio')}`,
    '',
    'AVAILABILITY',
    `Weekly commitment: ${valueFrom(formData, 'weeklyCommitment')}`,
    `Availability notes: ${valueFrom(formData, 'availabilityNotes')}`,
    '',
    'I confirm that these details are accurate and give the chapter permission to contact me about volunteering.',
    '',
    'Thank you.',
  ].join('\n');

  return { body, subject };
};

export default function VolunteerApplication() {
  const [status, setStatus] = useState('');
  const [interestError, setInterestError] = useState('');
  const interestsRef = useRef(null);

  const hasSelectedInterest = () =>
    Boolean(interestsRef.current?.querySelector('input:checked'));

  const validateForm = (form) => {
    const firstNativeInvalid = form.querySelector(
      'input:invalid, select:invalid, textarea:invalid',
    );
    const firstInterest = interestsRef.current?.querySelector(
      'input[name="interests"]',
    );
    const interestsComeBeforeNativeError = Boolean(
      firstNativeInvalid &&
        (firstInterest?.compareDocumentPosition(firstNativeInvalid) &
          Node.DOCUMENT_POSITION_FOLLOWING),
    );

    if (
      !hasSelectedInterest() &&
      (!firstNativeInvalid || interestsComeBeforeNativeError)
    ) {
      const message = 'Choose at least one area where you would like to help.';
      setInterestError(message);
      setStatus(message);
      interestsRef.current?.querySelector('input')?.focus();
      return false;
    }

    if (firstNativeInvalid) {
      setStatus('Complete the required fields before submitting the form.');
      form.reportValidity();
      return false;
    }

    setInterestError('');
    return true;
  };

  const handleInterestChange = () => {
    if (hasSelectedInterest()) {
      setInterestError('');
      setStatus('');
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!validateForm(event.currentTarget)) {
      return;
    }

    const { body, subject } = prepareApplication(event.currentTarget);

    setInterestError('');
    setStatus(
      'Opening your email app. Review and send the prepared message to complete your application.',
    );
    window.location.href = `mailto:${chapterContact.email}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
  };

  const handleReset = (event) => {
    if (!window.confirm('Clear all information entered in this form?')) {
      event.preventDefault();
      setStatus('Form clearing cancelled.');
      return;
    }

    const firstNameField = event.currentTarget.elements.namedItem('firstName');

    setInterestError('');
    setStatus('Form cleared.');

    window.requestAnimationFrame(() => {
      firstNameField?.focus();
    });
  };

  return (
    <section
      className="volunteer-page"
      id="volunteer-home"
      aria-labelledby="volunteer-title"
    >
      <div className="volunteer-page__grid" aria-hidden="true" />
      <div
        className="volunteer-page__orbit volunteer-page__orbit--blue"
        aria-hidden="true"
      />
      <div
        className="volunteer-page__orbit volunteer-page__orbit--orange"
        aria-hidden="true"
      />
      <UserRoundPlus
        className="volunteer-page__watermark"
        strokeWidth={0.65}
        aria-hidden="true"
      />

      <div className="shell volunteer-page__layout">
        <div className="volunteer-page__intro" data-reveal>
          <a className="volunteer-page__back" href="/#volunteer">
            <ArrowLeft size={17} aria-hidden="true" />
            Back to volunteer overview
          </a>

          <div className="volunteer-page__eyebrow">
            <span aria-hidden="true" />
            Volunteer application / chapter team
          </div>

          <h1 id="volunteer-title">
            Become a
            <span> Volunteer.</span>
          </h1>
          <p>
            Bring your ideas, energy, and skills to the student team behind our
            events, projects, and growing IEEE IES community.
          </p>

          <ul className="volunteer-page__benefits" aria-label="Why volunteer">
            <li>
              <span aria-hidden="true">
                <UsersRound size={18} />
              </span>
              <div>
                <strong>Work with a student-led team</strong>
                <small>Collaborate across events and chapter initiatives.</small>
              </div>
            </li>
            <li>
              <span aria-hidden="true">
                <Sparkles size={18} />
              </span>
              <div>
                <strong>Contribute in your own way</strong>
                <small>Choose the areas that fit your interests and skills.</small>
              </div>
            </li>
            <li>
              <span aria-hidden="true">
                <Clock3 size={18} />
              </span>
              <div>
                <strong>Tell us your availability</strong>
                <small>Help us find a role that works with your schedule.</small>
              </div>
            </li>
          </ul>

          <div className="volunteer-page__signal" aria-hidden="true">
            <span className="volunteer-page__signal-orbit" />
            <span className="volunteer-page__signal-orbit" />
            <UserRoundPlus />
          </div>

          <div className="volunteer-page__handoff">
            <Mail size={17} aria-hidden="true" />
            <span>
              Applications are prepared for
              <strong>
                {' '}
                <a href={`mailto:${chapterContact.email}`}>
                  {chapterContact.email}
                </a>
              </strong>
            </span>
          </div>
        </div>

        <div
          className="volunteer-application"
          data-reveal
          style={{ '--reveal-delay': '100ms' }}
        >
          <div className="volunteer-application__header">
            <span>VOLUNTEER APPLICATION / SLTC</span>
            <div>
              <i aria-hidden="true" />
              Email handoff
            </div>
          </div>

          <div className="volunteer-application__title">
            <span aria-hidden="true">
              <UserRoundPlus size={26} />
            </span>
            <div>
              <h2>Volunteer application</h2>
              <p id="volunteer-form-description">
                Complete the form and we will open a prepared email for you to
                review and send to the chapter team.
              </p>
            </div>
          </div>

          <form
            className="volunteer-form"
            aria-describedby="volunteer-form-description"
            noValidate
            onReset={handleReset}
            onSubmit={handleSubmit}
          >
            <fieldset className="volunteer-form__section">
              <legend className="volunteer-form__legend">
                <span>01</span>
                <span>
                  About you
                  <small>Your preferred contact details.</small>
                </span>
              </legend>
              <div className="volunteer-form__grid">
                <label className="volunteer-field" htmlFor="volunteer-first-name">
                  <span>
                    First name <small>Required</small>
                  </span>
                  <input
                    id="volunteer-first-name"
                    name="firstName"
                    type="text"
                    autoComplete="given-name"
                    maxLength={80}
                    placeholder="Your first name"
                    required
                  />
                </label>

                <label className="volunteer-field" htmlFor="volunteer-last-name">
                  <span>
                    Last name <small>Required</small>
                  </span>
                  <input
                    id="volunteer-last-name"
                    name="lastName"
                    type="text"
                    autoComplete="family-name"
                    maxLength={80}
                    placeholder="Your last name"
                    required
                  />
                </label>

                <label className="volunteer-field" htmlFor="volunteer-email">
                  <span>
                    Email address <small>Required</small>
                  </span>
                  <input
                    id="volunteer-email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    maxLength={120}
                    placeholder="you@example.com"
                    required
                  />
                </label>

                <label className="volunteer-field" htmlFor="volunteer-phone">
                  <span>
                    Mobile / WhatsApp <small>Required</small>
                  </span>
                  <input
                    id="volunteer-phone"
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={28}
                    placeholder="+94 7X XXX XXXX"
                    required
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="volunteer-form__section">
              <legend className="volunteer-form__legend">
                <span>02</span>
                <span>
                  Academic profile
                  <small>Tell us where you are in your journey.</small>
                </span>
              </legend>
              <div className="volunteer-form__grid">
                <label
                  className="volunteer-field volunteer-field--full"
                  htmlFor="volunteer-institution"
                >
                  <span>
                    Institution / organisation <small>Required</small>
                  </span>
                  <input
                    id="volunteer-institution"
                    name="institution"
                    type="text"
                    autoComplete="organization"
                    maxLength={120}
                    placeholder="University, institute, company, or organisation"
                    required
                  />
                </label>

                <label className="volunteer-field" htmlFor="volunteer-programme">
                  <span>
                    Programme / field of study <small>Required</small>
                  </span>
                  <input
                    id="volunteer-programme"
                    name="programme"
                    type="text"
                    maxLength={120}
                    placeholder="e.g. Electrical Engineering"
                    required
                  />
                </label>

                <label className="volunteer-field" htmlFor="volunteer-year">
                  <span>
                    Current year / stage <small>Required</small>
                  </span>
                  <select id="volunteer-year" name="yearOfStudy" defaultValue="" required>
                    <option value="" disabled>
                      Select your stage
                    </option>
                    {yearOptions.map((option) => (
                      <option value={option} key={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="volunteer-field" htmlFor="volunteer-ieee-status">
                  <span>
                    IEEE membership status <small>Required</small>
                  </span>
                  <select
                    id="volunteer-ieee-status"
                    name="ieeeStatus"
                    defaultValue=""
                    required
                  >
                    <option value="" disabled>
                      Select your status
                    </option>
                    {ieeeStatusOptions.map((option) => (
                      <option value={option} key={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="volunteer-field" htmlFor="volunteer-ieee-number">
                  <span>
                    IEEE member number <small>Optional</small>
                  </span>
                  <input
                    id="volunteer-ieee-number"
                    name="ieeeMemberNumber"
                    type="text"
                    inputMode="numeric"
                    maxLength={20}
                    placeholder="If applicable"
                  />
                </label>
              </div>
            </fieldset>

            <fieldset
              className="volunteer-form__section"
              ref={interestsRef}
              aria-describedby={interestError ? 'volunteer-interest-error' : undefined}
              aria-invalid={interestError ? 'true' : undefined}
            >
              <legend className="volunteer-form__legend">
                <span>03</span>
                <span>
                  Where you can contribute
                  <small id="volunteer-interest-help">
                    Choose one or more areas. Required.
                  </small>
                </span>
              </legend>

              <div className="volunteer-form__event">
                <label
                  className="volunteer-field"
                  htmlFor="volunteer-preferred-event"
                >
                  <span>
                    IES event you would like to support <small>Required</small>
                  </span>
                  <select
                    id="volunteer-preferred-event"
                    name="preferredEvent"
                    defaultValue=""
                    required
                  >
                    <option value="" disabled>
                      Select an IES event
                    </option>
                    {iesEvents.map((eventName) => (
                      <option value={eventName} key={eventName}>
                        {eventName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="volunteer-choice-grid">
                {contributionAreas.map((area, index) => (
                  <label className="volunteer-choice" key={area}>
                    <input
                      id={`volunteer-interest-${index + 1}`}
                      name="interests"
                      type="checkbox"
                      value={area}
                      aria-describedby="volunteer-interest-help volunteer-interest-error"
                      aria-invalid={interestError ? 'true' : undefined}
                      onChange={handleInterestChange}
                    />
                    <span aria-hidden="true">
                      <Check size={13} />
                    </span>
                    {area}
                  </label>
                ))}
              </div>
              <p
                className="volunteer-form__error"
                id="volunteer-interest-error"
                role={interestError ? 'alert' : undefined}
              >
                {interestError}
              </p>

              <div className="volunteer-form__grid volunteer-form__grid--spaced">
                <label
                  className="volunteer-field volunteer-field--full"
                  htmlFor="volunteer-motivation"
                >
                  <span>
                    Motivation and relevant skills <small>Required</small>
                  </span>
                  <textarea
                    id="volunteer-motivation"
                    name="motivation"
                    rows={5}
                    maxLength={600}
                    placeholder="Why would you like to volunteer, and what would you enjoy contributing?"
                    required
                  />
                </label>

                <label
                  className="volunteer-field volunteer-field--full"
                  htmlFor="volunteer-experience"
                >
                  <span>
                    Previous volunteering or project experience <small>Optional</small>
                  </span>
                  <textarea
                    id="volunteer-experience"
                    name="experience"
                    rows={3}
                    maxLength={300}
                    placeholder="Share anything relevant, including student projects or team roles."
                  />
                </label>

                <label
                  className="volunteer-field volunteer-field--full"
                  htmlFor="volunteer-portfolio"
                >
                  <span>
                    Portfolio or profile link <small>Optional</small>
                  </span>
                  <input
                    id="volunteer-portfolio"
                    name="portfolio"
                    type="url"
                    inputMode="url"
                    autoComplete="url"
                    maxLength={220}
                    placeholder="https://"
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="volunteer-form__section">
              <legend className="volunteer-form__legend">
                <span>04</span>
                <span>
                  Availability &amp; commitment
                  <small>Help us understand what works for you.</small>
                </span>
              </legend>
              <div className="volunteer-form__grid">
                <label
                  className="volunteer-field volunteer-field--full"
                  htmlFor="volunteer-commitment"
                >
                  <span>
                    Weekly time commitment <small>Required</small>
                  </span>
                  <select
                    id="volunteer-commitment"
                    name="weeklyCommitment"
                    defaultValue=""
                    required
                  >
                    <option value="" disabled>
                      Select an estimate
                    </option>
                    <option value="Less than 2 hours">Less than 2 hours</option>
                    <option value="2-4 hours">2-4 hours</option>
                    <option value="5 or more hours">5 or more hours</option>
                  </select>
                </label>
              </div>

              <div className="volunteer-form__grid volunteer-form__grid--spaced">
                <label
                  className="volunteer-field volunteer-field--full"
                  htmlFor="volunteer-availability-notes"
                >
                  <span>
                    Availability notes <small>Optional</small>
                  </span>
                  <textarea
                    id="volunteer-availability-notes"
                    name="availabilityNotes"
                    rows={3}
                    maxLength={240}
                    placeholder="Mention any timing, travel, or schedule details we should know."
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="volunteer-form__section volunteer-form__section--confirm">
              <legend className="volunteer-form__legend">
                <span>05</span>
                <span>
                  Confirmation
                  <small>One final check before the email handoff.</small>
                </span>
              </legend>
              <label className="volunteer-consent">
                <input name="consent" type="checkbox" required />
                <span aria-hidden="true">
                  <Check size={14} />
                </span>
                <span>
                  I confirm that the information above is accurate and give
                  the chapter permission to contact me about volunteering.
                  <small>Required</small>
                </span>
              </label>
            </fieldset>

            <div className="volunteer-form__actions">
              <button className="volunteer-form__submit" type="submit">
                Submit Form
                <ArrowRight size={18} aria-hidden="true" />
              </button>
              <button className="volunteer-form__clear" type="reset">
                Clear Form
                <RotateCcw size={17} aria-hidden="true" />
              </button>
            </div>

            <div className="volunteer-form__privacy">
              <ShieldCheck size={17} aria-hidden="true" />
              <p>
                This page does not upload or store your details. Clicking
                prepares them in your email app; they reach the chapter only
                after you send.
              </p>
            </div>
            <p className="volunteer-form__status" role="status" aria-live="polite">
              {status}
            </p>

            <noscript>
              <p className="volunteer-form__noscript">
                JavaScript is needed to prepare the application email. You can
                also contact the chapter directly at {chapterContact.email}.
              </p>
            </noscript>
          </form>
        </div>
      </div>
    </section>
  );
}
