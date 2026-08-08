import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [debugPort, siteUrl, outputDirectory] = process.argv.slice(2);

if (!debugPort || !siteUrl || !outputDirectory) {
  throw new Error(
    'Usage: node scripts/cdp-browser-check.mjs <debug-port> <site-url> <output-directory>',
  );
}

await mkdir(outputDirectory, { recursive: true });

const runtimeExceptions = [];
const consoleErrors = [];
const logErrors = [];
const pendingCommands = new Map();
const eventWaiters = new Map();
let commandId = 0;
let socket;

const hardTimeout = setTimeout(() => {
  console.error('CDP browser verification exceeded 35 seconds.');
  process.exit(2);
}, 35_000);

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForJson(url, timeoutMilliseconds = 5_000) {
  const deadline = Date.now() + timeoutMilliseconds;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Chrome is still starting.
    }
    await sleep(100);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function waitForSocketOpen(webSocket, timeoutMilliseconds = 4_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Timed out opening the Chrome DevTools socket.')),
      timeoutMilliseconds,
    );

    webSocket.addEventListener(
      'open',
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );

    webSocket.addEventListener(
      'error',
      () => {
        clearTimeout(timeout);
        reject(new Error('Chrome DevTools socket failed to open.'));
      },
      { once: true },
    );
  });
}

function waitForEvent(method, timeoutMilliseconds = 7_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      const waiters = eventWaiters.get(method) ?? [];
      eventWaiters.set(
        method,
        waiters.filter((waiter) => waiter.resolve !== resolve),
      );
      reject(new Error(`Timed out waiting for CDP event ${method}.`));
    }, timeoutMilliseconds);

    const waiters = eventWaiters.get(method) ?? [];
    waiters.push({
      resolve: (params) => {
        clearTimeout(timeout);
        resolve(params);
      },
    });
    eventWaiters.set(method, waiters);
  });
}

function send(method, params = {}, timeoutMilliseconds = 5_000) {
  commandId += 1;
  const id = commandId;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingCommands.delete(id);
      reject(new Error(`CDP command ${method} timed out.`));
    }, timeoutMilliseconds);

    pendingCommands.set(id, {
      resolve: (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    });

    socket.send(JSON.stringify({ id, method, params }));
  });
}

function evaluate(expression) {
  return send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  }).then((response) => {
    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description ??
          response.exceptionDetails.text,
      );
    }
    return response.result.value;
  });
}

async function waitForSiteReady(timeoutMilliseconds = 5_000) {
  const deadline = Date.now() + timeoutMilliseconds;

  while (Date.now() < deadline) {
    const isReady = await evaluate(`(() => {
      const site = document.querySelector('.site');
      const loader = document.querySelector('.site-loader');
      return Boolean(site) && !loader && !document.body.classList.contains('is-loading');
    })()`);

    if (isReady) return;
    await sleep(50);
  }

  throw new Error('Timed out waiting for the site loading screen to finish.');
}

async function captureScreenshot(filename) {
  const screenshot = await send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(
    path.join(outputDirectory, filename),
    Buffer.from(screenshot.data, 'base64'),
  );
}

