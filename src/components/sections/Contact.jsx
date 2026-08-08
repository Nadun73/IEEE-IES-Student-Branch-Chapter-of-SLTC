import { useState } from 'react';
import {
  ArrowUpRight,
  ExternalLink,
  Facebook,
  Linkedin,
  Mail,
  MapPin,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { chapterContact } from '../../data/siteContent.js';
import SectionLabel from '../ui/SectionLabel.jsx';

const contactTopics = [
  'General enquiry',
  'Membership & volunteering',
  'Event collaboration',
  'Technical partnership',
  'Media & outreach',
  'Other',
];

const contactLinkIcons = {
  facebook: Facebook,
  linkedin: Linkedin,
  external: ExternalLink,
};

export default function Contact() {
  const [status, setStatus] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const firstName = String(formData.get('firstName') ?? '').trim();
    const lastName = String(formData.get('lastName') ?? '').trim();
    const email = String(formData.get('email') ?? '').trim();
    const topic = String(formData.get('topic') ?? '').trim();
    const message = String(formData.get('message') ?? '').trim();
    const subject = `IEEE IES SLTC — ${topic}`;
    const body = [
      'Hello IEEE IES Student Branch Chapter of SLTC,',
      '',
      message,
      '',
      '—',
      `Name: ${firstName} ${lastName}`,
      `Reply email: ${email}`,
      `Enquiry type: ${topic}`,
    ].join('\n');

    setStatus('Opening your email app with this message ready to review and send.');
    window.location.href = `mailto:${chapterContact.email}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
  };

  return (
    <section className="contact" id="connect" aria-labelledby="contact-title">
      <div className="contact__grid" aria-hidden="true" />
      <div className="contact__orbit" aria-hidden="true">
        <span />
        <span />
      </div>

      <div className="shell contact__layout">
        <div className="contact__intro" data-reveal>
          <div className="contact__code">IES / CONTACT CHANNEL</div>
          <SectionLabel>Contact us</SectionLabel>
          <div className="contact__copy">
            <h2 id="contact-title">
              Start a
              <span> conversation.</span>
            </h2>
            <p>
              Have a question about the chapter, an idea for a collaboration,
              or something we could build together? Send us a message—we would
              be glad to hear from you.
            </p>
          </div>

          <address className="contact__details">
            <a className="contact-channel" href={`mailto:${chapterContact.email}`}>
              <span className="contact-channel__icon" aria-hidden="true">
                <Mail size={20} />
              </span>
              <span>
                <small>Email</small>
                <strong>{chapterContact.email}</strong>
              </span>
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
            <div className="contact-channel">
              <span className="contact-channel__icon" aria-hidden="true">
                <MapPin size={20} />
              </span>
              <span>
                <small>Chapter base</small>
                <strong>{chapterContact.address}</strong>
              </span>
            </div>
          </address>

          <div className="contact__socials" aria-label="Chapter links">
            {chapterContact.links.map((link) => {
              const Icon = contactLinkIcons[link.icon];

              return (
                <a
                  href={link.href}
                  key={link.label}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon size={16} aria-hidden="true" />
                  {link.label}
                </a>
              );
            })}
          </div>
        </div>

        <div
          className="contact__form-shell"
          data-reveal
          style={{ '--reveal-delay': '100ms' }}
        >
          <div className="contact__form-header">
            <span>MESSAGE CHANNEL / SLTC</span>
            <div className="contact__signal">
              <i aria-hidden="true" />
              Email handoff
            </div>
          </div>
          <h3>Send an enquiry</h3>
          <p id="contact-form-description">
            Complete the fields below and we will open a prepared email to the
            chapter inbox for you to review and send.
          </p>

          <form
            className="contact-form"
            aria-describedby="contact-form-description"
            onSubmit={handleSubmit}
          >
            <div className="contact-form__grid">
              <label className="contact-field" htmlFor="contact-first-name">
                <span>First name</span>
                <input
                  id="contact-first-name"
                  name="firstName"
                  type="text"
                  autoComplete="given-name"
                  placeholder="Your first name"
                  required
                />
              </label>

              <label className="contact-field" htmlFor="contact-last-name">
                <span>Last name</span>
                <input
                  id="contact-last-name"
                  name="lastName"
                  type="text"
                  autoComplete="family-name"
                  placeholder="Your last name"
                  required
                />
              </label>

              <label
                className="contact-field contact-field--full"
                htmlFor="contact-email"
              >
                <span>Email address</span>
                <input
                  id="contact-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                />
              </label>

              <label
                className="contact-field contact-field--full"
                htmlFor="contact-topic"
              >
                <span>Topic</span>
                <select id="contact-topic" name="topic" defaultValue="" required>
                  <option value="" disabled>
                    Select an enquiry type
                  </option>
                  {contactTopics.map((topic) => (
                    <option value={topic} key={topic}>
                      {topic}
                    </option>
                  ))}
                </select>
              </label>

              <label
                className="contact-field contact-field--full"
                htmlFor="contact-message"
              >
                <span>Message</span>
                <textarea
                  id="contact-message"
                  name="message"
                  rows={6}
                  maxLength={2000}
                  placeholder="Tell us what you have in mind..."
                  required
                />
              </label>
            </div>

            <button className="contact-form__submit" type="submit">
              Send via email
              <Send size={17} aria-hidden="true" />
            </button>

            <div className="contact-form__note">
              <ShieldCheck size={16} aria-hidden="true" />
              <span>
                Your details stay in your browser until you send the message
                from your email app.
              </span>
            </div>
            <p className="contact-form__status" aria-live="polite">
              {status}
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}
