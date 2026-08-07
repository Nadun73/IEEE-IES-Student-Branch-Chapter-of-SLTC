import React, { useEffect, useRef, useState } from 'react';
import { Menu, X, ArrowUp, CalendarDays, MapPin, Mail, Award, CheckCircle2, ChevronRight, Send, Linkedin, Facebook, Instagram, Globe2, Sparkles } from 'lucide-react';
import iesLogo from './assets/ies-logo.png';

function InteractiveBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    const traces = Array.from({ length: 24 }, () => {
      const startX = Math.random() * window.innerWidth;
      const startY = Math.random() * window.innerHeight;
      const points = [{ x: startX, y: startY }];
      let curX = startX;
      let curY = startY;
      const segments = Math.floor(Math.random() * 4) + 2;

      for (let i = 0; i < segments; i += 1) {
        const length = Math.random() * 140 + 70;
        const dir = Math.floor(Math.random() * 4);
        if (dir === 0) curX += length;
        else if (dir === 1) curY += length;
        else if (dir === 2) curX -= length;
        else curY -= length;

        if (Math.random() > 0.35) {
          const bend = 24;
          curX += (dir === 0 || dir === 2) ? 0 : (Math.random() > 0.5 ? bend : -bend);
          curY += (dir === 1 || dir === 3) ? 0 : (Math.random() > 0.5 ? bend : -bend);
        }

        points.push({ x: curX, y: curY });
      }

      return {
        points,
        color: Math.random() > 0.6 ? 'rgba(232, 119, 34, 0.16)' : 'rgba(0, 98, 155, 0.16)',
        pulseProgress: Math.random(),
        pulseSpeed: 0.0015 + Math.random() * 0.0012,
      };
    });

    const draw = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      ctx.clearRect(0, 0, width, height);

      traces.forEach((trace) => {
        ctx.beginPath();
        ctx.moveTo(trace.points[0].x, trace.points[0].y);
        trace.points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
        ctx.strokeStyle = trace.color;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        const lastPoint = trace.points[trace.points.length - 1];
        ctx.beginPath();
        ctx.arc(lastPoint.x, lastPoint.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = trace.color;
        ctx.fill();

        trace.pulseProgress += trace.pulseSpeed;
        if (trace.pulseProgress > 1) trace.pulseProgress = 0;

        const totalSegments = trace.points.length - 1;
        const targetSeg = Math.floor(trace.pulseProgress * totalSegments);
        const segProgress = trace.pulseProgress * totalSegments - targetSeg;

        if (targetSeg < totalSegments) {
          const pt1 = trace.points[targetSeg];
          const pt2 = trace.points[targetSeg + 1];
          const pulseX = pt1.x + (pt2.x - pt1.x) * segProgress;
          const pulseY = pt1.y + (pt2.y - pt1.y) * segProgress;
          ctx.beginPath();
          ctx.arc(pulseX, pulseY, 5, 0, Math.PI * 2);
          ctx.fillStyle = trace.color.replace('0.16', '0.85');
          ctx.fill();
        }
      });

      animationFrameId = window.requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resize);
      window.cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="circuit-canvas"
      aria-hidden="true"
    />
  );
}

