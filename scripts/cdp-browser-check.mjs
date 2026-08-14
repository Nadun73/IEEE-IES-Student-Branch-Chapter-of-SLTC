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
  console.error('CDP browser verification exceeded 110 seconds.');
  process.exit(2);
}, 110_000);

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

function send(method, params = {}, timeoutMilliseconds = 15_000) {
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

async function activatePoint({ x, y, touch = false }) {
  if (touch) {
    await send('Input.synthesizeTapGesture', {
      x,
      y,
      duration: 80,
      gestureSourceType: 'touch',
    });
    return;
  }

  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
}

async function pressKey(key, code, windowsVirtualKeyCode) {
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code,
    windowsVirtualKeyCode,
  });
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    windowsVirtualKeyCode,
  });
}

async function inspectVolunteerPicker({ filename, touch }) {
  await evaluate(`document
    .querySelector('.volunteer-form select[name="preferredEvent"]')
    ?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })`);
  await sleep(100);
  const trigger = await evaluate(`(() => {
    const select = document.querySelector(
      '.volunteer-form select[name="preferredEvent"]'
    );
    if (!select) return null;
    const bounds = select.getBoundingClientRect();
    return {
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    };
  })()`);

  if (!trigger) {
    return { exists: false };
  }

  await activatePoint({ ...trigger, touch });
  await sleep(180);
  const openedFromInput = await evaluate(`document
    .querySelector('.volunteer-form select[name="preferredEvent"]')
    ?.matches(':open') ?? false`);
  if (!openedFromInput) {
    await send('Runtime.evaluate', {
      expression: `document
        .querySelector('.volunteer-form select[name="preferredEvent"]')
        ?.showPicker()`,
      userGesture: true,
      returnByValue: true,
    });
    await sleep(120);
  }

  const openState = await evaluate(`(() => {
    const select = document.querySelector(
      '.volunteer-form select[name="preferredEvent"]'
    );
    const pickerStyle = getComputedStyle(select, '::picker(select)');
    const selectBounds = select.getBoundingClientRect();
    const options = [...select.options].map((option) => {
      const style = getComputedStyle(option);
      const bounds = option.getBoundingClientRect();
      return {
        value: option.value,
        label: option.textContent.trim(),
        disabled: option.disabled,
        color: style.color,
        backgroundColor: style.backgroundColor,
        minHeight: Number.parseFloat(style.minHeight),
        height: bounds.height,
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
      };
    });
    return {
      exists: Boolean(select),
      supported: CSS.supports('appearance: base-select'),
      open: select.matches(':open'),
      appearance: getComputedStyle(select).appearance,
      pickerAppearance: pickerStyle.appearance,
      pickerBackgroundColor: pickerStyle.backgroundColor,
      pickerBackgroundImage: pickerStyle.backgroundImage,
      pickerBoxShadow: pickerStyle.boxShadow,
      pickerBorderRadius: Number.parseFloat(pickerStyle.borderRadius),
      pickerBorderColor: pickerStyle.borderColor,
      selectBounds: {
        left: selectBounds.left,
        right: selectBounds.right,
        width: selectBounds.width,
      },
      options,
      optionPanelAligned: (() => {
        const visibleOptions = options.filter((option) => option.height > 0);
        if (!visibleOptions.length) return false;
        const left = Math.min(...visibleOptions.map((option) => option.left));
        const right = Math.max(...visibleOptions.map((option) => option.right));
        const optionPanelCenter = (left + right) / 2;
        const selectCenter = (selectBounds.left + selectBounds.right) / 2;
        return (
          Math.abs(optionPanelCenter - selectCenter) <= 2 &&
          Math.abs(right - left + 14 - selectBounds.width) <= 3
        );
      })(),
      insideViewport: options
        .filter((option) => option.height > 0)
        .every(
          (option) =>
            option.left >= -1 &&
            option.right <= window.innerWidth + 1 &&
            option.top >= -1 &&
            option.bottom <= window.innerHeight + 1
        ),
    };
  })()`);

  await captureScreenshot(filename);

  const firstOption = openState.options.find(
    (option) => !option.disabled && option.height > 0
  );
  if (touch && firstOption) {
    await activatePoint({
      x: (firstOption.left + firstOption.right) / 2,
      y: (firstOption.top + firstOption.bottom) / 2,
      touch: false,
    });
  } else {
    await pressKey('ArrowDown', 'ArrowDown', 40);
    await pressKey('Enter', 'Enter', 13);
  }
  await sleep(120);

  const selectionState = await evaluate(`(() => {
    const select = document.querySelector(
      '.volunteer-form select[name="preferredEvent"]'
    );
    return {
      value: select?.value ?? null,
      formDataValue: select?.form
        ? new FormData(select.form).get('preferredEvent')
        : null,
      closedAfterSelection: select ? !select.matches(':open') : false,
    };
  })()`);

  const reopenTrigger = await evaluate(`(() => {
    const select = document.querySelector(
      '.volunteer-form select[name="preferredEvent"]'
    );
    const bounds = select?.getBoundingClientRect();
    return bounds
      ? {
          x: bounds.left + bounds.width / 2,
          y: bounds.top + bounds.height / 2,
        }
      : null;
  })()`);
  if (reopenTrigger) {
    await activatePoint({ ...reopenTrigger, touch });
    await sleep(80);
    const reopenedFromInput = await evaluate(`document
      .querySelector('.volunteer-form select[name="preferredEvent"]')
      ?.matches(':open') ?? false`);
    if (!reopenedFromInput) {
      await send('Runtime.evaluate', {
        expression: `document
          .querySelector('.volunteer-form select[name="preferredEvent"]')
          ?.showPicker()`,
        userGesture: true,
        returnByValue: true,
      });
      await sleep(80);
    }
    await pressKey('Escape', 'Escape', 27);
    await sleep(80);
  }

  const escapeState = await evaluate(`(() => {
    const select = document.querySelector(
      '.volunteer-form select[name="preferredEvent"]'
    );
    return {
      closed: select ? !select.matches(':open') : false,
      focusReturned: document.activeElement === select,
    };
  })()`);

  return { ...openState, ...selectionState, ...escapeState };
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
  await evaluate(`(() => {
    const images = [...document.images];
    images.forEach((image) => {
      image.loading = 'eager';
    });
    return Promise.race([
      Promise.all(
        images.map((image) =>
          typeof image.decode === 'function'
            ? image.decode().catch(() => undefined)
            : Promise.resolve(),
        ),
      ),
      new Promise((resolve) => window.setTimeout(resolve, 10_000)),
    ]);
  })()`);
  await sleep(120);

  const state = await evaluate(`(() => {
    const root = document.documentElement;
    const bodyText = document.body?.innerText ?? '';
    const normalizedBodyText = bodyText.replace(/\\s+/g, ' ').toLowerCase();
    const menuToggle = document.querySelector('.menu-toggle');
    const desktopNavigation = document.querySelector('.desktop-navigation');
    const mobileNavigation = document.querySelector('.mobile-navigation nav');
    const toggleRect = menuToggle?.getBoundingClientRect();
    const readTopLevelNavigation = (navigation) =>
      navigation
        ? [...navigation.children].map((item) => {
            const control = item.matches('a, button')
              ? item
              : item.querySelector(':scope > a, :scope > button');
            const rawLabel =
              control?.textContent.replace(/\\s+/g, ' ').trim() ?? '';

            return {
              label: rawLabel.replace(/^0\\d\\s*/, ''),
              ordinal:
                control?.querySelector(':scope > span')?.textContent.trim() ?? null,
              href: control?.getAttribute('href') ?? null,
              active: control?.classList.contains('is-active') ?? false,
              ariaCurrent: control?.getAttribute('aria-current') ?? null,
            };
          })
        : [];
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
    const homepageVolunteerSection = document.querySelector(
      'main > #volunteer.volunteer-callout'
    );
    const volunteerPanel = homepageVolunteerSection?.querySelector(
      '.programme-panel'
    );
    const volunteerHeading = homepageVolunteerSection?.querySelector('h2');
    const activitiesSection = document.querySelector('#activities.activities');
    const activitiesDecorationStyles = activitiesSection
      ? getComputedStyle(activitiesSection, '::after')
      : null;
    const volunteerSectionRect = homepageVolunteerSection?.getBoundingClientRect();
    const volunteerPanelRect = volunteerPanel?.getBoundingClientRect();
    const volunteerSectionStyles = homepageVolunteerSection
      ? getComputedStyle(homepageVolunteerSection)
      : null;
    const volunteerPanelStyles = volunteerPanel
      ? getComputedStyle(volunteerPanel)
      : null;
    const volunteerCta = volunteerPanel
      ? {
          tag: volunteerPanel.tagName.toLowerCase(),
          href: volunteerPanel.getAttribute('href'),
          label: volunteerPanel.getAttribute('aria-label'),
          sectionCount: document.querySelectorAll('main > #volunteer').length,
          sectionLabelledBy:
            homepageVolunteerSection?.getAttribute('aria-labelledby'),
          headingId: volunteerHeading?.id ?? null,
          headingText:
            volunteerHeading?.textContent.replace(/\s+/g, ' ').trim() ?? null,
          insideActivities: Boolean(
            document.querySelector('#activities .programme-panel')
          ),
          nestedInteractiveCount: volunteerPanel.querySelectorAll(
            'a, button, input, select, textarea'
          ).length,
          hasWatermark: Boolean(
            volunteerPanel.querySelector('.programme-panel__watermark')
          ),
          hasGraphic: Boolean(
            volunteerPanel.querySelector('.programme-panel__graphic')
          ),
          orbitCount: volunteerPanel.querySelectorAll('.programme-orbit').length,
          hasStatus: Boolean(volunteerPanel.querySelector('.programme-status')),
          hasIndex: Boolean(
            volunteerPanel.querySelector('.programme-panel__index')
          ),
          sectionInsideViewport:
            volunteerSectionRect.left >= -1 &&
            volunteerSectionRect.right <= window.innerWidth + 1,
          panelInsideViewport:
            volunteerPanelRect.left >= -1 &&
            volunteerPanelRect.right <= window.innerWidth + 1,
          panelHeight: volunteerPanelRect.height,
          sectionPaperClass:
            homepageVolunteerSection.classList.contains('section--paper'),
          sectionPaddingTop: Number.parseFloat(
            volunteerSectionStyles.paddingTop
          ),
          sectionBackgroundImage: volunteerSectionStyles.backgroundImage,
          transitionDecorationBackgroundImage:
            activitiesDecorationStyles?.backgroundImage ?? 'none',
          transitionDecorationWidth: Number.parseFloat(
            activitiesDecorationStyles?.width ?? '0'
          ),
          transitionDecorationHeight: Number.parseFloat(
            activitiesDecorationStyles?.height ?? '0'
          ),
          transitionDecorationPointerEvents:
            activitiesDecorationStyles?.pointerEvents ?? null,
          panelBackgroundColor: volunteerPanelStyles.backgroundColor,
          beforeBackgroundImage: getComputedStyle(
            volunteerPanel,
            '::before'
          ).backgroundImage,
          afterBackgroundImage: getComputedStyle(
            volunteerPanel,
            '::after'
          ).backgroundImage,
        }
      : null;
    const photoAlbumSection = document.querySelector(
      '.photo-albums, .photo-albums-archive'
    );
    const photoAlbumCards = photoAlbumSection
      ? [...photoAlbumSection.querySelectorAll('.photo-album-card')]
      : [];
    const photoAlbumRects = photoAlbumCards.map((card) =>
      card.getBoundingClientRect()
    );
    const photoAlbumLayout = photoAlbumSection
      ? {
          id: photoAlbumSection.id,
          preview: photoAlbumSection.classList.contains('photo-albums'),
          heading:
            photoAlbumSection
              .querySelector('h2')
              ?.textContent.replace(/\\s+/g, ' ')
              .trim() ?? null,
          viewAllHref:
            photoAlbumSection
              .querySelector('a[href="/albums/"]')
              ?.getAttribute('href') ?? null,
          backHref:
            document
              .querySelector('.photo-albums-hero__back')
              ?.getAttribute('href') ?? null,
          cardCount: photoAlbumCards.length,
          firstRowCount: photoAlbumRects.filter(
            (rect) =>
              Math.abs(rect.top - (photoAlbumRects[0]?.top ?? rect.top)) < 3
          ).length,
          cardsInsideViewport: photoAlbumRects.every(
            (rect) => rect.left >= -1 && rect.right <= window.innerWidth + 1
          ),
          nestedInteractiveCount: photoAlbumCards.reduce(
            (total, card) =>
              total +
              card.querySelectorAll(
                '.photo-album-card__link a, .photo-album-card__link button'
              ).length,
            0
          ),
          cards: photoAlbumCards.map((card) => {
            const link = card.querySelector('.photo-album-card__link');
            const image = card.querySelector('.photo-album-card__visual img');
            return {
              id: card.dataset.albumId,
              title:
                card.querySelector('h3')?.textContent.trim() ?? null,
              href: link?.getAttribute('href') ?? null,
              target: link?.getAttribute('target') ?? null,
              rel: link?.getAttribute('rel') ?? null,
              ariaLabel: link?.getAttribute('aria-label') ?? null,
              imageComplete: image?.complete ?? false,
              imageWidth: image?.naturalWidth ?? 0,
              imageHeight: image?.naturalHeight ?? 0,
              imageObjectFit: image ? getComputedStyle(image).objectFit : null,
            };
          }),
        }
      : null;
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
    const volunteerSection = document.querySelector(
      '#volunteer-home.volunteer-page'
    );
    const volunteerIntro = volunteerSection?.querySelector(
      '.volunteer-page__intro'
    );
    const volunteerApplication = volunteerSection?.querySelector(
      '.volunteer-application'
    );
    const volunteerBenefits = volunteerSection?.querySelector(
      '.volunteer-page__benefits'
    );
    const volunteerSignal = volunteerSection?.querySelector(
      '.volunteer-page__signal'
    );
    const volunteerForm = volunteerSection?.querySelector('.volunteer-form');
    const volunteerIntroRect = volunteerIntro?.getBoundingClientRect();
    const volunteerApplicationRect =
      volunteerApplication?.getBoundingClientRect();
    const volunteerControls = volunteerForm
      ? [...volunteerForm.querySelectorAll('input, select, textarea')]
      : [];
    const volunteerInterests = volunteerForm
      ? [...volunteerForm.querySelectorAll('input[name="interests"]')]
      : [];
    const volunteerPreferredEvent = volunteerForm?.querySelector(
      'select[name="preferredEvent"]'
    );
    const volunteerParticipationModes = volunteerForm
      ? [
          ...volunteerForm.querySelectorAll(
            'input[name="participationMode"]'
          ),
        ]
      : [];
    const volunteerInterestGroup = volunteerForm
      ?.querySelector('input[name="interests"]')
      ?.closest('fieldset.volunteer-form__section');
    const volunteerSubmit = volunteerForm?.querySelector(
      '.volunteer-form__submit'
    );
    const volunteerClear = volunteerForm?.querySelector(
      '.volunteer-form__clear'
    );
    const volunteerStatus = volunteerForm?.querySelector(
      '.volunteer-form__status'
    );
    const volunteerLayout = volunteerSection
      ? {
          exists: true,
          labelledBy: volunteerSection.getAttribute('aria-labelledby'),
          headingText:
            volunteerSection
              .querySelector('h1')
              ?.textContent.replace(/\\s+/g, ' ')
              .trim() ?? null,
          formTitle:
            volunteerApplication
              ?.querySelector('h2')
              ?.textContent.replace(/\\s+/g, ' ')
              .trim() ?? null,
          backHref:
            volunteerSection
              .querySelector('.volunteer-page__back')
              ?.getAttribute('href') ?? null,
          footerTopHref:
            document
              .querySelector('.site-footer .footer-bottom a')
              ?.getAttribute('href') ?? null,
          backToTopHref:
            document.querySelector('.back-to-top')?.getAttribute('href') ?? null,
          describedBy: volunteerForm?.getAttribute('aria-describedby') ?? null,
          initiallyValid: volunteerForm?.checkValidity() ?? null,
          sectionCount:
            volunteerForm?.querySelectorAll(
              ':scope > fieldset.volunteer-form__section'
            ).length ?? 0,
          controls: volunteerControls.map((field) => ({
            tag: field.tagName.toLowerCase(),
            name: field.getAttribute('name'),
            type: field.getAttribute('type'),
            required: field.required,
            label:
              field.labels?.[0]?.textContent.replace(/\\s+/g, ' ').trim() ??
              null,
          })),
          dropdownStyles: volunteerForm
            ? [...volunteerForm.querySelectorAll('select')].map((field) => {
                const style = getComputedStyle(field);
                const pickerStyle = getComputedStyle(
                  field,
                  '::picker(select)'
                );
                const enabledOption = [...field.options].find(
                  (option) => !option.disabled
                );
                const optionStyle = enabledOption
                  ? getComputedStyle(enabledOption)
                  : null;
                return {
                  name: field.name,
                  appearance: style.appearance,
                  display: style.display,
                  alignItems: style.alignItems,
                  justifyContent: style.justifyContent,
                  height: Number.parseFloat(style.height),
                  paddingTop: Number.parseFloat(style.paddingTop),
                  paddingBottom: Number.parseFloat(style.paddingBottom),
                  backgroundColor: style.backgroundColor,
                  backgroundImage: style.backgroundImage,
                  paddingRight: Number.parseFloat(style.paddingRight),
                  cursor: style.cursor,
                  pickerAppearance: pickerStyle.appearance,
                  pickerBackgroundColor: pickerStyle.backgroundColor,
                  pickerBackgroundImage: pickerStyle.backgroundImage,
                  pickerBoxShadow: pickerStyle.boxShadow,
                  pickerBorderRadius: Number.parseFloat(
                    pickerStyle.borderRadius
                  ),
                  optionMinHeight: optionStyle
                    ? Number.parseFloat(optionStyle.minHeight)
                    : null,
                };
              })
            : [],
          customizableSelectSupported: CSS.supports(
            'appearance: base-select'
          ),
          unlabelledControls: volunteerControls
            .filter((field) => !field.labels?.length)
            .map((field) => field.getAttribute('name')),
          interestCount: volunteerInterests.length,
          interestValues: volunteerInterests.map((field) => field.value),
          preferredEventOptions: volunteerPreferredEvent
            ? [...volunteerPreferredEvent.options].map((option) => ({
                value: option.value,
                label: option.textContent.trim(),
                disabled: option.disabled,
              }))
            : [],
          preferredEventBeforeInterests: Boolean(
            volunteerPreferredEvent &&
              volunteerInterests[0] &&
              (volunteerPreferredEvent.compareDocumentPosition(
                volunteerInterests[0]
              ) & Node.DOCUMENT_POSITION_FOLLOWING)
          ),
          interestGroupRequired:
            volunteerInterestGroup?.getAttribute('aria-required') ?? null,
          interestGroupLabel:
            volunteerInterestGroup
              ?.querySelector(':scope > legend')
              ?.textContent.replace(/\s+/g, ' ')
              .trim() ?? null,
          participationCount: volunteerParticipationModes.length,
          consentRequired:
            volunteerForm?.querySelector('input[name="consent"]')?.required ??
            false,
          submitType: volunteerSubmit?.getAttribute('type') ?? null,
          submitText:
            volunteerSubmit?.textContent.replace(/\\s+/g, ' ').trim() ?? null,
          clearType: volunteerClear?.getAttribute('type') ?? null,
          clearText:
            volunteerClear?.textContent.replace(/\\s+/g, ' ').trim() ?? null,
          actionButtonCount:
            volunteerForm?.querySelectorAll(
              '.volunteer-form__actions > button'
            ).length ?? 0,
          statusLive: volunteerStatus?.getAttribute('aria-live') ?? null,
          formToRight:
            volunteerIntroRect && volunteerApplicationRect
              ? volunteerApplicationRect.left > volunteerIntroRect.right
              : false,
          formBelow:
            volunteerIntroRect && volunteerApplicationRect
              ? volunteerApplicationRect.top > volunteerIntroRect.bottom
              : false,
          formInsideViewport: volunteerApplicationRect
            ? volunteerApplicationRect.left >= -1 &&
              volunteerApplicationRect.right <= window.innerWidth + 1
            : false,
          effectsPresent: Boolean(
            volunteerSection.querySelector('.volunteer-page__grid') &&
              volunteerSection.querySelector('.volunteer-page__orbit') &&
              volunteerSection.querySelector('.volunteer-page__watermark')
          ),
          benefitCount:
            volunteerBenefits?.querySelectorAll(':scope > li').length ?? 0,
          benefitsBeforeSignal: Boolean(
            volunteerBenefits &&
              volunteerSignal &&
              (volunteerBenefits.compareDocumentPosition(volunteerSignal) &
                Node.DOCUMENT_POSITION_FOLLOWING)
          ),
          signalWidth: volunteerSignal?.getBoundingClientRect().width ?? null,
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
      desktopNavigationItems: readTopLevelNavigation(desktopNavigation),
      mobileNavigationItems: readTopLevelNavigation(mobileNavigation),
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
      photoAlbumLayout,
      volunteerCta,
      volunteerLayout,
    };
  })()`);

  await captureScreenshot(filename);
  return state;
}

