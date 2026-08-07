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
  const homepageRequiredText = [
    'Ideas for intelligent industry.',
    'Built for curious',
    'Our Mission',
    'Global Network',
    'Excellence',
    'What we explore',
    'Learn it. Build it.',
    'Meet the Masterminds.',
    'Ready to engineer',
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

  const desktop = await inspectViewport({
    width: 1440,
    height: 1000,
    mobile: false,
    filename: 'desktop-cdp.png',
    url: siteUrl,
    requiredText: homepageRequiredText,
  });
  await captureElementScreenshot(
    '.hero-visual',
    'hero-visual-desktop-cdp.png',
  );
  await captureElementScreenshot('.about-layout', 'about-desktop-cdp.png');
  await captureElementScreenshot('.value-stack', 'values-desktop-cdp.png');
  await captureElementScreenshot('.focus-grid', 'focus-desktop-cdp.png');

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

  const mobile = await inspectViewport({
    width: 390,
    height: 844,
    mobile: true,
    filename: 'mobile-cdp.png',
    url: siteUrl,
    requiredText: homepageRequiredText,
  });
  await captureElementScreenshot(
    '.hero-visual',
    'hero-visual-mobile-cdp.png',
  );
  await captureElementScreenshot('.about-layout', 'about-mobile-cdp.png');
  await captureElementScreenshot('.value-stack', 'values-mobile-cdp.png');
  await captureElementScreenshot(
    '#focus .focus-card',
    'focus-card-mobile-cdp.png',
  );

  await captureElementScreenshot(
    '#masterminds-preview',
    'masterminds-preview-mobile-cdp.png',
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

  const failures = [];
  const expectedHomepageTitle = 'IEEE IES Student Branch Chapter of SLTC';
  const expectedMastermindsTitle =
    'Masterminds | IEEE IES Student Branch Chapter of SLTC';

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
    desktop.bodyTextLength < 500 ||
    mobile.bodyTextLength < 500 ||
    mastermindsDesktop.bodyTextLength < 500 ||
    mastermindsMobile.bodyTextLength < 500
  ) {
    failures.push('One of the rendered pages does not contain enough content.');
  }
  if (
    desktop.requiredText.some((item) => !item.present) ||
    mobile.requiredText.some((item) => !item.present) ||
    mastermindsDesktop.requiredText.some((item) => !item.present) ||
    mastermindsMobile.requiredText.some((item) => !item.present)
  ) {
    failures.push('One or more expected page sections or member names are missing.');
  }
  if (
    desktop.hasErrorOverlay ||
    mobile.hasErrorOverlay ||
    mastermindsDesktop.hasErrorOverlay ||
    mastermindsMobile.hasErrorOverlay
  ) {
    failures.push('A framework error overlay is visible.');
  }
  if (
    desktop.innerWidth !== 1440 ||
    mastermindsDesktop.innerWidth !== 1440 ||
    mobile.innerWidth !== 390 ||
    mastermindsMobile.innerWidth !== 390
  ) {
    failures.push(
      'Viewport emulation does not match the requested desktop/mobile sizes.',
    );
  }
  if (
    desktop.scrollWidth > desktop.innerWidth + 1 ||
    mobile.scrollWidth > mobile.innerWidth + 1 ||
    mastermindsDesktop.scrollWidth > mastermindsDesktop.innerWidth + 1 ||
    mastermindsMobile.scrollWidth > mastermindsMobile.innerWidth + 1
  ) {
    failures.push('Horizontal overflow was detected on one of the pages.');
  }
  if (
    desktop.pathname !== '/' ||
    mobile.pathname !== '/' ||
    mastermindsDesktop.pathname !== '/masterminds/' ||
    mastermindsMobile.pathname !== '/masterminds/'
  ) {
    failures.push('Homepage or Masterminds page routing is incorrect.');
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
    [desktop, mobile, mastermindsDesktop, mastermindsMobile].some(
      (state) => state.h1Count !== 1,
    )
  ) {
    failures.push('Each page must contain exactly one primary heading.');
  }
  if (
    desktop.desktopNavigationDisplay === 'none' ||
    mastermindsDesktop.desktopNavigationDisplay === 'none'
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
    mastermindsMobile.menuToggleRect.right > mastermindsMobile.innerWidth
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
    ].some(
      (image) => !image.complete || image.naturalWidth === 0,
    )
  ) {
    failures.push('One or more logo images failed to render.');
  }
  if (
    [desktop, mobile].some(
      (state) => {
        const isVerticalLinearGradientMask = (value) => {
          const normalized = String(value ?? '').trim().toLowerCase();

          if (
            !normalized ||
            normalized === 'none' ||
            !normalized.includes('linear-gradient(')
          ) {
            return false;
          }

          const gradientStart =
            normalized.indexOf('linear-gradient(') + 'linear-gradient('.length;
          const gradientPrefix = normalized.slice(gradientStart);
          const direction = gradientPrefix.match(
            /^\s*(to\s+[a-z\s-]+|-?(?:\d+(?:\.\d+)?|\.\d+)(?:deg|grad|rad|turn))\s*,/,
          )?.[1];

          if (!direction) {
            return true;
          }

          if (direction === 'to top' || direction === 'to bottom') {
            return true;
          }

          const angleMatch = direction.match(
            /^(-?\d+(?:\.\d+)?)(deg|grad|rad|turn)$/,
          );

          if (angleMatch) {
            const value = Number(angleMatch[1]);
            const verticalPeriod = {
              deg: 180,
              grad: 200,
              rad: Math.PI,
              turn: 0.5,
            }[angleMatch[2]];
            const remainder = Math.abs(value % verticalPeriod);
            return (
              remainder < 0.001 ||
              Math.abs(remainder - verticalPeriod) < 0.001
            );
          }

          return false;
        };
        const focusMasksComplete =
          state.focusMediaMasks.length === 4 &&
          state.focusMediaMasks.every(({ maskImage, webkitMaskImage }) =>
            [maskImage, webkitMaskImage].some(isVerticalLinearGradientMask),
          );

        return (
          state.focusImages.length !== 4 ||
          state.focusImages.some(
            (image) =>
              !image.complete ||
              image.naturalWidth < 800 ||
              image.naturalHeight < 800 ||
              !image.alt,
          ) ||
          !focusMasksComplete
        );
      },
    )
  ) {
    failures.push(
      'The four Focus Areas illustrations or their vertical fade masks are incomplete.',
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
  console.log(`HORIZONTAL_OVERFLOW=NONE`);
  console.log(`RUNTIME_EXCEPTIONS=${runtimeExceptions.length}`);
  console.log(`CONSOLE_ERRORS=${consoleErrors.length}`);
  console.log(`LOG_ERRORS=${logErrors.length}`);
} finally {
  clearTimeout(hardTimeout);
  socket?.close();
}