async function captureElementScreenshot(selector, filename) {
  const clip = await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    if (element.matches('[data-reveal]')) {
      element.style.setProperty('transition', 'none', 'important');
      element.classList.add('is-visible');
    }
    element.querySelectorAll('[data-reveal]').forEach((item) => {
      item.style.setProperty('transition', 'none', 'important');
      item.classList.add('is-visible');
    });
    const bounds = element.getBoundingClientRect();
    return {
      x: bounds.left + window.scrollX,
      y: bounds.top + window.scrollY,
      width: bounds.width,
      height: bounds.height,
    };
  })()`);

  if (!clip) {
    throw new Error(`Unable to capture missing element ${selector}.`);
  }

  const screenshot = await send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { ...clip, scale: 1 },
  });
  await writeFile(
    path.join(outputDirectory, filename),
    Buffer.from(screenshot.data, 'base64'),
  );
}

async function inspectAdvisoryCards() {
  return evaluate(`(() => {
    const normalize = (value) =>
      String(value ?? '').replace(/\\s+/g, ' ').trim();
    const section = document.querySelector('#advisory');
    const cardElements = section
      ? [
          ...section.querySelectorAll(
            '.committee-member-card--advisory'
          ),
        ]
      : [];
    const sharedParent =
      cardElements.length > 0 &&
      cardElements.every((card) => card.parentElement === cardElements[0].parentElement)
        ? cardElements[0].parentElement
        : section;
    const containerBounds = sharedParent?.getBoundingClientRect();
    const cards = cardElements.map((card) => {
      const bounds = card.getBoundingClientRect();
      const name = card.querySelector(
        '.committee-member-card__content h3, h3'
      );
      const primaryRole = card.querySelector(
        '.committee-member-card__content > span, .committee-member-card__position'
      );
      const cardLabel = card.querySelector(
        '.committee-member-card__topline span:last-child'
      );

      return {
        name: normalize(name?.textContent),
        primaryRole: normalize(primaryRole?.textContent),
        cardLabel: normalize(cardLabel?.textContent),
        text: normalize(card.textContent),
        top: bounds.top + window.scrollY,
        bottom: bounds.bottom + window.scrollY,
        left: bounds.left,
        right: bounds.right,
        width: bounds.width,
        height: bounds.height,
        centerX: bounds.left + bounds.width / 2,
      };
    });
    const expectedMembers = [
      {
        name: 'Prof. Lasith Yasakethu',
        primaryRole: 'Branch Counselor',
      },
      {
        name: 'Mrs. Warunika Hippola',
        primaryRole: 'Branch Academic Advisor',
      },
      {
        name: 'Chathila Walgama',
        primaryRole: 'Student Advisor',
        cardLabel: 'Student Advisor',
      },
    ];
    const normalizedCards = cards.map((card) => ({
      ...card,
      normalizedName: card.name.toLowerCase(),
      normalizedText: card.text.toLowerCase(),
    }));
    const content = expectedMembers.map((member) => {
      const matchingCard = normalizedCards.find(
        (card) => card.normalizedName === member.name.toLowerCase()
      );

      return {
        ...member,
        namePresent: Boolean(matchingCard),
        primaryRolePresent: Boolean(
          matchingCard?.normalizedText.includes(
            member.primaryRole.toLowerCase()
          )
        ),
        cardLabelPresent:
          !member.cardLabel ||
          matchingCard?.cardLabel?.toLowerCase() ===
            member.cardLabel.toLowerCase(),
      };
    });
    const firstRow = cards.slice(0, 2);
    const secondRowCard = cards[2] ?? null;
    const tolerance = 3;
    const widthRange = cards.length
      ? Math.max(...cards.map((card) => card.width)) -
        Math.min(...cards.map((card) => card.width))
      : Infinity;
    const heightRange = cards.length
      ? Math.max(...cards.map((card) => card.height)) -
        Math.min(...cards.map((card) => card.height))
      : Infinity;
    const containerCenter = containerBounds
      ? containerBounds.left + containerBounds.width / 2
      : null;
    const firstRowOuterCenter =
      firstRow.length === 2
        ? (firstRow[0].left + firstRow[1].right) / 2
        : null;
    const mobileOneColumn =
      cards.length === 3 &&
      cards.every(
        (card, index) =>
          index === 0 || card.top >= cards[index - 1].bottom - tolerance
      );
    const mobileCardsInsideViewport = cards.every(
      (card) => card.left >= -1 && card.right <= window.innerWidth + 1
    );

    return {
      sectionExists: Boolean(section),
      cardCount: cards.length,
      content,
      desktop: {
        firstRowSameRow:
          firstRow.length === 2 &&
          Math.abs(firstRow[0].top - firstRow[1].top) < tolerance,
        firstRowCentered:
          firstRowOuterCenter !== null &&
          containerCenter !== null &&
          Math.abs(firstRowOuterCenter - containerCenter) < tolerance,
        secondRowBelow:
          Boolean(secondRowCard) &&
          firstRow.length === 2 &&
          secondRowCard.top >
            Math.max(...firstRow.map((card) => card.bottom)) + tolerance,
        secondRowCentered:
          Boolean(secondRowCard) &&
          containerCenter !== null &&
          Math.abs(secondRowCard.centerX - containerCenter) < tolerance,
        equalWidths: widthRange < tolerance,
        equalHeights: heightRange < tolerance,
      },
      mobile: {
        oneColumn: mobileOneColumn,
        cardsInsideViewport: mobileCardsInsideViewport,
        centered:
          containerCenter !== null &&
          cards.every(
            (card) => Math.abs(card.centerX - containerCenter) < tolerance
          ),
      },
    };
  })()`);
}

async function inspectViewport({
  width,
  height,
  mobile,
  filename,
  url,
  requiredText,
}) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
    screenWidth: width,
    screenHeight: height,
  });
  await send('Emulation.setTouchEmulationEnabled', {
    enabled: mobile,
    maxTouchPoints: mobile ? 5 : 1,
  });

  const loaded = waitForEvent('Page.loadEventFired');
  await send('Page.navigate', {
    url: `${url}?viewport=${width}`,
  });
  await loaded;
  await sleep(320);
  await captureScreenshot(`loader-${filename}`);
  await waitForSiteReady();
  await sleep(120);

  const state = await evaluate(`(() => {
    const root = document.documentElement;
    const bodyText = document.body?.innerText ?? '';
    const normalizedBodyText = bodyText.replace(/\\s+/g, ' ').toLowerCase();
    const menuToggle = document.querySelector('.menu-toggle');
    const desktopNavigation = document.querySelector('.desktop-navigation');
    const toggleRect = menuToggle?.getBoundingClientRect();
    const images = [...document.images].map((image) => ({
      alt: image.alt,
      complete: image.complete,
      naturalWidth: image.naturalWidth,
    }));
    const focusImageElements = [
      ...document.querySelectorAll('#focus .focus-card__media img'),
    ];
    const focusImages = focusImageElements.map((image) => ({
      alt: image.alt,
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      objectFit: getComputedStyle(image).objectFit,
    }));
    const focusMediaMasks = [
      ...document.querySelectorAll('#focus .focus-card__media'),
    ].map((media) => {
      const styles = getComputedStyle(media);

      return {
        maskImage: styles.maskImage,
        webkitMaskImage: styles.webkitMaskImage,
      };
    });
    const focusSection = document.querySelector('#focus');
    const focusCard = focusSection?.querySelector('.focus-card');
    const focusDescription = focusCard?.querySelector('p');
    const systemsFlow = focusSection?.querySelector('.systems-flow');
    const focusAppearance = focusSection
      ? {
          lightClass: focusSection.classList.contains('section--light'),
          darkClass: focusSection.classList.contains('section--ink'),
          backgroundColor: getComputedStyle(focusSection).backgroundColor,
          color: getComputedStyle(focusSection).color,
          cardBackground: focusCard
            ? getComputedStyle(focusCard).backgroundColor
            : null,
          cardBorderColor: focusCard
            ? getComputedStyle(focusCard).borderColor
            : null,
          descriptionColor: focusDescription
            ? getComputedStyle(focusDescription).color
            : null,
          flowBackground: systemsFlow
            ? getComputedStyle(systemsFlow).backgroundColor
            : null,
        }
      : null;
    const heroSection = document.querySelector('.hero');
    const heroCopy = heroSection?.querySelector('.hero-copy');
    const heroHeading = heroSection?.querySelector('h1');
    const heroMetricElements = heroSection
      ? [...heroSection.querySelectorAll('.hero-metric')]
      : [];
    const heroMetricRects = heroMetricElements.map((metric) =>
      metric.getBoundingClientRect()
    );
    const heroCopyRect = heroCopy?.getBoundingClientRect();
    const heroLayout = heroSection
      ? {
          exists: true,
          headingText:
            heroHeading?.textContent.replace(/\\s+/g, ' ').trim() ?? null,
          textAlign: heroCopy ? getComputedStyle(heroCopy).textAlign : null,
          centerOffset: heroCopyRect
            ? Math.abs(
                heroCopyRect.left +
                  heroCopyRect.width / 2 -
                  window.innerWidth / 2
              )
            : null,
          metricValues: heroMetricElements.map(
            (metric) =>
              metric.querySelector('.hero-metric__value')?.textContent.trim() ?? ''
          ),
          metricLabels: heroMetricElements.map(
            (metric) =>
              metric.querySelector('.hero-metric__label')?.textContent.trim() ?? ''
          ),
          metricCount: heroMetricElements.length,
          metricsFirstRowCount: heroMetricRects.filter(
            (rect) =>
              Math.abs(rect.top - (heroMetricRects[0]?.top ?? rect.top)) <
              3,
          ).length,
          metricsInsideViewport: heroMetricRects.every(
            (rect) => rect.left >= -1 && rect.right <= window.innerWidth + 1
          ),
          actionHrefs: [
            ...heroSection.querySelectorAll('.hero-actions a'),
          ].map((link) => link.getAttribute('href')),
          orbitPresent: Boolean(heroSection.querySelector('.hero-orbit')),
          legacyVisualPresent: Boolean(heroSection.querySelector('.hero-visual')),
        }
      : null;
    const contactSection = document.querySelector('#connect.contact');
    const contactIntro = contactSection?.querySelector('.contact__intro');
    const contactFormShell = contactSection?.querySelector('.contact__form-shell');
    const contactForm = contactSection?.querySelector('.contact-form');
    const contactFormTitle = contactFormShell?.querySelector('h3');
    const contactSectionLabel = contactSection?.querySelector('.section-label');
    const contactIntroParagraph = contactSection?.querySelector('.contact__copy > p');
    const contactChannel = contactSection?.querySelector('.contact-channel');
    const contactChannelSmall = contactChannel?.querySelector('small');
    const contactChannelStrong = contactChannel?.querySelector('strong');
    const contactSocialLink = contactSection?.querySelector('.contact__socials a');
    const contactFormDescription = contactFormShell?.querySelector(':scope > p');
    const contactFirstField = contactForm?.querySelector('input');
    const contactFirstLabel = contactForm?.querySelector('.contact-field > span');
    const contactNote = contactForm?.querySelector('.contact-form__note');
    const contactSubmit = contactForm?.querySelector('.contact-form__submit');
    const contactIntroRect = contactIntro?.getBoundingClientRect();
    const contactFormRect = contactFormShell?.getBoundingClientRect();
    const contactFields = contactForm
      ? [...contactForm.querySelectorAll('input, select, textarea')]
      : [];
    const contactLayout = contactSection
      ? {
          exists: true,
          labelledBy: contactSection.getAttribute('aria-labelledby'),
          headingText:
            contactSection
              .querySelector('h2')
              ?.textContent.replace(/\\s+/g, ' ')
              .trim() ?? null,
          formTitle:
            contactFormTitle?.textContent.replace(/\\s+/g, ' ').trim() ?? null,
          emailHref:
            contactSection
              .querySelector('.contact-channel[href^="mailto:"]')
              ?.getAttribute('href') ?? null,
          addressText:
            contactSection
              .querySelector('.contact-channel:not(a) strong')
              ?.textContent.replace(/\\s+/g, ' ')
              .trim() ?? null,
          socialLabels: [
            ...contactSection.querySelectorAll('.contact__socials a'),
          ].map((link) => link.textContent.replace(/\\s+/g, ' ').trim()),
          navigationLabel:
            document
              .querySelector('.desktop-navigation a[href="/#connect"]')
              ?.textContent.replace(/\\s+/g, ' ')
              .trim() ?? null,
          headerCtaText:
            document
              .querySelector('.header-cta[href="/#connect"]')
              ?.textContent.replace(/\\s+/g, ' ')
              .trim() ?? null,
          fields: contactFields.map((field) => ({
            tag: field.tagName.toLowerCase(),
            name: field.getAttribute('name'),
            type: field.getAttribute('type'),
            required: field.required,
            autocomplete: field.getAttribute('autocomplete'),
            label:
              document
                .querySelector('label[for="' + field.id + '"] > span')
                ?.textContent.trim() ?? null,
          })),
          topicOptions: contactForm
            ? [...contactForm.querySelectorAll('select[name="topic"] option')].map(
                (option) => ({
                  value: option.value,
                  label: option.textContent.trim(),
                  disabled: option.disabled,
                })
              )
            : [],
          initiallyValid: contactForm?.checkValidity() ?? null,
          describedBy: contactForm?.getAttribute('aria-describedby') ?? null,
          submitType:
            contactForm
              ?.querySelector('.contact-form__submit')
              ?.getAttribute('type') ?? null,
          submitText:
            contactForm
              ?.querySelector('.contact-form__submit')
              ?.textContent.replace(/\\s+/g, ' ')
              .trim() ?? null,
          statusLive:
            contactForm
              ?.querySelector('.contact-form__status')
              ?.getAttribute('aria-live') ?? null,
          formToRight:
            contactIntroRect && contactFormRect
              ? contactFormRect.left > contactIntroRect.right
              : false,
          formBelow:
            contactIntroRect && contactFormRect
              ? contactFormRect.top > contactIntroRect.bottom
              : false,
          formInsideViewport: contactFormRect
            ? contactFormRect.left >= -1 &&
              contactFormRect.right <= window.innerWidth + 1
            : false,
          backgroundImage: getComputedStyle(contactSection).backgroundImage,
          backgroundColor: getComputedStyle(contactSection).backgroundColor,
          color: getComputedStyle(contactSection).color,
          sectionLabelLightClass:
            contactSectionLabel?.classList.contains('section-label--light') ?? null,
          sectionLabelColor: contactSectionLabel
            ? getComputedStyle(contactSectionLabel).color
            : null,
          introParagraphColor: contactIntroParagraph
            ? getComputedStyle(contactIntroParagraph).color
            : null,
          channelBackgroundColor: contactChannel
            ? getComputedStyle(contactChannel).backgroundColor
            : null,
          channelBorderColor: contactChannel
            ? getComputedStyle(contactChannel).borderColor
            : null,
          channelSmallColor: contactChannelSmall
            ? getComputedStyle(contactChannelSmall).color
            : null,
          channelStrongColor: contactChannelStrong
            ? getComputedStyle(contactChannelStrong).color
            : null,
          socialBackgroundColor: contactSocialLink
            ? getComputedStyle(contactSocialLink).backgroundColor
            : null,
          socialColor: contactSocialLink
            ? getComputedStyle(contactSocialLink).color
            : null,
          formBackgroundColor: contactFormShell
            ? getComputedStyle(contactFormShell).backgroundColor
            : null,
          formBorderColor: contactFormShell
            ? getComputedStyle(contactFormShell).borderColor
            : null,
          formTitleColor: contactFormTitle
            ? getComputedStyle(contactFormTitle).color
            : null,
          formDescriptionColor: contactFormDescription
            ? getComputedStyle(contactFormDescription).color
            : null,
          fieldBackgroundColor: contactFirstField
            ? getComputedStyle(contactFirstField).backgroundColor
            : null,
          fieldBorderColor: contactFirstField
            ? getComputedStyle(contactFirstField).borderColor
            : null,
          fieldColor: contactFirstField
            ? getComputedStyle(contactFirstField).color
            : null,
          fieldColorScheme: contactFirstField
            ? getComputedStyle(contactFirstField).colorScheme
            : null,
          fieldLabelColor: contactFirstLabel
            ? getComputedStyle(contactFirstLabel).color
            : null,
          noteColor: contactNote ? getComputedStyle(contactNote).color : null,
          submitBackgroundColor: contactSubmit
            ? getComputedStyle(contactSubmit).backgroundColor
            : null,
          submitColor: contactSubmit
            ? getComputedStyle(contactSubmit).color
            : null,
        }
      : null;

    return {
      title: document.title,
      pathname: window.location.pathname,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollWidth: root.scrollWidth,
      bodyTextLength: bodyText.trim().length,
      h1Count: document.querySelectorAll('h1').length,
      committeeSections: {
        advisory: Boolean(document.querySelector('#advisory')),
        executive: Boolean(document.querySelector('#executive')),
        subcommittee: Boolean(document.querySelector('#subcommittee')),
      },
      requiredText: ${JSON.stringify(requiredText)}.map((text) => ({
        text,
        present: normalizedBodyText.includes(text.toLowerCase()),
      })),
      hasErrorOverlay: Boolean(document.querySelector(
        'vite-error-overlay, [data-nextjs-dialog], #webpack-dev-server-client-overlay'
      )),
      menuToggleDisplay: menuToggle ? getComputedStyle(menuToggle).display : null,
      desktopNavigationDisplay: desktopNavigation
        ? getComputedStyle(desktopNavigation).display
        : null,
      menuToggleRect: toggleRect
        ? {
            left: toggleRect.left,
            right: toggleRect.right,
            top: toggleRect.top,
            bottom: toggleRect.bottom,
          }
        : null,
      images,
      focusImages,
      focusMediaMasks,
      focusAppearance,
      heroLayout,
      contactLayout,
    };
  })()`);

  await captureScreenshot(filename);
  return state;
}

try {
  const targets = await waitForJson(
    `http://127.0.0.1:${debugPort}/json/list`,
  );
  const pageTarget = targets.find((target) => target.type === 'page');

  if (!pageTarget?.webSocketDebuggerUrl) {
    throw new Error('Chrome did not expose a page target.');
  }

  socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await waitForSocketOpen(socket);

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);

    if (message.id) {
      const command = pendingCommands.get(message.id);
      if (!command) return;
      pendingCommands.delete(message.id);

      if (message.error) {
        command.reject(
          new Error(`${message.error.message} (${message.error.code})`),
        );
      } else {
        command.resolve(message.result);
      }
      return;
    }

    if (message.method === 'Runtime.exceptionThrown') {
      runtimeExceptions.push(
        message.params.exceptionDetails.exception?.description ??
          message.params.exceptionDetails.text,
      );
    }

    if (
      message.method === 'Runtime.consoleAPICalled' &&
      ['error', 'assert'].includes(message.params.type)
    ) {
      consoleErrors.push(
        message.params.args
          .map((argument) => argument.value ?? argument.description ?? '')
          .join(' '),
      );
    }

    if (
      message.method === 'Log.entryAdded' &&
      message.params.entry.level === 'error'
    ) {
      logErrors.push(message.params.entry.text);
    }

    const waiters = eventWaiters.get(message.method);
    if (waiters?.length) {
      eventWaiters.set(message.method, waiters.slice(1));
      waiters[0].resolve(message.params);
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');

  const mastermindsUrl = `${siteUrl}/masterminds/`;
  const chapterUrl = `${siteUrl}/chapter/`;
  const homepageRequiredText = [
    'Ideas for intelligent industry.',
    'Built for curious',
    'Our Mission',
    'Global Network',
    'Excellence',
    'What we explore',
    'Learn it. Build it.',
    'Meet the Masterminds.',
    'Start a conversation.',
    'sltcieeeies@gmail.com',
  ];
  const mastermindsRequiredText = [
    'Meet the Masterminds.',
    'Advisory Panel.',
    'Prof. Lasith Yasakethu',
    'Branch Counselor',
    'Mrs. Warunika Hippola',
    'Branch Academic Advisor',
    'Chathila Walgama',
    'Student Advisor',
    'IEEE Industrial Electronics Society',
    'Executive Committee.',
    'Chanula Kalpitha',
    'Dinush Perera',
    'Sethini Thennakoon',
    'R.M.H. Hashan Rajapaksha',
    'Rochana Senarathne',
    'Suhara Dewmini',
    'Nadun Manawadu',
    'A.A. Chanupa Niduwara',
    'Sub-Committee.',
    'Pahan Jayasundara',
    'Ushan Ranathunga',
    'Piyumi Methmini',
    'Nadun Sandeepa',
    'Nisal Wijesighe',
    'Mohamed Arshad',
    'Yasas Kasthuriarachchi',
  ];
  const chapterRequiredText = [
    'What is IEEE Industrial Electronics Society Student Branch Chapter of SLTC',
  ];

  const desktop = await inspectViewport({
    width: 1440,
    height: 1000,
    mobile: false,
    filename: 'desktop-cdp.png',
    url: siteUrl,
    requiredText: homepageRequiredText,
  });
  await captureElementScreenshot(
    '.hero__inner',
    'hero-composition-desktop-cdp.png',
  );
  await captureElementScreenshot('.about-layout', 'about-desktop-cdp.png');
  await captureElementScreenshot('.value-stack', 'values-desktop-cdp.png');
  await evaluate(`document.querySelector('#focus')?.scrollIntoView({ block: 'center' })`);
  await sleep(220);
  await captureElementScreenshot('.focus-grid', 'focus-desktop-cdp.png');
  await evaluate(`document.querySelector('#connect')?.scrollIntoView({ block: 'center' })`);
  await sleep(220);
  await captureElementScreenshot(
    '#connect',
    'contact-desktop-cdp.png',
  );
  await captureElementScreenshot(
    '.contact__form-shell',
    'contact-form-desktop-cdp.png',
  );

  const homepageChapterLink = await evaluate(`(() => {
    const link = document.querySelector('.about__learn-more');
    return {
      exists: Boolean(link),
      text: link?.textContent.replace(/\\s+/g, ' ').trim() ?? null,
      href: link?.getAttribute('href') ?? null,
    };
  })()`);

  const homepageSectionOrder = await evaluate(`(() => ({
    sections: [...document.querySelectorAll('main > section[id]')].map(
      (section) => section.id
    ),
    navigation: [...document.querySelectorAll('.desktop-navigation a')].map(
      (link) => link.getAttribute('href')
    ),
  }))()`);

  const homepageMastermindsPreview = await evaluate(`(() => {
    const section = document.querySelector('#masterminds-preview');
    const heading = section?.querySelector('h1, h2');
    const primaryLink = section?.querySelector('.masterminds-hero__back');
    const sectionBounds = section?.getBoundingClientRect();
    const contentBounds = section
      ?.querySelector('.masterminds-hero__inner')
      ?.getBoundingClientRect();
    const teamLinks = section
      ? [...section.querySelectorAll('.masterminds-hero__links a')]
      : [];
    return {
      exists: Boolean(section),
      headingTag: heading?.tagName ?? null,
      headingText: heading?.textContent.replace(/\\s+/g, ' ').trim() ?? null,
      primaryHref: primaryLink?.getAttribute('href') ?? null,
      teamHrefs: teamLinks.map((link) => link.getAttribute('href')),
      verticalSpaceDifference:
        sectionBounds && contentBounds
          ? Math.abs(
              contentBounds.top -
                sectionBounds.top -
                (sectionBounds.bottom - contentBounds.bottom)
            )
          : null,
    };
  })()`);
  await captureElementScreenshot(
    '#masterminds-preview',
    'masterminds-preview-desktop-cdp.png',
  );

  const desktopMastermindsTriggered = await evaluate(`(() => {
    const trigger = document.querySelector('.desktop-navigation__trigger');
    trigger?.click();
    return Boolean(trigger);
  })()`);
  await sleep(250);
  const desktopMastermindsState = await evaluate(`(() => {
    const trigger = document.querySelector('.desktop-navigation__trigger');
    const dropdown = document.querySelector('.desktop-navigation__dropdown');
    const submenu = document.querySelector('.desktop-navigation__submenu');
    return {
      expanded: trigger?.getAttribute('aria-expanded'),
      open: dropdown?.classList.contains('is-open'),
      visible: submenu ? getComputedStyle(submenu).visibility === 'visible' : false,
      labels: submenu
        ? [...submenu.querySelectorAll('a')].map((link) => link.textContent.trim())
        : [],
      hrefs: submenu
        ? [...submenu.querySelectorAll('a')].map((link) => link.getAttribute('href'))
        : [],
    };
  })()`);
  await captureScreenshot('desktop-masterminds-menu-cdp.png');
  await evaluate(`document.querySelector('.desktop-navigation__trigger')?.click()`);
  await sleep(100);

  const mastermindsDesktop = await inspectViewport({
    width: 1440,
    height: 1000,
    mobile: false,
    filename: 'masterminds-desktop-cdp.png',
    url: mastermindsUrl,
    requiredText: mastermindsRequiredText,
  });
  const advisoryDesktopLayout = await inspectAdvisoryCards();

  const desktopCommitteeLayout = await evaluate(`(() => {
    const getCard = (role) => {
      const heading = [...document.querySelectorAll(
        '#executive .committee-member-card__content > span'
      )]
        .find((item) => item.textContent.trim() === role);
      if (!heading) return null;
      const bounds = heading.closest('.committee-member-card').getBoundingClientRect();
      return {
        top: bounds.top + window.scrollY,
        bottom: bounds.bottom + window.scrollY,
        left: bounds.left,
        width: bounds.width,
      };
    };
    const positions = {
      chairperson: getCard('Chairperson'),
      viceChairperson: getCard('Vice Chairperson'),
      secretary: getCard('Secretary'),
      treasurer: getCard('Treasurer'),
      webmaster: getCard('Webmaster'),
      assistantSecretary: getCard('Assistant Secretary'),
      assistantTreasurer: getCard('Assistant Treasurer'),
      assistantWebmaster: getCard('Assistant Webmaster'),
    };
    const sameRow = (cards) =>
      cards.every(Boolean) &&
      Math.max(...cards.map((card) => card.top)) -
        Math.min(...cards.map((card) => card.top)) < 2;
    const alignedUnder = (officer, assistant) =>
      officer &&
      assistant &&
      assistant.top > officer.bottom &&
      Math.abs(assistant.left - officer.left) < 2 &&
      Math.abs(assistant.width - officer.width) < 2;
    const cards = [...document.querySelectorAll('.committee-member-card')];
    const positionsAboveNames = cards.every((card) => {
      const content = card.querySelector('.committee-member-card__content');
      const position = content?.querySelector(':scope > span');
      const name = content?.querySelector(':scope > h3');
      return Boolean(
        position?.textContent.trim() &&
        name?.textContent.trim() &&
        position.nextElementSibling === name
      );
    });
    const committeeLabelsRemoved = cards.every((card) => {
      const label = card
        .querySelector('.committee-member-card__content > span')
        ?.textContent.trim();
      return label !== 'Executive Committee' && label !== 'Sub-Committee';
    });
    const subCommitteeGrid = document.querySelector('.subcommittee-grid');
    const subCommitteeCards = [
      ...document.querySelectorAll(
        '#subcommittee .committee-member-card--subcommittee'
      ),
    ].map((card) => {
      const bounds = card.getBoundingClientRect();
      return {
        top: bounds.top + window.scrollY,
        left: bounds.left,
        right: bounds.right,
        width: bounds.width,
        height: bounds.height,
      };
    });
    const subCommitteeGridBounds = subCommitteeGrid?.getBoundingClientRect();
    const subCommitteeWidthRange = subCommitteeCards.length
      ? Math.max(...subCommitteeCards.map((card) => card.width)) -
        Math.min(...subCommitteeCards.map((card) => card.width))
      : Infinity;
    const subCommitteeHeightRange = subCommitteeCards.length
      ? Math.max(...subCommitteeCards.map((card) => card.height)) -
        Math.min(...subCommitteeCards.map((card) => card.height))
      : Infinity;
    const secondRow = subCommitteeCards.slice(4);
    const secondRowCenter = secondRow.length === 3
      ? (secondRow[0].left + secondRow[2].right) / 2
      : null;
    const gridCenter = subCommitteeGridBounds
      ? (subCommitteeGridBounds.left + subCommitteeGridBounds.right) / 2
      : null;

    return {
      positions,
      cardCount: cards.length,
      positionsAboveNames,
      committeeLabelsRemoved,
      subCommitteeLayout: {
        cardCount: subCommitteeCards.length,
        equalWidths: subCommitteeWidthRange < 2,
        equalHeights: subCommitteeHeightRange < 2,
        firstRowSameRow: sameRow(subCommitteeCards.slice(0, 4)),
        secondRowSameRow: sameRow(secondRow),
        secondRowCentered:
          secondRowCenter !== null &&
          gridCenter !== null &&
          Math.abs(secondRowCenter - gridCenter) < 2,
      },
      leadershipSameRow: sameRow([
        positions.chairperson,
        positions.viceChairperson,
      ]),
      officersSameRow: sameRow([
        positions.secretary,
        positions.treasurer,
        positions.webmaster,
      ]),
      assistantsSameRow: sameRow([
        positions.assistantSecretary,
        positions.assistantTreasurer,
        positions.assistantWebmaster,
      ]),
      assistantsAligned: [
        alignedUnder(positions.secretary, positions.assistantSecretary),
        alignedUnder(positions.treasurer, positions.assistantTreasurer),
        alignedUnder(positions.webmaster, positions.assistantWebmaster),
      ],
    };
  })()`);

  await captureElementScreenshot('#advisory', 'advisory-desktop-cdp.png');
  await captureElementScreenshot('#executive', 'executive-desktop-cdp.png');
  await captureElementScreenshot('#subcommittee', 'subcommittee-desktop-cdp.png');

  const chapterDesktop = await inspectViewport({
    width: 1440,
    height: 1000,
    mobile: false,
    filename: 'chapter-desktop-cdp.png',
    url: chapterUrl,
    requiredText: chapterRequiredText,
  });
  await captureElementScreenshot(
    '.chapter-page-layers',
    'chapter-layers-desktop-cdp.png',
  );
  await captureElementScreenshot(
    '.chapter-page-purpose__layout',
    'chapter-purpose-desktop-cdp.png',
  );
  await captureElementScreenshot(
    '.chapter-page-focus__grid',
    'chapter-focus-desktop-cdp.png',
  );
  await captureElementScreenshot(
    '.chapter-page-experience__grid',
    'chapter-experience-desktop-cdp.png',
  );
  await captureElementScreenshot(
    '.chapter-page-cta',
    'chapter-cta-desktop-cdp.png',
  );

  const mobile = await inspectViewport({
    width: 390,
    height: 844,
    mobile: true,
    filename: 'mobile-cdp.png',
    url: siteUrl,
    requiredText: homepageRequiredText,
  });
  await captureElementScreenshot(
    '.hero__inner',
    'hero-composition-mobile-cdp.png',
  );
  await captureElementScreenshot('.about-layout', 'about-mobile-cdp.png');
  await captureElementScreenshot('.value-stack', 'values-mobile-cdp.png');
  await evaluate(`document.querySelector('#focus')?.scrollIntoView({ block: 'center' })`);
  await sleep(220);
  await captureElementScreenshot(
    '#focus .focus-card',
    'focus-card-mobile-cdp.png',
  );

  await captureElementScreenshot(
    '#masterminds-preview',
    'masterminds-preview-mobile-cdp.png',
  );
  await evaluate(`document.querySelector('#connect')?.scrollIntoView({ block: 'center' })`);
  await sleep(220);
  await captureElementScreenshot(
    '#connect',
    'contact-mobile-cdp.png',
  );
  await captureElementScreenshot(
    '.contact__form-shell',
    'contact-form-mobile-cdp.png',
  );

  const mobileMenu = await evaluate(`(() => {
    const toggle = document.querySelector('.menu-toggle');
    toggle?.click();
    return Boolean(toggle);
  })()`);
  await sleep(250);

  const mobileMenuState = await evaluate(`(() => {
    const toggle = document.querySelector('.menu-toggle');
    const navigation = document.querySelector('.mobile-navigation');
    return {
      expanded: toggle?.getAttribute('aria-expanded'),
      open: navigation?.classList.contains('is-open'),
      bodyLocked: document.body.classList.contains('menu-open'),
    };
  })()`);
  const mobileMastermindsTriggered = await evaluate(`(() => {
    const trigger = document.querySelector(
      '.mobile-navigation__group-trigger'
    );
    if (trigger?.getAttribute('aria-expanded') !== 'true') {
      trigger?.click();
    }
    return Boolean(trigger);
  })()`);
  await sleep(250);
  const mobileMastermindsState = await evaluate(`(() => {
    const trigger = document.querySelector(
      '.mobile-navigation__group-trigger'
    );
    const submenu = document.querySelector('.mobile-navigation__submenu');
    return {
      expanded: trigger?.getAttribute('aria-expanded'),
      visible: Boolean(submenu),
      labels: submenu
        ? [...submenu.querySelectorAll('a')].map((link) => link.textContent.trim())
        : [],
      hrefs: submenu
        ? [...submenu.querySelectorAll('a')].map((link) => link.getAttribute('href'))
        : [],
    };
  })()`);
  await captureScreenshot('mobile-menu-cdp.png');

  const mastermindsMobile = await inspectViewport({
    width: 390,
    height: 844,
    mobile: true,
    filename: 'masterminds-mobile-cdp.png',
    url: mastermindsUrl,
    requiredText: mastermindsRequiredText,
  });
  const advisoryMobileLayout = await inspectAdvisoryCards();

  await captureElementScreenshot('#advisory', 'advisory-mobile-cdp.png');
  await captureElementScreenshot('#executive', 'executive-mobile-cdp.png');
  await captureElementScreenshot('#subcommittee', 'subcommittee-mobile-cdp.png');

  const chapterMobile = await inspectViewport({
    width: 390,
    height: 844,
    mobile: true,
    filename: 'chapter-mobile-cdp.png',
    url: chapterUrl,
    requiredText: chapterRequiredText,
  });
  await captureElementScreenshot(
    '.chapter-page-layers',
    'chapter-layers-mobile-cdp.png',
  );
  await captureElementScreenshot(
    '.chapter-page-purpose__layout',
    'chapter-purpose-mobile-cdp.png',
  );
  await captureElementScreenshot(
    '.chapter-page-focus__grid',
    'chapter-focus-mobile-cdp.png',
  );
  await captureElementScreenshot(
    '.chapter-page-experience__grid',
    'chapter-experience-mobile-cdp.png',
  );

  const failures = [];
  const expectedHomepageTitle = 'IEEE IES Student Branch Chapter of SLTC';
  const expectedMastermindsTitle =
    'Masterminds | IEEE IES Student Branch Chapter of SLTC';
  const expectedChapterTitle =
    'What is IEEE Industrial Electronics Society Student Branch Chapter of SLTC?';

  if (
    desktop.title !== expectedHomepageTitle ||
    mobile.title !== expectedHomepageTitle
  ) {
    failures.push('The homepage title does not match the IES chapter identity.');
  }
  if (
    mastermindsDesktop.title !== expectedMastermindsTitle ||
    mastermindsMobile.title !== expectedMastermindsTitle
  ) {
    failures.push('The Masterminds page title does not match its identity.');
  }
  if (
    chapterDesktop.title !== expectedChapterTitle ||
    chapterMobile.title !== expectedChapterTitle
  ) {
    failures.push('The chapter explainer page title does not match its identity.');
  }
  if (
    desktop.bodyTextLength < 500 ||
    mobile.bodyTextLength < 500 ||
    mastermindsDesktop.bodyTextLength < 500 ||
    mastermindsMobile.bodyTextLength < 500 ||
    chapterDesktop.bodyTextLength < 500 ||
    chapterMobile.bodyTextLength < 500
  ) {
    failures.push('One of the rendered pages does not contain enough content.');
  }
  if (
    desktop.requiredText.some((item) => !item.present) ||
    mobile.requiredText.some((item) => !item.present) ||
    mastermindsDesktop.requiredText.some((item) => !item.present) ||
    mastermindsMobile.requiredText.some((item) => !item.present) ||
    chapterDesktop.requiredText.some((item) => !item.present) ||
    chapterMobile.requiredText.some((item) => !item.present)
  ) {
    failures.push('One or more expected page sections or member names are missing.');
  }
  const expectedContactFields = [
    { tag: 'input', name: 'firstName', type: 'text', label: 'First name' },
    { tag: 'input', name: 'lastName', type: 'text', label: 'Last name' },
    { tag: 'input', name: 'email', type: 'email', label: 'Email address' },
    { tag: 'select', name: 'topic', type: null, label: 'Topic' },
    { tag: 'textarea', name: 'message', type: null, label: 'Message' },
  ];
  const expectedContactLinks = ['Facebook', 'LinkedIn', 'IEEE IES'];
  if (
    [desktop, mobile].some((state, stateIndex) => {
      const contact = state.contactLayout;

      return (
        !contact ||
        contact.labelledBy !== 'contact-title' ||
        contact.headingText !== 'Start a conversation.' ||
        contact.formTitle !== 'Send an enquiry' ||
        contact.emailHref !== 'mailto:sltcieeeies@gmail.com' ||
        !contact.addressText?.includes('Ingiriya Road') ||
        !expectedContactLinks.every(
          (label, index) => contact.socialLabels[index] === label,
        ) ||
        contact.navigationLabel !== 'Contact' ||
        contact.headerCtaText !== 'Contact us' ||
        contact.fields.length !== expectedContactFields.length ||
        !expectedContactFields.every((field, index) => {
          const renderedField = contact.fields[index];

          return (
            renderedField?.tag === field.tag &&
            renderedField?.name === field.name &&
            renderedField?.type === field.type &&
            renderedField?.label === field.label &&
            renderedField?.required
          );
        }) ||
        contact.topicOptions.length !== 7 ||
        contact.topicOptions[0]?.value !== '' ||
        !contact.topicOptions[0]?.disabled ||
        contact.initiallyValid !== false ||
        contact.describedBy !== 'contact-form-description' ||
        contact.submitType !== 'submit' ||
        contact.submitText !== 'Send via email' ||
        contact.statusLive !== 'polite' ||
        (stateIndex === 0 ? !contact.formToRight : !contact.formBelow) ||
        !contact.formInsideViewport ||
        !contact.backgroundImage.includes('radial-gradient') ||
        !contact.backgroundImage.includes('linear-gradient') ||
        contact.backgroundColor !== 'rgb(255, 255, 255)' ||
        contact.color !== 'rgb(20, 45, 82)' ||
        contact.sectionLabelLightClass !== false ||
        contact.sectionLabelColor !== 'rgb(0, 100, 149)' ||
        contact.introParagraphColor !== 'rgb(82, 101, 124)' ||
        contact.channelBackgroundColor !== 'rgb(246, 248, 251)' ||
        contact.channelBorderColor !== 'rgb(214, 224, 234)' ||
        contact.channelSmallColor !== 'rgb(82, 101, 124)' ||
        contact.channelStrongColor !== 'rgb(20, 45, 82)' ||
        contact.socialBackgroundColor !== 'rgb(255, 255, 255)' ||
        contact.socialColor !== 'rgb(20, 45, 82)' ||
        contact.formBackgroundColor !== 'rgb(246, 248, 251)' ||
        contact.formBorderColor !== 'rgb(214, 224, 234)' ||
        contact.formTitleColor !== 'rgb(20, 45, 82)' ||
        contact.formDescriptionColor !== 'rgb(82, 101, 124)' ||
        contact.fieldBackgroundColor !== 'rgb(255, 255, 255)' ||
        contact.fieldBorderColor !== 'rgb(214, 224, 234)' ||
        contact.fieldColor !== 'rgb(20, 45, 82)' ||
        contact.fieldColorScheme !== 'light' ||
        contact.fieldLabelColor !== 'rgb(20, 45, 82)' ||
        contact.noteColor !== 'rgb(82, 101, 124)' ||
        contact.submitBackgroundColor !== 'rgb(228, 119, 38)' ||
        contact.submitColor !== 'rgb(6, 20, 38)'
      );
    })
  ) {
    failures.push(
      'The responsive light Contact Us section or enquiry form is incomplete.',
    );
  }
  const expectedHeroHeading =
    'IEEE Industrial Electronics Society Student Branch Chapter of SLTC';
  const expectedHeroMetricValues = ['04', '03', '08', '07'];
  const expectedHeroMetricLabels = [
    'Focus areas',
    'Ways to engage',
    'Executive roles',
    'Sub-committee leads',
  ];
  if (
    [desktop, mobile].some((state, stateIndex) => {
      const hero = state.heroLayout;

      return (
        !hero ||
        hero.headingText !== expectedHeroHeading ||
        hero.textAlign !== 'center' ||
        hero.centerOffset === null ||
        hero.centerOffset > 2 ||
        hero.metricCount !== 4 ||
        hero.metricsFirstRowCount !== (stateIndex === 0 ? 4 : 2) ||
        !hero.metricsInsideViewport ||
        !expectedHeroMetricValues.every(
          (value, index) => hero.metricValues[index] === value,
        ) ||
        !expectedHeroMetricLabels.every(
          (label, index) => hero.metricLabels[index] === label,
        ) ||
        !hero.actionHrefs.includes('#about') ||
        !hero.actionHrefs.includes('#focus') ||
        !hero.orbitPresent ||
        hero.legacyVisualPresent
      );
    })
  ) {
    failures.push('The centered homepage hero composition is incomplete.');
  }
  if (
    desktop.hasErrorOverlay ||
    mobile.hasErrorOverlay ||
    mastermindsDesktop.hasErrorOverlay ||
    mastermindsMobile.hasErrorOverlay ||
    chapterDesktop.hasErrorOverlay ||
    chapterMobile.hasErrorOverlay
  ) {
    failures.push('A framework error overlay is visible.');
  }
  if (
    desktop.innerWidth !== 1440 ||
    mastermindsDesktop.innerWidth !== 1440 ||
    chapterDesktop.innerWidth !== 1440 ||
    mobile.innerWidth !== 390 ||
    mastermindsMobile.innerWidth !== 390 ||
    chapterMobile.innerWidth !== 390
  ) {
    failures.push(
      'Viewport emulation does not match the requested desktop/mobile sizes.',
    );
  }
  if (
    desktop.scrollWidth > desktop.innerWidth + 1 ||
    mobile.scrollWidth > mobile.innerWidth + 1 ||
    mastermindsDesktop.scrollWidth > mastermindsDesktop.innerWidth + 1 ||
    mastermindsMobile.scrollWidth > mastermindsMobile.innerWidth + 1 ||
    chapterDesktop.scrollWidth > chapterDesktop.innerWidth + 1 ||
    chapterMobile.scrollWidth > chapterMobile.innerWidth + 1
  ) {
    failures.push('Horizontal overflow was detected on one of the pages.');
  }
  if (
    desktop.pathname !== '/' ||
    mobile.pathname !== '/' ||
    mastermindsDesktop.pathname !== '/masterminds/' ||
    mastermindsMobile.pathname !== '/masterminds/' ||
    chapterDesktop.pathname !== '/chapter/' ||
    chapterMobile.pathname !== '/chapter/'
  ) {
    failures.push('Homepage, Masterminds, or chapter page routing is incorrect.');
  }
  if (
    Object.values(desktop.committeeSections).some(Boolean) ||
    Object.values(mobile.committeeSections).some(Boolean)
  ) {
    failures.push('Committee sections are still rendered on the homepage.');
  }
  if (
    Object.values(mastermindsDesktop.committeeSections).some(
      (present) => !present,
    ) ||
    Object.values(mastermindsMobile.committeeSections).some(
      (present) => !present,
    )
  ) {
    failures.push('The standalone Masterminds page is missing a committee section.');
  }
  if (
    [
      desktop,
      mobile,
      mastermindsDesktop,
      mastermindsMobile,
      chapterDesktop,
      chapterMobile,
    ].some((state) => state.h1Count !== 1)
  ) {
    failures.push('Each page must contain exactly one primary heading.');
  }
  if (
    desktop.desktopNavigationDisplay === 'none' ||
    mastermindsDesktop.desktopNavigationDisplay === 'none' ||
    chapterDesktop.desktopNavigationDisplay === 'none'
  ) {
    failures.push('Desktop navigation is hidden at 1440px.');
  }
  if (
    mobile.menuToggleDisplay === 'none' ||
    mastermindsMobile.menuToggleDisplay === 'none' ||
    !mobile.menuToggleRect ||
    mobile.menuToggleRect.left < 0 ||
    mobile.menuToggleRect.right > mobile.innerWidth ||
    !mastermindsMobile.menuToggleRect ||
    mastermindsMobile.menuToggleRect.left < 0 ||
    mastermindsMobile.menuToggleRect.right > mastermindsMobile.innerWidth ||
    chapterMobile.menuToggleDisplay === 'none' ||
    !chapterMobile.menuToggleRect ||
    chapterMobile.menuToggleRect.left < 0 ||
    chapterMobile.menuToggleRect.right > chapterMobile.innerWidth
  ) {
    failures.push('The mobile menu control is not visible within the viewport.');
  }
  if (
    !mobileMenu ||
    !mobileMenuState.open ||
    mobileMenuState.expanded !== 'true' ||
    !mobileMenuState.bodyLocked
  ) {
    failures.push('The mobile navigation did not open correctly.');
  }
  const expectedMastermindsLabels = [
    'Advisory Panel',
    'Executive Committee',
    'Sub-Committee',
  ];
  const expectedMastermindsHrefs = [
    '/masterminds/#advisory',
    '/masterminds/#executive',
    '/masterminds/#subcommittee',
  ];
  if (
    !homepageChapterLink.exists ||
    homepageChapterLink.text?.toLowerCase() !== 'learn more' ||
    homepageChapterLink.href !== '/chapter/'
  ) {
    failures.push('The homepage Learn more link does not target the chapter page.');
  }
  const activitiesSectionIndex = homepageSectionOrder.sections.indexOf('activities');
  const focusSectionIndex = homepageSectionOrder.sections.indexOf('focus');
  const activitiesNavigationIndex = homepageSectionOrder.navigation.indexOf(
    '/#activities',
  );
  const focusNavigationIndex = homepageSectionOrder.navigation.indexOf('/#focus');
  if (
    activitiesSectionIndex < 0 ||
    focusSectionIndex < 0 ||
    activitiesSectionIndex > focusSectionIndex ||
    activitiesNavigationIndex < 0 ||
    focusNavigationIndex < 0 ||
    activitiesNavigationIndex > focusNavigationIndex
  ) {
    failures.push('Activities must appear before Focus Areas in the page and navigation.');
  }
  if (
    !homepageMastermindsPreview.exists ||
    homepageMastermindsPreview.headingTag !== 'H2' ||
    !homepageMastermindsPreview.headingText?.includes('Meet the Masterminds.') ||
    homepageMastermindsPreview.primaryHref !== '/masterminds/' ||
    homepageMastermindsPreview.verticalSpaceDifference === null ||
    homepageMastermindsPreview.verticalSpaceDifference > 2 ||
    !expectedMastermindsHrefs.every((href) =>
      homepageMastermindsPreview.teamHrefs.includes(href),
    )
  ) {
    failures.push(
      'The homepage Masterminds preview or its cross-page links are incorrect.',
    );
  }
  if (
    !desktopMastermindsTriggered ||
    desktopMastermindsState.expanded !== 'true' ||
    !desktopMastermindsState.open ||
    !desktopMastermindsState.visible ||
    !expectedMastermindsLabels.every((label) =>
      desktopMastermindsState.labels.some((value) => value.includes(label)),
    ) ||
    !expectedMastermindsHrefs.every((href) =>
      desktopMastermindsState.hrefs.includes(href),
    )
  ) {
    failures.push('The desktop Masterminds dropdown did not open correctly.');
  }
  if (
    !mobileMastermindsTriggered ||
    mobileMastermindsState.expanded !== 'true' ||
    !mobileMastermindsState.visible ||
    !expectedMastermindsLabels.every((label) =>
      mobileMastermindsState.labels.some((value) => value.includes(label)),
    ) ||
    !expectedMastermindsHrefs.every((href) =>
      mobileMastermindsState.hrefs.includes(href),
    )
  ) {
    failures.push('The mobile Masterminds submenu did not open correctly.');
  }
  if (
    [
      ...desktop.images,
      ...mobile.images,
      ...mastermindsDesktop.images,
      ...mastermindsMobile.images,
      ...chapterDesktop.images,
      ...chapterMobile.images,
    ].some(
      (image) => !image.complete || image.naturalWidth === 0,
    )
  ) {
    failures.push('One or more logo images failed to render.');
  }
  if (
    [desktop, mobile].some(
      (state) => {
        const focusMasksRemoved =
          state.focusMediaMasks.length === 4 &&
          state.focusMediaMasks.every(({ maskImage, webkitMaskImage }) =>
            [maskImage, webkitMaskImage].every(
              (value) => String(value ?? '').trim().toLowerCase() === 'none',
            ),
          );

        return (
          state.focusImages.length !== 4 ||
          state.focusImages.some(
            (image) =>
              !image.complete ||
              image.naturalWidth < 800 ||
              image.naturalHeight < 800 ||
              !image.alt ||
              image.objectFit !== 'contain',
          ) ||
          !focusMasksRemoved ||
          !state.focusAppearance?.lightClass ||
          state.focusAppearance?.darkClass ||
          state.focusAppearance?.backgroundColor !== 'rgb(255, 255, 255)' ||
          state.focusAppearance?.color !== 'rgb(20, 45, 82)' ||
          state.focusAppearance?.descriptionColor !== 'rgb(82, 101, 124)' ||
          state.focusAppearance?.flowBackground !== 'rgb(246, 248, 251)'
        );
      },
    )
  ) {
    failures.push(
      'The simple light Focus Areas treatment or contained illustrations are incomplete.',
    );
  }
  if (runtimeExceptions.length || consoleErrors.length || logErrors.length) {
    failures.push('A page emitted a runtime, console, or browser log error.');
  }
  if (
    !desktopCommitteeLayout.leadershipSameRow ||
    !desktopCommitteeLayout.officersSameRow ||
    !desktopCommitteeLayout.assistantsSameRow ||
    desktopCommitteeLayout.assistantsAligned.some((aligned) => !aligned)
  ) {
    failures.push('The Executive Committee hierarchy is not aligned as 2–3–3.');
  }
  if (
    desktopCommitteeLayout.cardCount !== 18 ||
    !desktopCommitteeLayout.positionsAboveNames ||
    !desktopCommitteeLayout.committeeLabelsRemoved
  ) {
    failures.push(
      'Committee cards do not consistently show the position above the member name.',
    );
  }
  if (
    desktopCommitteeLayout.subCommitteeLayout.cardCount !== 7 ||
    !desktopCommitteeLayout.subCommitteeLayout.equalWidths ||
    !desktopCommitteeLayout.subCommitteeLayout.equalHeights ||
    !desktopCommitteeLayout.subCommitteeLayout.firstRowSameRow ||
    !desktopCommitteeLayout.subCommitteeLayout.secondRowSameRow ||
    !desktopCommitteeLayout.subCommitteeLayout.secondRowCentered
  ) {
    failures.push(
      'Sub-Committee cards are not equal-sized in a centered 4-plus-3 layout.',
    );
  }
  if (
    !advisoryDesktopLayout.sectionExists ||
    advisoryDesktopLayout.cardCount !== 3 ||
    advisoryDesktopLayout.content.some(
      (member) =>
        !member.namePresent ||
        !member.primaryRolePresent ||
        !member.cardLabelPresent,
    ) ||
    !advisoryDesktopLayout.desktop.firstRowSameRow ||
    !advisoryDesktopLayout.desktop.firstRowCentered ||
    !advisoryDesktopLayout.desktop.secondRowBelow ||
    !advisoryDesktopLayout.desktop.secondRowCentered ||
    !advisoryDesktopLayout.desktop.equalWidths ||
    !advisoryDesktopLayout.desktop.equalHeights
  ) {
    failures.push(
      'Advisory Panel cards are missing required member content or the centered 2-plus-1 desktop layout.',
    );
  }
  if (
    !advisoryMobileLayout.sectionExists ||
    advisoryMobileLayout.cardCount !== 3 ||
    advisoryMobileLayout.content.some(
      (member) =>
        !member.namePresent ||
        !member.primaryRolePresent ||
        !member.cardLabelPresent,
    ) ||
    !advisoryMobileLayout.mobile.oneColumn ||
    !advisoryMobileLayout.mobile.cardsInsideViewport ||
    !advisoryMobileLayout.mobile.centered
  ) {
    failures.push(
      'Advisory Panel cards are missing required member content or a centered one-column mobile layout.',
    );
  }

  const report = {
    pass: failures.length === 0,
    desktop,
    mobile,
    mastermindsDesktop,
    mastermindsMobile,
    chapterDesktop,
    chapterMobile,
    homepageChapterLink,
    homepageSectionOrder,
    homepageMastermindsPreview,
    advisoryDesktopLayout,
    advisoryMobileLayout,
    desktopCommitteeLayout,
    desktopMastermindsState,
    mobileMenuState,
    mobileMastermindsState,
    runtimeExceptions,
    consoleErrors,
    logErrors,
    failures,
  };

  await writeFile(
    path.join(outputDirectory, 'cdp-report.json'),
    JSON.stringify(report, null, 2),
  );

  if (failures.length) {
    throw new Error(failures.join(' '));
  }

  console.log('CDP_VERIFICATION=PASS');
  console.log(`DESKTOP_WIDTH=${desktop.innerWidth}`);
  console.log(`MOBILE_WIDTH=${mobile.innerWidth}`);
  console.log(`MOBILE_MENU_OPEN=${mobileMenuState.open}`);
  console.log(`MASTERMINDS_PAGE=${mastermindsDesktop.pathname}`);
  console.log(`CHAPTER_PAGE=${chapterDesktop.pathname}`);
  console.log(`HORIZONTAL_OVERFLOW=NONE`);
  console.log(`RUNTIME_EXCEPTIONS=${runtimeExceptions.length}`);
  console.log(`CONSOLE_ERRORS=${consoleErrors.length}`);
  console.log(`LOG_ERRORS=${logErrors.length}`);
} finally {
  clearTimeout(hardTimeout);
  socket?.close();
}