async function inspectHeaderViewport({ width, height, filename }) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: width,
    screenHeight: height,
  });
  await sleep(180);

  const state = await evaluate(`(() => {
    const root = document.documentElement;
    const desktopNavigation = document.querySelector('.desktop-navigation');
    const headerCta = document.querySelector('.header-cta');
    const menuToggle = document.querySelector('.menu-toggle');
    const toggleRect = menuToggle?.getBoundingClientRect();

    return {
      innerWidth: window.innerWidth,
      scrollWidth: root.scrollWidth,
      desktopDisplay: desktopNavigation
        ? getComputedStyle(desktopNavigation).display
        : null,
      ctaDisplay: headerCta ? getComputedStyle(headerCta).display : null,
      toggleDisplay: menuToggle ? getComputedStyle(menuToggle).display : null,
      toggleInsideViewport: toggleRect
        ? toggleRect.left >= 0 && toggleRect.right <= window.innerWidth
        : false,
    };
  })()`);

  await captureElementScreenshot('.site-header', filename);
  return state;
}

async function inspectVolunteerJourney({ width, height, mobile }) {
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

  const homepageLoaded = waitForEvent('Page.loadEventFired');
  await send('Page.navigate', { url: siteUrl });
  await homepageLoaded;
  await waitForSiteReady();

  if (mobile) {
    const togglePoint = await evaluate(`(() => {
      const rect = document.querySelector('.menu-toggle')?.getBoundingClientRect();
      return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
    })()`);
    if (!togglePoint) throw new Error('Missing mobile menu toggle for volunteer journey.');
    await activatePoint({ ...togglePoint, touch: true });
    await sleep(450);
  }

  const navPoint = await evaluate(`(() => {
    const selector = ${JSON.stringify(
      mobile
        ? '.mobile-navigation a[href="/#volunteer"]'
        : '.desktop-navigation a[href="/#volunteer"]',
    )};
    const rect = document.querySelector(selector)?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  })()`);
  if (!navPoint) throw new Error('Missing Become a Volunteer navigation link.');
  if (mobile) {
    await evaluate(
      `document.querySelector('.mobile-navigation a[href="/#volunteer"]')?.click()`,
    );
  } else {
    await activatePoint({ ...navPoint, touch: false });
  }

  let arrival = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    arrival = await evaluate(`(() => {
      const section = document.querySelector('main > #volunteer');
      const header = document.querySelector('.site-header');
      const sectionRect = section?.getBoundingClientRect();
      const headerRect = header?.getBoundingClientRect();
      const readActive = (selector) => [
        ...document.querySelectorAll(selector),
      ].filter((item) => item.classList.contains('is-active')).map((item) => ({
        href: item.getAttribute('href'),
        current: item.getAttribute('aria-current'),
      }));
      return {
        pathname: location.pathname,
        hash: location.hash,
        sectionVisible: Boolean(
          sectionRect &&
          headerRect &&
          sectionRect.top >= headerRect.bottom - 3 &&
          sectionRect.top < innerHeight &&
          sectionRect.bottom > headerRect.bottom
        ),
        desktopActive: readActive('.desktop-navigation > a'),
        mobileActive: readActive('.mobile-navigation nav > a'),
        menuClosed: !document.body.classList.contains('menu-open'),
      };
    })()`);
    if (
      arrival.pathname === '/' &&
      arrival.hash === '#volunteer' &&
      arrival.sectionVisible &&
      arrival.menuClosed &&
      arrival.desktopActive.length === 1 &&
      arrival.desktopActive[0].href === '/#volunteer' &&
      arrival.mobileActive.length === 1 &&
      arrival.mobileActive[0].href === '/#volunteer'
    ) break;
    await sleep(100);
  }

  await evaluate(`document.querySelector('#volunteer')?.scrollIntoView({
    behavior: 'instant',
    block: 'center',
  })`);
  await sleep(260);

  const panelPoint = await evaluate(`(() => {
    const rect = document.querySelector('#volunteer .programme-panel')?.getBoundingClientRect();
    if (!rect) return null;
    const x = Math.min(innerWidth - 24, Math.max(24, rect.left + rect.width / 2));
    const y = Math.min(innerHeight - 24, Math.max(96, rect.top + rect.height / 2));
    return {
      x,
      y,
      hitHref: document.elementFromPoint(x, y)?.closest('a')?.getAttribute('href') ?? null,
    };
  })()`);
  if (!panelPoint || panelPoint.hitHref !== '/volunteer/') {
    throw new Error('Missing volunteer application panel touch target.');
  }
  await activatePoint({ ...panelPoint, touch: false });
  for (let attempt = 0; attempt < 70; attempt += 1) {
    const applicationReady = await evaluate(`(() => ({
      pathname: location.pathname,
      formExists: Boolean(document.querySelector('.volunteer-form')),
      backExists: Boolean(document.querySelector('.volunteer-page__back')),
      loaderGone: !document.querySelector('.site-loader'),
    }))()`);
    if (
      applicationReady.pathname === '/volunteer/' &&
      applicationReady.formExists &&
      applicationReady.backExists &&
      applicationReady.loaderGone
    ) break;
    await sleep(100);
  }
  await waitForSiteReady();

  const application = await evaluate(`(() => {
    const active = [...document.querySelectorAll(
      ${JSON.stringify(
        mobile ? '.mobile-navigation nav > a' : '.desktop-navigation > a',
      )}
    )].filter((item) => item.classList.contains('is-active'));
    return {
      pathname: location.pathname,
      formExists: Boolean(document.querySelector('.volunteer-form')),
      activeHrefs: active.map((item) => item.getAttribute('href')),
      backHref: document.querySelector('.volunteer-page__back')?.getAttribute('href') ?? null,
    };
  })()`);

  const backPoint = await evaluate(`(() => {
    const rect = document.querySelector('.volunteer-page__back')?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  })()`);
  if (!backPoint) throw new Error('Missing volunteer overview return link.');
  await activatePoint({ ...backPoint, touch: false });
  for (let attempt = 0; attempt < 70; attempt += 1) {
    const locationState = await evaluate(
      `({
        pathname: location.pathname,
        hash: location.hash,
        sectionExists: Boolean(document.querySelector('main > #volunteer')),
        loaderGone: !document.querySelector('.site-loader'),
      })`,
    );
    if (
      locationState.pathname === '/' &&
      locationState.hash === '#volunteer' &&
      locationState.sectionExists &&
      locationState.loaderGone
    ) break;
    await sleep(100);
  }
  await waitForSiteReady();

  let returned = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    returned = await evaluate(`(() => {
      const section = document.querySelector('main > #volunteer');
      const header = document.querySelector('.site-header');
      const sectionRect = section?.getBoundingClientRect();
      const headerRect = header?.getBoundingClientRect();
      return {
        pathname: location.pathname,
        hash: location.hash,
        sectionVisible: Boolean(
          sectionRect &&
          headerRect &&
          sectionRect.top >= headerRect.bottom - 3 &&
          sectionRect.top < innerHeight
        ),
      };
    })()`);
    if (returned.sectionVisible) break;
    await sleep(100);
  }

  return { arrival, application, returned };
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
      const entry = message.params.entry;
      const blockedExternalFont =
        entry.text.includes('net::ERR_NETWORK_ACCESS_DENIED') &&
        entry.source === 'network' &&
        (!(entry.url ?? '') ||
          /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//.test(entry.url));

      if (!blockedExternalFont) {
        logErrors.push(entry.text);
      }
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
  const volunteerUrl = `${siteUrl}/volunteer/`;
  const albumsUrl = `${siteUrl}/albums/`;
  const homepageRequiredText = [
    'Ideas for intelligent industry.',
    'Built for curious',
    'Our Mission',
    'Global Network',
    'Excellence',
    'Photo Albums.',
    'Arduino Challenge 2025',
    'IEEE Whispers',
    "IES DAY 24'",
    'Sri Lanka Arduino Challenge',
    'Our Flagship Events.',
    'Sri Lanka Arduino Challenge',
    'Silicon Pulse',
    'IEEE IES Day',
    'Become a Volunteer',
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
  const volunteerRequiredText = [
    'Become a Volunteer.',
    'Volunteer application',
    'About you',
    'Academic profile',
    'Where you can contribute',
    'IES event you would like to support',
    'Availability & commitment',
    'Confirmation',
    'Submit Form',
    'Clear Form',
  ];
  const albumsRequiredText = [
    'Photo Albums.',
    'All photo albums.',
    'Arduino Challenge 2025',
    'IEEE Whispers',
    "IES DAY 24'",
    'Sri Lanka Arduino Challenge',
    'Challenge Sphere 2024',
    'IEEE SPARK VI',
    'IEEE Education Week Day 02',
    'IEEE Education Week 2024',
    'ELECTRSPHERE',
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
  await evaluate(
    `document.querySelector('#activities')?.scrollIntoView({ block: 'start' })`,
  );
  await sleep(220);
  await captureElementScreenshot(
    '#activities .shell',
    'flagship-events-desktop-cdp.png',
  );
  await evaluate(
    `document.querySelector('#volunteer')?.scrollIntoView({ block: 'center' })`,
  );
  await sleep(220);
  await captureScreenshot('activities-volunteer-transition-desktop-cdp.png');
  await captureElementScreenshot(
    '#volunteer',
    'volunteer-section-desktop-cdp.png',
  );
  await evaluate(`document.querySelector('#albums')?.scrollIntoView({ block: 'center' })`);
  await sleep(220);
  await captureElementScreenshot(
    '#albums .photo-album-grid',
    'albums-preview-desktop-cdp.png',
  );
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

  const compactHeader = await inspectHeaderViewport({
    width: 1024,
    height: 768,
    filename: 'header-compact-cdp.png',
  });

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

  const volunteerDesktop = await inspectViewport({
    width: 1440,
    height: 1000,
    mobile: false,
    filename: 'volunteer-desktop-cdp.png',
    url: volunteerUrl,
    requiredText: volunteerRequiredText,
  });
  await captureElementScreenshot(
    '.volunteer-application',
    'volunteer-form-desktop-cdp.png',
  );
  const volunteerPickerDesktop = await inspectVolunteerPicker({
    filename: 'volunteer-select-open-desktop-cdp.png',
    touch: false,
  });

  const albumsDesktop = await inspectViewport({
    width: 1440,
    height: 1000,
    mobile: false,
    filename: 'albums-desktop-cdp.png',
    url: albumsUrl,
    requiredText: albumsRequiredText,
  });
  await captureElementScreenshot(
    '.photo-albums-hero__inner',
    'albums-hero-desktop-cdp.png',
  );
  await captureElementScreenshot(
    '.photo-albums-archive .photo-album-grid',
    'albums-grid-desktop-cdp.png',
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
  await evaluate(
    `document.querySelector('#activities')?.scrollIntoView({ block: 'start' })`,
  );
  await sleep(220);
  await captureElementScreenshot(
    '#activities .shell',
    'flagship-events-mobile-cdp.png',
  );
  await evaluate(
    `document.querySelector('#volunteer')?.scrollIntoView({ block: 'center' })`,
  );
  await sleep(220);
  await captureScreenshot('activities-volunteer-transition-mobile-cdp.png');
  await captureElementScreenshot(
    '#volunteer',
    'volunteer-section-mobile-cdp.png',
  );
  await evaluate(`document.querySelector('#albums')?.scrollIntoView({ block: 'center' })`);
  await sleep(220);
  await captureElementScreenshot(
    '#albums .photo-album-card',
    'albums-preview-mobile-cdp.png',
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

  const volunteerMobile = await inspectViewport({
    width: 390,
    height: 844,
    mobile: true,
    filename: 'volunteer-mobile-cdp.png',
    url: volunteerUrl,
    requiredText: volunteerRequiredText,
  });
  await captureElementScreenshot(
    '.volunteer-application',
    'volunteer-form-mobile-cdp.png',
  );
  const volunteerPickerMobile = await inspectVolunteerPicker({
    filename: 'volunteer-select-open-mobile-cdp.png',
    touch: true,
  });

  const volunteerInteractionState = await evaluate(`new Promise((resolve) => {
    const form = document.querySelector('.volunteer-form');
    const submitButton = document.querySelector('.volunteer-form__submit');
    submitButton?.click();
    window.setTimeout(() => {
      resolve({
        buttonExists: Boolean(submitButton),
        formStillInvalid: form ? !form.checkValidity() : null,
        focusedName: document.activeElement?.getAttribute('name') ?? null,
        statusText:
          document
            .querySelector('.volunteer-form__status')
            ?.textContent.replace(/\\s+/g, ' ')
            .trim() ?? null,
      });
    }, 120);
  })`);

  const volunteerClearState = await evaluate(`new Promise((resolve) => {
    const form = document.querySelector('.volunteer-form');
    const submitButton = document.querySelector('.volunteer-form__submit');
    const clearButton = document.querySelector('.volunteer-form__clear');
    if (!form || !submitButton || !clearButton) {
      resolve({
        formExists: Boolean(form),
        submitExists: Boolean(submitButton),
        clearExists: Boolean(clearButton),
      });
      return;
    }

    const setValue = (name, value) => {
      const field = form.elements.namedItem(name);
      if (field && 'value' in field) field.value = value;
    };
    setValue('firstName', 'Verification');
    setValue('lastName', 'Volunteer');
    setValue('email', 'verification@example.com');
    setValue('phone', '+94 77 123 4567');
    setValue('institution', 'SLTC Research University');
    setValue('programme', 'Electrical Engineering');
    setValue('yearOfStudy', 'Year 3');
    setValue('ieeeStatus', 'IEEE Student Member');
    setValue('preferredEvent', 'Sri Lanka Arduino Challenge');
    setValue('motivation', 'I want to help the chapter deliver excellent events.');
    setValue('weeklyCommitment', '2-4 hours');

    form.querySelector('input[name="consent"]').checked = true;
    submitButton.click();
    window.setTimeout(() => {
      const interest = form.querySelector('input[name="interests"]');
      const hadInterestError = Boolean(
        document.querySelector('#volunteer-interest-error')?.textContent.trim()
      );
      interest.checked = true;
      const originalConfirm = window.confirm;
      window.confirm = () => false;
      clearButton.focus();
      clearButton.click();
      window.setTimeout(() => {
        const cancelState = {
          firstName: form.elements.namedItem('firstName')?.value ?? null,
          yearOfStudy: form.elements.namedItem('yearOfStudy')?.value ?? null,
          interestChecked: interest.checked,
          consentChecked:
            form.querySelector('input[name="consent"]')?.checked ?? false,
          interestErrorPreserved: Boolean(
            document.querySelector('#volunteer-interest-error')?.textContent.trim()
          ),
          clearStillFocused: document.activeElement === clearButton,
          statusText:
            document
              .querySelector('.volunteer-form__status')
              ?.textContent.replace(/\\s+/g, ' ')
              .trim() ?? null,
        };

        window.confirm = () => true;
        clearButton.click();
        window.setTimeout(() => {
          window.confirm = originalConfirm;
          const valueControls = [
            ...form.querySelectorAll(
              'input:not([type="checkbox"]):not([type="radio"]), select, textarea'
            ),
          ];
          const checkedControls = [
            ...form.querySelectorAll(
              'input[type="checkbox"], input[type="radio"]'
            ),
          ];
          resolve({
            formExists: true,
            submitExists: true,
            clearExists: true,
            clearType: clearButton.getAttribute('type'),
            hadInterestError,
            cancelState,
            allValuesCleared: valueControls.every((field) => field.value === ''),
            allChecksCleared: checkedControls.every((field) => !field.checked),
            formInvalidAfterClear: !form.checkValidity(),
            interestErrorCleared:
              !document
                .querySelector('#volunteer-interest-error')
                ?.textContent.trim(),
            interestInvalidCleared: !form.querySelector(
              '[name="interests"][aria-invalid="true"]'
            ),
            focusedName: document.activeElement?.getAttribute('name') ?? null,
            statusText:
              document
                .querySelector('.volunteer-form__status')
                ?.textContent.replace(/\\s+/g, ' ')
                .trim() ?? null,
          });
        }, 120);
      }, 80);
    }, 80);
  })`);

  const albumsMobile = await inspectViewport({
    width: 390,
    height: 844,
    mobile: true,
    filename: 'albums-mobile-cdp.png',
    url: albumsUrl,
    requiredText: albumsRequiredText,
  });
  await captureElementScreenshot(
    '.photo-albums-hero__inner',
    'albums-hero-mobile-cdp.png',
  );
  await captureElementScreenshot(
    '.photo-albums-archive .photo-album-grid',
    'albums-grid-mobile-cdp.png',
  );

  const volunteerJourneyDesktop = await inspectVolunteerJourney({
    width: 1440,
    height: 1000,
    mobile: false,
  });
  const volunteerJourneyMobile = await inspectVolunteerJourney({
    width: 390,
    height: 844,
    mobile: true,
  });

  const failures = [];
  const expectedHomepageTitle = 'IEEE IES Student Branch Chapter of SLTC';
  const expectedMastermindsTitle =
    'Masterminds | IEEE IES Student Branch Chapter of SLTC';
  const expectedChapterTitle =
    'What is IEEE Industrial Electronics Society Student Branch Chapter of SLTC?';
  const expectedVolunteerTitle =
    'Become a Volunteer | IEEE IES Student Branch Chapter of SLTC';
  const expectedAlbumsTitle =
    'Photo Albums | IEEE IES Student Branch Chapter of SLTC';

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
    volunteerDesktop.title !== expectedVolunteerTitle ||
    volunteerMobile.title !== expectedVolunteerTitle
  ) {
    failures.push('The volunteer page title does not match its identity.');
  }
  if (
    albumsDesktop.title !== expectedAlbumsTitle ||
    albumsMobile.title !== expectedAlbumsTitle
  ) {
    failures.push('The photo albums page title does not match its identity.');
  }
  if (
    desktop.bodyTextLength < 500 ||
    mobile.bodyTextLength < 500 ||
    mastermindsDesktop.bodyTextLength < 500 ||
    mastermindsMobile.bodyTextLength < 500 ||
    chapterDesktop.bodyTextLength < 500 ||
    chapterMobile.bodyTextLength < 500 ||
    volunteerDesktop.bodyTextLength < 500 ||
    volunteerMobile.bodyTextLength < 500 ||
    albumsDesktop.bodyTextLength < 500 ||
    albumsMobile.bodyTextLength < 500
  ) {
    failures.push('One of the rendered pages does not contain enough content.');
  }
  if (
    desktop.requiredText.some((item) => !item.present) ||
    mobile.requiredText.some((item) => !item.present) ||
    mastermindsDesktop.requiredText.some((item) => !item.present) ||
    mastermindsMobile.requiredText.some((item) => !item.present) ||
    chapterDesktop.requiredText.some((item) => !item.present) ||
    chapterMobile.requiredText.some((item) => !item.present) ||
    volunteerDesktop.requiredText.some((item) => !item.present) ||
    volunteerMobile.requiredText.some((item) => !item.present) ||
    albumsDesktop.requiredText.some((item) => !item.present) ||
    albumsMobile.requiredText.some((item) => !item.present)
  ) {
    failures.push('One or more expected page sections or member names are missing.');
  }
  if (
    [desktop, mobile].some(
      ({ volunteerCta }) =>
        volunteerCta?.tag !== 'a' ||
        volunteerCta.href !== '/volunteer/' ||
        !volunteerCta.label?.toLowerCase().includes('become a volunteer') ||
        volunteerCta.sectionCount !== 1 ||
        volunteerCta.sectionLabelledBy !== volunteerCta.headingId ||
        volunteerCta.headingText !== 'Become a Volunteer' ||
        volunteerCta.insideActivities ||
        volunteerCta.nestedInteractiveCount !== 0 ||
        !volunteerCta.hasWatermark ||
        !volunteerCta.hasGraphic ||
        volunteerCta.orbitCount !== 2 ||
        !volunteerCta.hasStatus ||
        !volunteerCta.hasIndex ||
        !volunteerCta.sectionInsideViewport ||
        !volunteerCta.panelInsideViewport ||
        volunteerCta.panelHeight < 44 ||
        !volunteerCta.sectionPaperClass ||
        volunteerCta.sectionPaddingTop !== 0 ||
        volunteerCta.sectionBackgroundImage !== 'none' ||
        !volunteerCta.transitionDecorationBackgroundImage?.includes('radial-gradient') ||
        !volunteerCta.transitionDecorationBackgroundImage?.includes('linear-gradient') ||
        volunteerCta.transitionDecorationWidth < 200 ||
        volunteerCta.transitionDecorationHeight < 60 ||
        volunteerCta.transitionDecorationPointerEvents !== 'none' ||
        volunteerCta.panelBackgroundColor !== 'rgb(11, 31, 58)' ||
        volunteerCta.beforeBackgroundImage === 'none' ||
        volunteerCta.afterBackgroundImage === 'none',
    )
  ) {
    failures.push('The volunteer panel is not linked accessibly to the volunteer page.');
  }
  if (
    [volunteerJourneyDesktop, volunteerJourneyMobile].some((journey) => {
      const expectedActive = (items) =>
        items.length === 1 &&
        items[0].href === '/#volunteer' &&
        items[0].current === 'location';
      return (
        journey.arrival.pathname !== '/' ||
        journey.arrival.hash !== '#volunteer' ||
        !journey.arrival.sectionVisible ||
        !journey.arrival.menuClosed ||
        !expectedActive(journey.arrival.desktopActive) ||
        !expectedActive(journey.arrival.mobileActive) ||
        journey.application.pathname !== '/volunteer/' ||
        !journey.application.formExists ||
        journey.application.activeHrefs.length !== 1 ||
        journey.application.activeHrefs[0] !== '/#volunteer' ||
        journey.application.backHref !== '/#volunteer' ||
        journey.returned.pathname !== '/' ||
        journey.returned.hash !== '#volunteer' ||
        !journey.returned.sectionVisible
      );
    })
  ) {
    failures.push(
      'The navigation-to-section, application-page, or volunteer return journey is broken.',
    );
  }
  const expectedVolunteerFields = [
    {
      tag: 'input',
      name: 'firstName',
      type: 'text',
      required: true,
      label: 'First name',
    },
    {
      tag: 'input',
      name: 'lastName',
      type: 'text',
      required: true,
      label: 'Last name',
    },
    {
      tag: 'input',
      name: 'email',
      type: 'email',
      required: true,
      label: 'Email address',
    },
    {
      tag: 'input',
      name: 'phone',
      type: 'tel',
      required: true,
      label: 'Mobile / WhatsApp',
    },
    {
      tag: 'input',
      name: 'institution',
      type: 'text',
      required: true,
      label: 'Institution',
    },
    {
      tag: 'input',
      name: 'programme',
      type: 'text',
      required: true,
      label: 'Programme / field of study',
    },
    {
      tag: 'select',
      name: 'yearOfStudy',
      type: null,
      required: true,
      label: 'Current year / stage',
    },
    {
      tag: 'select',
      name: 'ieeeStatus',
      type: null,
      required: true,
      label: 'IEEE membership status',
    },
    {
      tag: 'input',
      name: 'ieeeMemberNumber',
      type: 'text',
      required: false,
      label: 'IEEE member number',
    },
    {
      tag: 'select',
      name: 'preferredEvent',
      type: null,
      required: true,
      label: 'IES event you would like to support',
    },
    {
      tag: 'textarea',
      name: 'motivation',
      type: null,
      required: true,
      label: 'Motivation and relevant skills',
    },
    {
      tag: 'textarea',
      name: 'experience',
      type: null,
      required: false,
      label: 'Previous volunteering or project experience',
    },
    {
      tag: 'input',
      name: 'portfolio',
      type: 'url',
      required: false,
      label: 'Portfolio or profile link',
    },
    {
      tag: 'select',
      name: 'weeklyCommitment',
      type: null,
      required: true,
      label: 'Weekly time commitment',
    },
    {
      tag: 'textarea',
      name: 'availabilityNotes',
      type: null,
      required: false,
      label: 'Availability notes',
    },
  ];
  const expectedVolunteerInterests = [
    'Event planning & logistics',
    'Technical & programme',
    'Marketing & communications',
    'Design, photo & video',
    'Sponsorships & partnerships',
    'Registration & attendee support',
    'Web & IT',
  ];
  const expectedVolunteerEvents = [
    { value: '', label: 'Select an IES event', disabled: true },
    {
      value: 'Sri Lanka Arduino Challenge',
      label: 'Sri Lanka Arduino Challenge',
      disabled: false,
    },
    { value: 'Silicon Pulse', label: 'Silicon Pulse', disabled: false },
    { value: 'IEEE IES Day', label: 'IEEE IES Day', disabled: false },
    {
      value: 'IES Industry Visit',
      label: 'IES Industry Visit',
      disabled: false,
    },
    {
      value: 'Engineering Beyond GPA',
      label: 'Engineering Beyond GPA',
      disabled: false,
    },
  ];
  if (
    [volunteerDesktop, volunteerMobile].some((state, stateIndex) => {
      const volunteer = state.volunteerLayout;

      return (
        !volunteer ||
        volunteer.labelledBy !== 'volunteer-title' ||
        volunteer.headingText !== 'Become a Volunteer.' ||
        volunteer.formTitle !== 'Volunteer application' ||
        volunteer.backHref !== '/#volunteer' ||
        volunteer.footerTopHref !== '#volunteer-home' ||
        volunteer.backToTopHref !== '#volunteer-home' ||
        volunteer.describedBy !== 'volunteer-form-description' ||
        volunteer.initiallyValid !== false ||
        volunteer.sectionCount !== 5 ||
        volunteer.unlabelledControls.length !== 0 ||
        !expectedVolunteerFields.every((field) =>
          volunteer.controls.some(
            (renderedField) =>
              renderedField.tag === field.tag &&
              renderedField.name === field.name &&
              renderedField.type === field.type &&
              renderedField.required === field.required &&
              renderedField.label?.includes(field.label),
          ),
        ) ||
        volunteer.dropdownStyles.length !== 4 ||
        volunteer.dropdownStyles.some(
          (dropdown) => {
            if (dropdown.cursor !== 'pointer') return true;

            if (volunteer.customizableSelectSupported) {
              return (
                dropdown.appearance !== 'base-select' ||
                dropdown.display !== 'flex' ||
                dropdown.alignItems !== 'center' ||
                dropdown.justifyContent !== 'space-between' ||
                Math.abs(dropdown.height - 50) > 0.5 ||
                dropdown.paddingTop !== 0 ||
                dropdown.paddingBottom !== 0 ||
                dropdown.backgroundColor !== 'rgb(255, 255, 255)' ||
                dropdown.backgroundImage !== 'none' ||
                dropdown.pickerAppearance !== 'base-select' ||
                dropdown.pickerBackgroundColor !== 'rgb(255, 255, 255)' ||
                !dropdown.pickerBackgroundImage.includes('linear-gradient') ||
                !dropdown.pickerBackgroundImage.includes('radial-gradient') ||
                dropdown.pickerBoxShadow === 'none' ||
                dropdown.pickerBorderRadius < 14 ||
                dropdown.optionMinHeight < 44
              );
            }

            return (
              dropdown.appearance !== 'none' ||
              !dropdown.backgroundImage.includes('url(') ||
              dropdown.paddingRight < 50
            );
          },
        ) ||
        volunteer.interestCount !== expectedVolunteerInterests.length ||
        !expectedVolunteerInterests.every(
          (value, index) => volunteer.interestValues[index] === value,
        ) ||
        volunteer.preferredEventOptions.length !==
          expectedVolunteerEvents.length ||
        !expectedVolunteerEvents.every((expectedOption, index) => {
          const renderedOption = volunteer.preferredEventOptions[index];
          return (
            renderedOption?.value === expectedOption.value &&
            renderedOption.label === expectedOption.label &&
            renderedOption.disabled === expectedOption.disabled
          );
        }) ||
        !volunteer.preferredEventBeforeInterests ||
        !volunteer.interestGroupLabel?.toLowerCase().includes('required') ||
        volunteer.participationCount !== 0 ||
        !volunteer.consentRequired ||
        volunteer.submitType !== 'submit' ||
        volunteer.submitText !== 'Submit Form' ||
        volunteer.clearType !== 'reset' ||
        volunteer.clearText !== 'Clear Form' ||
        volunteer.actionButtonCount !== 2 ||
        volunteer.statusLive !== 'polite' ||
        (stateIndex === 0 ? !volunteer.formToRight : !volunteer.formBelow) ||
        !volunteer.formInsideViewport ||
        !volunteer.effectsPresent ||
        volunteer.benefitCount !== 3 ||
        !volunteer.benefitsBeforeSignal ||
        volunteer.signalWidth < 100 ||
        volunteer.signalWidth > 130
      );
    })
  ) {
    failures.push(
      'The responsive volunteer application page or accessible form is incomplete.',
    );
  }
  const allowedVolunteerEventValues = expectedVolunteerEvents
    .map((option) => option.value)
    .filter(Boolean);
  if (
    [volunteerPickerDesktop, volunteerPickerMobile].some(
      (picker) =>
        !picker.exists ||
        !picker.supported ||
        !picker.open ||
        picker.appearance !== 'base-select' ||
        picker.pickerAppearance !== 'base-select' ||
        picker.pickerBackgroundColor !== 'rgb(255, 255, 255)' ||
        !picker.pickerBackgroundImage.includes('linear-gradient') ||
        !picker.pickerBackgroundImage.includes('radial-gradient') ||
        picker.pickerBoxShadow === 'none' ||
        picker.pickerBorderRadius < 14 ||
        !picker.optionPanelAligned ||
        picker.options.length !== expectedVolunteerEvents.length ||
        !expectedVolunteerEvents.every((expectedOption, index) => {
          const renderedOption = picker.options[index];
          return (
            renderedOption?.value === expectedOption.value &&
            renderedOption.label === expectedOption.label &&
            renderedOption.disabled === expectedOption.disabled &&
            renderedOption.minHeight >= 44
          );
        }) ||
        !picker.insideViewport ||
        !allowedVolunteerEventValues.includes(picker.value) ||
        picker.formDataValue !== picker.value ||
        !picker.closedAfterSelection ||
        !picker.closed ||
        !picker.focusReturned,
    )
  ) {
    failures.push(
      'The volunteer event picker is not fully themed, accessible, or usable with keyboard and touch input.',
    );
  }
  if (
    !volunteerInteractionState.buttonExists ||
    !volunteerInteractionState.formStillInvalid ||
    volunteerInteractionState.focusedName !== 'firstName' ||
    !volunteerInteractionState.statusText
      ?.toLowerCase()
      .includes('complete the required fields')
  ) {
    failures.push(
      'The volunteer form does not provide usable validation feedback before submission.',
    );
  }
  if (
    !volunteerClearState.formExists ||
    !volunteerClearState.submitExists ||
    !volunteerClearState.clearExists ||
    volunteerClearState.clearType !== 'reset' ||
    !volunteerClearState.hadInterestError ||
    volunteerClearState.cancelState?.firstName !== 'Verification' ||
    volunteerClearState.cancelState?.yearOfStudy !== 'Year 3' ||
    !volunteerClearState.cancelState?.interestChecked ||
    !volunteerClearState.cancelState?.consentChecked ||
    !volunteerClearState.cancelState?.interestErrorPreserved ||
    !volunteerClearState.cancelState?.clearStillFocused ||
    volunteerClearState.cancelState?.statusText !== 'Form clearing cancelled.' ||
    !volunteerClearState.allValuesCleared ||
    !volunteerClearState.allChecksCleared ||
    !volunteerClearState.formInvalidAfterClear ||
    !volunteerClearState.interestErrorCleared ||
    !volunteerClearState.interestInvalidCleared ||
    volunteerClearState.focusedName !== 'firstName' ||
    volunteerClearState.statusText !== 'Form cleared.'
  ) {
    failures.push(
      'The Clear Form action does not safely preserve or fully reset values, validation state, and focus.',
    );
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
        !hero.actionHrefs.includes('#albums') ||
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
    chapterMobile.hasErrorOverlay ||
    volunteerDesktop.hasErrorOverlay ||
    volunteerMobile.hasErrorOverlay ||
    albumsDesktop.hasErrorOverlay ||
    albumsMobile.hasErrorOverlay
  ) {
    failures.push('A framework error overlay is visible.');
  }
  if (
    desktop.innerWidth !== 1440 ||
    mastermindsDesktop.innerWidth !== 1440 ||
    chapterDesktop.innerWidth !== 1440 ||
    volunteerDesktop.innerWidth !== 1440 ||
    albumsDesktop.innerWidth !== 1440 ||
    mobile.innerWidth !== 390 ||
    mastermindsMobile.innerWidth !== 390 ||
    chapterMobile.innerWidth !== 390 ||
    volunteerMobile.innerWidth !== 390 ||
    albumsMobile.innerWidth !== 390
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
    chapterMobile.scrollWidth > chapterMobile.innerWidth + 1 ||
    volunteerDesktop.scrollWidth > volunteerDesktop.innerWidth + 1 ||
    volunteerMobile.scrollWidth > volunteerMobile.innerWidth + 1 ||
    albumsDesktop.scrollWidth > albumsDesktop.innerWidth + 1 ||
    albumsMobile.scrollWidth > albumsMobile.innerWidth + 1
  ) {
    failures.push('Horizontal overflow was detected on one of the pages.');
  }
  if (
    desktop.pathname !== '/' ||
    mobile.pathname !== '/' ||
    mastermindsDesktop.pathname !== '/masterminds/' ||
    mastermindsMobile.pathname !== '/masterminds/' ||
    chapterDesktop.pathname !== '/chapter/' ||
    chapterMobile.pathname !== '/chapter/' ||
    volunteerDesktop.pathname !== '/volunteer/' ||
    volunteerMobile.pathname !== '/volunteer/' ||
    albumsDesktop.pathname !== '/albums/' ||
    albumsMobile.pathname !== '/albums/'
  ) {
    failures.push(
      'Homepage, Masterminds, chapter, volunteer, or albums page routing is incorrect.',
    );
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
      volunteerDesktop,
      volunteerMobile,
      albumsDesktop,
      albumsMobile,
    ].some((state) => state.h1Count !== 1)
  ) {
    failures.push('Each page must contain exactly one primary heading.');
  }
  if (
    desktop.desktopNavigationDisplay === 'none' ||
    mastermindsDesktop.desktopNavigationDisplay === 'none' ||
    chapterDesktop.desktopNavigationDisplay === 'none' ||
    volunteerDesktop.desktopNavigationDisplay === 'none' ||
    albumsDesktop.desktopNavigationDisplay === 'none'
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
    chapterMobile.menuToggleRect.right > chapterMobile.innerWidth ||
    volunteerMobile.menuToggleDisplay === 'none' ||
    !volunteerMobile.menuToggleRect ||
    volunteerMobile.menuToggleRect.left < 0 ||
    volunteerMobile.menuToggleRect.right > volunteerMobile.innerWidth ||
    albumsMobile.menuToggleDisplay === 'none' ||
    !albumsMobile.menuToggleRect ||
    albumsMobile.menuToggleRect.left < 0 ||
    albumsMobile.menuToggleRect.right > albumsMobile.innerWidth
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
  const expectedPrimaryNavigation = [
    ['About', '/#about'],
    ['Flagship events', '/#activities'],
    ['Become a Volunteer', '/#volunteer'],
    ['Photo albums', '/albums/'],
    ['Masterminds', null],
    ['Contact', '/#connect'],
  ];
  const matchesPrimaryNavigation = (items) =>
    items.length === expectedPrimaryNavigation.length &&
    expectedPrimaryNavigation.every(
      ([label, href], index) =>
        items[index]?.label === label && items[index]?.href === href,
    );
  if (
    !matchesPrimaryNavigation(desktop.desktopNavigationItems) ||
    !matchesPrimaryNavigation(mobile.mobileNavigationItems) ||
    mobile.mobileNavigationItems[2]?.ordinal !== '03'
  ) {
    failures.push(
      'Become a Volunteer is missing or out of order in the primary navigation.',
    );
  }
  const volunteerDesktopActiveItems =
    volunteerDesktop.desktopNavigationItems.filter((item) => item.active);
  const volunteerMobileActiveItems =
    volunteerMobile.mobileNavigationItems.filter((item) => item.active);
  if (
    volunteerDesktopActiveItems.length !== 1 ||
    volunteerDesktopActiveItems[0]?.href !== '/#volunteer' ||
    volunteerDesktopActiveItems[0]?.ariaCurrent !== 'location' ||
    volunteerMobileActiveItems.length !== 1 ||
    volunteerMobileActiveItems[0]?.href !== '/#volunteer' ||
    volunteerMobileActiveItems[0]?.ariaCurrent !== 'location'
  ) {
    failures.push(
      'The volunteer page does not uniquely activate Become a Volunteer in the navigation.',
    );
  }
  const albumsDesktopActiveItems =
    albumsDesktop.desktopNavigationItems.filter((item) => item.active);
  const albumsMobileActiveItems =
    albumsMobile.mobileNavigationItems.filter((item) => item.active);
  if (
    albumsDesktopActiveItems.length !== 1 ||
    albumsDesktopActiveItems[0]?.href !== '/albums/' ||
    albumsDesktopActiveItems[0]?.ariaCurrent !== 'location' ||
    albumsMobileActiveItems.length !== 1 ||
    albumsMobileActiveItems[0]?.href !== '/albums/' ||
    albumsMobileActiveItems[0]?.ariaCurrent !== 'location'
  ) {
    failures.push(
      'The albums page does not uniquely activate Photo albums in the navigation.',
    );
  }
  if (
    compactHeader.innerWidth !== 1024 ||
    compactHeader.desktopDisplay !== 'none' ||
    compactHeader.ctaDisplay !== 'none' ||
    compactHeader.toggleDisplay === 'none' ||
    !compactHeader.toggleInsideViewport ||
    compactHeader.scrollWidth > compactHeader.innerWidth + 1
  ) {
    failures.push('The expanded navigation does not collapse safely at 1024px.');
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
  const volunteerSectionIndex = homepageSectionOrder.sections.indexOf('volunteer');
  const albumsSectionIndex = homepageSectionOrder.sections.indexOf('albums');
  const activitiesNavigationIndex = homepageSectionOrder.navigation.indexOf(
    '/#activities',
  );
  const albumsNavigationIndex = homepageSectionOrder.navigation.indexOf('/albums/');
  const volunteerNavigationIndex = homepageSectionOrder.navigation.indexOf(
    '/#volunteer',
  );
  if (
    activitiesSectionIndex < 0 ||
    volunteerSectionIndex < 0 ||
    albumsSectionIndex < 0 ||
    activitiesSectionIndex > volunteerSectionIndex ||
    volunteerSectionIndex > albumsSectionIndex ||
    activitiesNavigationIndex < 0 ||
    volunteerNavigationIndex < 0 ||
    albumsNavigationIndex < 0 ||
    activitiesNavigationIndex > volunteerNavigationIndex ||
    volunteerNavigationIndex > albumsNavigationIndex
  ) {
    failures.push(
      'Activities, Become a Volunteer, and Photo albums are not in the expected page and navigation order.',
    );
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
      ...volunteerDesktop.images,
      ...volunteerMobile.images,
      ...albumsDesktop.images,
      ...albumsMobile.images,
    ].some(
      (image) => !image.complete || image.naturalWidth === 0,
    )
  ) {
    failures.push('One or more logo images failed to render.');
  }
  const expectedAlbumTitles = [
    'Arduino Challenge 2025',
    'IEEE Whispers',
    "IES DAY 24'",
    'Sri Lanka Arduino Challenge',
    'Challenge Sphere 2024',
    'IEEE SPARK VI',
    'IEEE Education Week Day 02',
    'IEEE Education Week 2024',
    'ELECTRSPHERE',
  ];
  const expectedAlbumHrefs = [
    'https://www.facebook.com/media/set/?set=a.1212222534257763&type=3',
    'https://www.facebook.com/media/set/?set=a.1377114571101891&type=3',
    'https://www.facebook.com/media/set/?set=a.997206695759349&type=3',
    'https://www.facebook.com/media/set/?set=a.921151433364876&type=3',
    'https://www.facebook.com/media/set/?set=a.876705321142821&type=3',
    'https://www.facebook.com/media/set/?set=a.856040706542616&type=3',
    'https://www.facebook.com/media/set/?set=a.844807354332618&type=3',
    'https://www.facebook.com/media/set/?set=a.844721457674541&type=3',
    'https://www.facebook.com/media/set/?set=a.754247180055303&type=3',
  ];
  const albumCardsAreValid = (cards, expectedCount) =>
    cards.length === expectedCount &&
    cards.every(
      (card, index) =>
        card.title === expectedAlbumTitles[index] &&
        card.href === expectedAlbumHrefs[index] &&
        card.target === '_blank' &&
        card.rel?.includes('noreferrer') &&
        card.ariaLabel?.includes(card.title) &&
        card.ariaLabel?.toLowerCase().includes('new tab') &&
        card.imageComplete &&
        card.imageWidth >= 1300 &&
        card.imageHeight >= 1300 &&
        card.imageObjectFit === 'cover',
    );
  if (
    [desktop, mobile].some((state, stateIndex) => {
      const albums = state.photoAlbumLayout;
      return (
        !albums?.preview ||
        albums.cardCount !== 4 ||
        albums.firstRowCount !== (stateIndex === 0 ? 4 : 1) ||
        albums.viewAllHref !== '/albums/' ||
        !albums.cardsInsideViewport ||
        albums.nestedInteractiveCount !== 0 ||
        !albumCardsAreValid(albums.cards, 4)
      );
    }) ||
    [albumsDesktop, albumsMobile].some((state, stateIndex) => {
      const albums = state.photoAlbumLayout;
      return (
        !albums ||
        albums.preview ||
        albums.cardCount !== 9 ||
        albums.firstRowCount !== (stateIndex === 0 ? 3 : 1) ||
        albums.backHref !== '/#albums' ||
        !albums.cardsInsideViewport ||
        albums.nestedInteractiveCount !== 0 ||
        !albumCardsAreValid(albums.cards, 9) ||
        new Set(albums.cards.map((card) => card.id)).size !== 9 ||
        new Set(albums.cards.map((card) => card.href)).size !== 9
      );
    })
  ) {
    failures.push(
      'The four-album homepage preview or nine-album Facebook archive is incomplete.',
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
    volunteerDesktop,
    volunteerMobile,
    albumsDesktop,
    albumsMobile,
    volunteerPickerDesktop,
    volunteerPickerMobile,
    volunteerJourneyDesktop,
    volunteerJourneyMobile,
    compactHeader,
    volunteerInteractionState,
    volunteerClearState,
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
  console.log(`VOLUNTEER_PAGE=${volunteerDesktop.pathname}`);
  console.log(`ALBUMS_PAGE=${albumsDesktop.pathname}`);
  console.log(`HORIZONTAL_OVERFLOW=NONE`);
  console.log(`RUNTIME_EXCEPTIONS=${runtimeExceptions.length}`);
  console.log(`CONSOLE_ERRORS=${consoleErrors.length}`);
  console.log(`LOG_ERRORS=${logErrors.length}`);
} finally {
  clearTimeout(hardTimeout);
  socket?.close();
}