export default function IESWebsite() {
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [formStatus, setFormStatus] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 1400);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
      setShowScrollTop(window.scrollY > 520);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSubmit = (event) => {
    event.preventDefault();
    setFormStatus('sending');
    window.setTimeout(() => {
      setFormStatus('success');
      setName('');
      setEmail('');
      setSubject('');
      setMessage('');
    }, 1200);
  };

  const handleNavClick = (event, targetId) => {
    event.preventDefault();
    setMobileMenuOpen(false);
    const element = document.querySelector(targetId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const flagshipEvents = [
    {
      title: 'MoraForesight',
      category: 'Residential Bootcamp',
      description: 'A flagship experience that blends leadership, networking and practical industry exposure for future engineers.',
      image: 'https://ieeesb.uom.lk/events-assets/Foresight/banner.webp',
      link: 'https://ieeesb.uom.lk/events/moraforsight',
    },
    {
      title: 'Rise Up Mora',
      category: 'Internship & Mock Interview Fair',
      description: 'A career-oriented event that connects students with industry mentors, preparatory sessions and internship opportunities.',
      image: 'https://ieeesb.uom.lk/events-assets/RUM/banner.webp',
      link: 'https://ieeesb.uom.lk/events/rise-up-mora',
    },
    {
      title: 'Mercon',
      category: 'Engineering Research Conference',
      description: 'A platform for students to showcase innovation, research and collaboration through impactful technical presentations.',
      image: 'https://ieeesb.uom.lk/events-assets/Mercon/banner.webp',
      link: 'https://ieeesb.uom.lk/events/mercon',
    },
    {
      title: 'Innovate With Ballerina',
      category: 'Idea Hackathon',
      description: 'A challenge-driven event that inspires students to turn fresh ideas into engaging digital solutions.',
      image: 'https://ieeesb.uom.lk/events-assets/Ballerina/banner.webp',
      link: 'https://ieeesb.uom.lk/events/innovate-with-ballerina',
    },
  ];

  const awards = [
    { year: '2025', title: 'Most Outstanding Student Branch', category: 'International', image: 'https://ieeesb.uom.lk/awards/International%20awrd.webp' },
    { year: '2025', title: 'Best Student Branch Project Award', category: 'National', image: 'https://ieeesb.uom.lk/awards/Sl%20award1.webp' },
    { year: '2025', title: 'Best Industry Collaborative Project Award', category: 'National', image: 'https://ieeesb.uom.lk/awards/Sl%20award2.webp' },
    { year: '2025', title: 'Outstanding Technical Chapter Award', category: 'National', image: 'https://ieeesb.uom.lk/awards/Sl%20award3.webp' },
  ];

  const reasons = [
    {
      title: 'Global network',
      text: 'Connect with IEEE professionals, student leaders and innovators from across the globe.',
    },
    {
      title: 'Hands-on growth',
      text: 'Build technical confidence through competitions, workshops and collaborative projects.',
    },
    {
      title: 'Career impact',
      text: 'Access mentorship, internships and events that sharpen your professional direction.',
    },
  ];

  const partners = [
    { name: 'IFS', logo: 'https://ieeesb.uom.lk/partners/IFS.webp' },
    { name: 'IEEE Sri Lanka Section', logo: 'https://ieeesb.uom.lk/logo/ieeesblogo.webp' },
    { name: 'University of Moratuwa', logo: 'https://ieeesb.uom.lk/logo/ieeesblogo.webp' },
  ];

  if (loading) {
    return (
      <div className="loader-screen">
        <div className="loader-shell">
          <img src={iesLogo} alt="IEEE IES logo" className="loader-logo" />
          <h1>IEEE IES SLTC</h1>
          <p>Preparing your experience</p>
          <div className="loader-bar">
            <span />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <InteractiveBackground />
      <div className="page-backdrop" />
      <header className={`topbar ${scrolled ? 'scrolled' : ''}`}>
        <div className="container nav-row">
          <a href="#home" onClick={(event) => handleNavClick(event, '#home')} className="brand">
            <img src={iesLogo} alt="IEEE IES logo" />
            <span>IEEE IES SLTC</span>
          </a>

          <nav className="desktop-nav">
            <a href="#about" onClick={(event) => handleNavClick(event, '#about')}>About</a>
            <a href="#events" onClick={(event) => handleNavClick(event, '#events')}>Events</a>
            <a href="#awards" onClick={(event) => handleNavClick(event, '#awards')}>Awards</a>
            <a href="#contact" onClick={(event) => handleNavClick(event, '#contact')}>Contact</a>
          </nav>

          <button className="mobile-toggle" onClick={() => setMobileMenuOpen((value) => !value)} aria-label="Toggle menu">
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="mobile-menu">
            <a href="#about" onClick={(event) => handleNavClick(event, '#about')}>About</a>
            <a href="#events" onClick={(event) => handleNavClick(event, '#events')}>Events</a>
            <a href="#awards" onClick={(event) => handleNavClick(event, '#awards')}>Awards</a>
            <a href="#contact" onClick={(event) => handleNavClick(event, '#contact')}>Contact</a>
          </div>
        )}
      </header>

      <main id="home">
        <section className="hero-section hero-home">
          <div className="container hero-grid">
            <div className="hero-copy hero-copy-center">
              <span className="eyebrow">Inspired by passion</span>
              <h1>
                IEEE<br />
                <span>Student Branch</span><br />
                University of Moratuwa
              </h1>
              <p className="hero-subtitle">
                To transform beyond excellence.
              </p>
              <div className="hero-actions">
                <a href="#events" className="btn btn-primary" onClick={(event) => handleNavClick(event, '#events')}>
                  Explore flagship events <ChevronRight size={18} />
                </a>
                <a href="#contact" className="btn btn-secondary" onClick={(event) => handleNavClick(event, '#contact')}>
                  Join the community
                </a>
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="section">
          <div className="container split-layout">
            <div className="section-heading">
              <span className="eyebrow">About the chapter</span>
              <h2>Building a community of engineers who learn, lead and innovate.</h2>
              <p>
                The IEEE Industrial Electronics Society Student Branch Chapter of SLTC is dedicated to empowering students through technical depth, meaningful collaboration and projects that create real-world impact.
              </p>
              <div className="feature-list">
                <div><CheckCircle2 size={18} /> <span>Innovation-led student activities</span></div>
                <div><CheckCircle2 size={18} /> <span>Leadership and professional development</span></div>
                <div><CheckCircle2 size={18} /> <span>Industry exposure and global networking</span></div>
              </div>
            </div>
            <div className="glass-panel info-panel">
              <h3>Why join IEEE?</h3>
              <div className="info-stack">
                {reasons.map((reason) => (
                  <div className="info-item" key={reason.title}>
                    <h4>{reason.title}</h4>
                    <p>{reason.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="events" className="section section-alt">
          <div className="container">
            <div className="section-heading centered">
              <span className="eyebrow">Flagship events</span>
              <h2>Experiences that shape the next generation of engineers.</h2>
            </div>
            <div className="card-grid">
              {flagshipEvents.map((event) => (
                <article className="glass-panel card" key={event.title}>
                  <img src={event.image} alt={event.title} />
                  <div className="card-content">
                    <span className="card-category">{event.category}</span>
                    <h3>{event.title}</h3>
                    <p>{event.description}</p>
                    <a href={event.link} target="_blank" rel="noreferrer">Visit event <ChevronRight size={16} /></a>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="awards" className="section">
          <div className="container">
            <div className="section-heading centered">
              <span className="eyebrow">Awards & recognitions</span>
              <h2>Global excellence, locally celebrated.</h2>
            </div>
            <div className="award-grid">
              {awards.map((award) => (
                <article className="glass-panel award-card" key={award.title}>
                  <img src={award.image} alt={award.title} />
                  <div>
                    <span className="card-category">{award.category}</span>
                    <h3>{award.title}</h3>
                    <p>{award.year} recognition for outstanding student branch leadership and impact.</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section section-alt">
          <div className="container partners-strip glass-panel">
            <div className="section-heading">
              <span className="eyebrow">Strategic partners</span>
              <h2>Collaborations that amplify student opportunity.</h2>
            </div>
            <div className="partner-grid">
              {partners.map((partner) => (
                <div className="partner-pill" key={partner.name}>
                  <img src={partner.logo} alt={partner.name} />
                  <span>{partner.name}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="contact" className="section">
          <div className="container contact-layout">
            <div className="section-heading">
              <span className="eyebrow">Get in touch</span>
              <h2>Let’s build the next chapter together.</h2>
              <p>Reach out for events, memberships or collaborations with the IEEE Student Branch of the University of Moratuwa.</p>
              <div className="contact-list">
                <a href="mailto:sltcieeecs@gmail.com"><Mail size={18} /> sltcieeecs@gmail.com</a>
                <a href="https://maps.google.com/?q=University+of+Moratuwa" target="_blank" rel="noreferrer"><MapPin size={18} /> University of Moratuwa, Sri Lanka</a>
                <a href="https://ieeesb.uom.lk/" target="_blank" rel="noreferrer"><Globe2 size={18} /> ieeesb.uom.lk</a>
              </div>
            </div>

            <form className="glass-panel contact-card" onSubmit={handleSubmit}>
              <div className="field-group">
                <label>Your name</label>
                <input value={name} onChange={(event) => setName(event.target.value)} required />
              </div>
              <div className="field-group">
                <label>Email</label>
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </div>
              <div className="field-group">
                <label>Subject</label>
                <input value={subject} onChange={(event) => setSubject(event.target.value)} required />
              </div>
              <div className="field-group">
                <label>Message</label>
                <textarea rows="4" value={message} onChange={(event) => setMessage(event.target.value)} required />
              </div>
              <button type="submit" className="btn btn-primary full-width">
                {formStatus === 'sending' ? 'Sending...' : formStatus === 'success' ? 'Message sent' : 'Send message'} <Send size={16} />
              </button>
            </form>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container footer-grid">
          <div>
            <h3>IEEE Student Branch University of Moratuwa</h3>
            <p>Where innovation, leadership and engineering impact come together.</p>
          </div>
          <div>
            <h4>Follow us</h4>
            <div className="social-links">
              <a href="https://lk.linkedin.com/company/sltcieeecs" target="_blank" rel="noreferrer"><Linkedin size={18} /></a>
              <a href="https://web.facebook.com/sltcieeecs" target="_blank" rel="noreferrer"><Facebook size={18} /></a>
              <a href="https://www.instagram.com/sltcieeecs/" target="_blank" rel="noreferrer"><Instagram size={18} /></a>
            </div>
          </div>
          <div>
            <h4>Quick links</h4>
            <div className="footer-links">
              <a href="#about" onClick={(event) => handleNavClick(event, '#about')}>About</a>
              <a href="#events" onClick={(event) => handleNavClick(event, '#events')}>Events</a>
              <a href="#contact" onClick={(event) => handleNavClick(event, '#contact')}>Contact</a>
            </div>
          </div>
        </div>
      </footer>

      <a href="#home" onClick={(event) => handleNavClick(event, '#home')} className={`scroll-top ${showScrollTop ? 'visible' : ''}`} aria-label="Scroll to top">
        <ArrowUp size={18} />
      </a>
    </div>
  );
}
