import { useEffect, useState } from 'react';
import iesMarkColor from '../../assets/ies-mark-color.png';

const MINIMUM_VISIBLE_TIME = 2000;
const READY_HOLD_TIME = 160;
const EXIT_TRANSITION_TIME = 450;
const MAXIMUM_LOAD_WAIT = 3500;

const phaseLabels = {
  loading: 'Initializing chapter systems',
  ready: 'Systems ready',
  exiting: 'Welcome',
};

export default function LoadingScreen() {
  const [phase, setPhase] = useState('loading');

  useEffect(() => {
    const startedAt = performance.now();
    const root = document.getElementById('root');
    const site = document.querySelector('.site');
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const minimumVisibleTime = prefersReducedMotion ? 120 : MINIMUM_VISIBLE_TIME;
    const readyHoldTime = prefersReducedMotion ? 20 : READY_HOLD_TIME;
    const exitTransitionTime = prefersReducedMotion
      ? 30
      : EXIT_TRANSITION_TIME;
    let isCancelled = false;
    let isDismissalQueued = false;
    let readyTimer;
    let exitTimer;
    let removeTimer;
    let fallbackTimer;

    const finish = () => {
      if (isCancelled || isDismissalQueued) {
        return;
      }

      isDismissalQueued = true;
      window.clearTimeout(fallbackTimer);

      const remainingTime = Math.max(
        0,
        minimumVisibleTime - (performance.now() - startedAt),
      );

      readyTimer = window.setTimeout(() => {
        setPhase('ready');

        exitTimer = window.setTimeout(() => {
          setPhase('exiting');

          removeTimer = window.setTimeout(() => {
            setPhase('done');
            document.body.classList.remove('is-loading');
            root?.removeAttribute('aria-busy');
            site?.removeAttribute('aria-hidden');
            if (site) {
              site.inert = false;
            }
          }, exitTransitionTime);
        }, readyHoldTime);
      }, remainingTime);
    };

    document.body.classList.add('is-loading');
    root?.setAttribute('aria-busy', 'true');
    site?.setAttribute('aria-hidden', 'true');
    if (site) {
      site.inert = true;
    }

    const importantImages = document.querySelectorAll(
      '.hero img, .masterminds-hero img, .brand-mark img',
    );
    const imagesReady = Promise.allSettled(
      [...importantImages].map((image) =>
        typeof image.decode === 'function' ? image.decode() : Promise.resolve(),
      ),
    );
    const fontsReady = document.fonts?.ready ?? Promise.resolve();

    Promise.allSettled([imagesReady, fontsReady]).then(finish);
    fallbackTimer = window.setTimeout(finish, MAXIMUM_LOAD_WAIT);

    return () => {
      isCancelled = true;
      window.clearTimeout(readyTimer);
      window.clearTimeout(exitTimer);
      window.clearTimeout(removeTimer);
      window.clearTimeout(fallbackTimer);
      document.body.classList.remove('is-loading');
      root?.removeAttribute('aria-busy');
      site?.removeAttribute('aria-hidden');
      if (site) {
        site.inert = false;
      }
    };
  }, []);

  if (phase === 'done') {
    return null;
  }

  return (
    <div
      className={`site-loader site-loader--${phase}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="site-loader__sr-only">{phaseLabels[phase]}</span>
      <div className="site-loader__grid" aria-hidden="true" />
      <img
        className="site-loader__watermark"
        src={iesMarkColor}
        alt=""
        aria-hidden="true"
      />
      <i className="site-loader__beam site-loader__beam--one" aria-hidden="true" />
      <i className="site-loader__beam site-loader__beam--two" aria-hidden="true" />

      <div className="site-loader__frame" aria-hidden="true">
        <span>System / 01</span>
        <span>Intelligent industry</span>
        <span>SLTC / 2026</span>
        <span>Loading sequence</span>
      </div>

      <div className="site-loader__content" aria-hidden="true">
        <p className="site-loader__eyebrow">
          <i />
          Standby
        </p>

        <div className="site-loader__visual">
          <div className="site-loader__orbit site-loader__orbit--outer">
            <i />
          </div>
          <div className="site-loader__orbit site-loader__orbit--inner">
            <i />
          </div>

          <div className="site-loader__core">
            <span className="site-loader__core-pulse" />
            <img
              className="site-loader__core-logo"
              src={iesMarkColor}
              alt=""
            />
          </div>
        </div>

        <div className="site-loader__identity">
          <strong>IEEE Industrial Electronics Society of SLTC.</strong>
          <span>Automation · Energy · Intelligent systems</span>
        </div>

        <div className="site-loader__progress">
          <div className="site-loader__progress-copy">
            <span>{phaseLabels[phase]}</span>
            <span>System / online</span>
          </div>
          <div className="site-loader__progress-track">
            <i />
          </div>
        </div>
      </div>
    </div>
  );
}
