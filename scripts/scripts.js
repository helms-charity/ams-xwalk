import {
  loadHeader,
  loadFooter,
  decorateButtons,
  decorateIcons,
  decorateLinkedPictures,
  decorateBlocks,
  decorateTemplateAndTheme,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
  getMetadata,
  toCamelCase,
} from './aem.js';

/**
 * Moves all the attributes from a given elmenet to another given element.
 * @param {Element} from the element to copy attributes from
 * @param {Element} to the element to copy attributes to
 */
export function moveAttributes(from, to, attributes) {
  if (!attributes) {
    // eslint-disable-next-line no-param-reassign
    attributes = [...from.attributes].map(({ nodeName }) => nodeName);
  }
  attributes.forEach((attr) => {
    const value = from.getAttribute(attr);
    if (value) {
      to?.setAttribute(attr, value); // optional chaining for accordion block
      from?.removeAttribute(attr); // optional chaining for accordion block
    }
  });
}

/**
 * Move instrumentation attributes from a given element to another given element.
 * @param {Element} from the element to copy attributes from
 * @param {Element} to the element to copy attributes to
 */
export function moveInstrumentation(from, to) {
  moveAttributes(
    from,
    to,
    [...from.attributes]
      .map(({ nodeName }) => nodeName)
      .filter((attr) => attr.startsWith('data-aue-') || attr.startsWith('data-richtext-')),
  );
}

/* CHARITY - start of ak.js stuff */
/* locales are defined below in this file */
export function getLocale(locales) {
  const { pathname } = window.location;
  const matches = Object.keys(locales).filter((locale) => pathname.startsWith(`${locale}/`));
  const prefix = getMetadata('locale') || matches.sort((a, b) => b.length - a.length)?.[0] || '';
  if (locales[prefix].lang) document.documentElement.lang = locales[prefix].lang;
  return { prefix, ...locales[prefix] };
}

export const [setConfig, getConfig] = (() => {
  let config;
  return [
    (conf = {}) => {
      config = {
        ...conf,
        // log: conf.log || log,
        log: conf.log || console.log,
        locale: getLocale(conf.locales),
        codeBase: `${import.meta.url.replace('/scripts/scripts.js', '')}`,
      };
      return config;
    },
    () => (config || setConfig()),
  ];
})();

function groupChildren(section) {
  const allChildren = section.querySelectorAll(':scope > *');

  // Filter out section-metadata elements from "blocks"
  const children = [...allChildren].filter((child) => !child.classList.contains('section-metadata'));
  if (children.length === 0) return [];
  const hasBlocks = children.some((child) => child.tagName === 'DIV' && child.className);

  // If no blocks, just wrap everything in default-content and return
  if (!hasBlocks) {
    const defaultWrapper = document.createElement('div');
    defaultWrapper.className = 'default-content';
    children.forEach((child) => defaultWrapper.append(child));
    return [defaultWrapper];
  }

  // Otherwise, group blocks and default content separately
  const groups = [];
  let currentGroup = null;

  for (const child of children) {
    const isDiv = child.tagName === 'DIV';
    const currentType = currentGroup?.classList.contains('block-content');

    if (!currentGroup || currentType !== isDiv) {
      currentGroup = document.createElement('div');
      currentGroup.className = isDiv
        ? 'block-content' : 'default-content';
      groups.push(currentGroup);
    }

    currentGroup.append(child);
  }

  return groups;
}

/* CHARITY - start of section-metadata.js */
/**
 * Converts a CSS color value to RGB values
 * @param {string} color - CSS color value (hex, rgb, rgba, hsl, hsla, or named color)
 * @returns {Object|null} Object with r, g, b values (0-255) or null if invalid
 */
function parseColor(section) {
  if (!section) return null; // for now, only using on sections

  const computedBg = getComputedStyle(section).background;
  const rgbMatch = computedBg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!rgbMatch) return null;
  return {
    r: parseInt(rgbMatch[1], 10),
    g: parseInt(rgbMatch[2], 10),
    b: parseInt(rgbMatch[3], 10),
  };
}

function getRelativeLuminance({ r, g, b }) {
  // Convert to sRGB
  const rsRGB = r / 255;
  const gsRGB = g / 255;
  const bsRGB = b / 255;

  // Apply gamma correction
  const rLinear = rsRGB <= 0.03928 ? rsRGB / 12.92 : ((rsRGB + 0.055) / 1.055) ** 2.4;
  const gLinear = gsRGB <= 0.03928 ? gsRGB / 12.92 : ((gsRGB + 0.055) / 1.055) ** 2.4;
  const bLinear = bsRGB <= 0.03928 ? bsRGB / 12.92 : ((bsRGB + 0.055) / 1.055) ** 2.4;

  // Calculate relative luminance
  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}

/**
 * Determines if a CSS color value is light or dark
 * @param {string} color - CSS color value
 * @param {number} threshold - Luminance threshold (default: 0.5)
 * @returns {boolean} true if light, false if dark, null if invalid color
 */
export function getColorScheme(section) {
  const rgb = parseColor(section);
  if (!rgb) return null;

  return getRelativeLuminance(rgb) > 0.5 ? 'light-scheme' : 'dark-scheme';
}

export function setColorScheme(section) {
  const scheme = getColorScheme(section);
  if (!scheme) return;
  section.querySelectorAll(':scope > *').forEach((el) => {
    // Reset any pre-made color schemes
    el.classList.remove('light-scheme', 'dark-scheme');
    el.classList.add(scheme);
  });
}

// Cached media query results for performance
const MEDIA_QUERIES = {
  mobile: window.matchMedia('(max-width: 599px)'),
  tablet: window.matchMedia('(min-width: 600px) and (max-width: 899px)'),
  desktop: window.matchMedia('(min-width: 900px)'),
};

/**
 * Helper function to create a <source> element
 * @param {string} src the image url
 * @param {number} width the width of the image
 * @param {MediaQueryList} mediaQuery the media query to apply to the source
 *
 * @returns imageSource
 */
export function createSource(src, width, mediaQuery) {
  const { pathname } = new URL(src, window.location.href);
  const source = document.createElement('source');
  source.type = 'image/webp';
  source.srcset = `${pathname}?width=${width}&format=webply&optimize=medium`;
  source.media = mediaQuery;

  return source;
}

/**
 * Extracts image URL from metadata content (picture or img element)
 * @param {Element} content the metadata content element
 * @returns {string|null} the image URL or null
 */
function extractImageUrl(content) {
  const img = content.querySelector('img');
  return img?.src || null;
}

/**
 * Creates a responsive picture element for background images with optimization
 * @param {string} desktopUrl the desktop background image URL
 * @param {string|null} mobileUrl the mobile background image URL (optional)
 * @param {Element} section the section element to add the background to
 */
function handleBackgroundImages(desktopUrl, mobileUrl, section) {
  if (!desktopUrl) return;

  const newPic = document.createElement('picture');
  newPic.classList.add('bg-images');

  // Add mobile source if provided
  if (mobileUrl) {
    newPic.appendChild(createSource(mobileUrl, 600, MEDIA_QUERIES.mobile.media));
  } else {
    newPic.appendChild(createSource(desktopUrl, 899, MEDIA_QUERIES.tablet.media));
  }

  // Add desktop source
  newPic.appendChild(createSource(desktopUrl, 1920, MEDIA_QUERIES.desktop.media));

  // Create the default img element
  const newImg = document.createElement('img');
  newImg.alt = '';
  newImg.className = 'section-img';
  newImg.loading = 'lazy';

  // Use mobile image as default if available, otherwise desktop
  const defaultImgUrl = mobileUrl || desktopUrl;

  // Set width and height once image loads to get native dimensions
  newImg.onload = () => {
    newImg.width = newImg.naturalWidth;
    newImg.height = newImg.naturalHeight;
  };
  newImg.src = defaultImgUrl;

  newPic.appendChild(newImg);
  section.classList.add('has-bg-images');
  section.prepend(newPic);
}

function handleBackground(background, section) {
  const color = background.text;
  // instead of typing "var(--color-name)" authors can use "color-token-name"
  if (color) {
    section.style.background = color.startsWith('color-token')
      ? `var(${color.replace('color-token', '--color')})`
      : color;
    setColorScheme(section);
  }
}

async function handleStyle(text, section) {
  const styles = text.split(', ').map((style) => style.replaceAll(' ', '-'));
  section.classList.add(...styles);
}

async function handleLayout(text, section, type) {
  // any and all .block-content divs will get this treatment
  // so if you want all blocks in a section to be in the same grid,
  // you can't have default content in between blocks.
  // otherwise each block-content will get its own grid.
  if (text === '0') return;
  if (type === 'grid') section.classList.add('grid');
  section.classList.add(`${type}-${text}`);
}

const getSectionMetadata = (el) => [...el.childNodes].reduce((rdx, row) => {
  if (row.children && row.children.length >= 2) {
    const key = row.children[0].textContent.trim().toLowerCase();
    const content = row.children[1];
    const text = content.textContent.trim().toLowerCase();
    if (key && content) rdx[key] = { content, text };
  }
  return rdx;
}, {});

/**
 * Handles the section metadata, including section-level and block-content-level backgrounds
 * @param {Element} el the element to handle the section metadata for
 * @returns {Promise<void>}
 */
export default async function handleSectionMetadata(el) {
  const section = el.closest('.section');
  if (!section) return;
  const metadata = getSectionMetadata(el);

  // Special cases for SECTION - handle these first
  if (metadata.style?.text) await handleStyle(metadata.style.text, section);
  if (metadata.grid?.text) handleLayout(metadata.grid.text, section, 'grid');
  if (metadata.gap?.text) handleLayout(metadata.gap.text, section, 'gap');
  if (metadata.spacing?.text) handleLayout(metadata.spacing.text, section, 'spacing');
  if (metadata.container?.text) handleLayout(metadata.container.text, section, 'container');
  if (metadata.background?.text) handleBackground(metadata.background, section);

  // Define which keys are handled specially for section or block-content
  const specialKeys = ['style', 'grid', 'gap', 'spacing', 'container', 'background-image', 'background-image-mobile', 'background', 'background-block', 'background-block-image', 'background-block-image-mobile', 'object-fit-block', 'object-position-block'];

  // Catch-all: set any other metadata as data- attributes on section
  Object.keys(metadata).forEach((key) => {
    if (!specialKeys.includes(key)) {
      section.dataset[toCamelCase(key)] = metadata[key].text;
    }
  });

  // Handle SECTION background images (desktop and mobile variants)
  const desktopBgImg = metadata['background-image']?.content
    ? extractImageUrl(metadata['background-image'].content)
    : null;
  const mobileBgImg = metadata['background-image-mobile']?.content
    ? extractImageUrl(metadata['background-image-mobile'].content)
    : null;

  if (desktopBgImg || mobileBgImg) {
    handleBackgroundImages(desktopBgImg, mobileBgImg, section);
  }

  // Handle BLOCK-CONTENT specific properties
  const blockContents = section.querySelectorAll(':scope > div.block-content');
  if (blockContents.length > 0) {
    // Handle background-block color
    if (metadata['background-block']?.text) {
      blockContents.forEach((blockContent) => {
        handleBackground(metadata['background-block'], blockContent);
      });
    }

    // Handle block-content background images
    const desktopBlockBgImg = metadata['background-block-image']?.content
      ? extractImageUrl(metadata['background-block-image'].content)
      : null;
    const mobileBlockBgImg = metadata['background-block-image-mobile']?.content
      ? extractImageUrl(metadata['background-block-image-mobile'].content)
      : null;

    if (desktopBlockBgImg || mobileBlockBgImg) {
      blockContents.forEach((blockContent) => {
        handleBackgroundImages(desktopBlockBgImg, mobileBlockBgImg, blockContent);
      });
    }

    // Set object-fit-block and object-position-block as data attributes on block-content
    if (metadata['object-fit-block']?.text) {
      blockContents.forEach((blockContent) => {
        blockContent.dataset.objectFit = metadata['object-fit-block'].text;
      });
    }
    if (metadata['object-position-block']?.text) {
      blockContents.forEach((blockContent) => {
        blockContent.dataset.objectPosition = metadata['object-position-block'].text;
      });
    }
  }

  el.remove();
}

/**
 * For adding customization to the text links
 * @param {Element} a the anchor element
 * @param {URL} url the URL object
 * @returns {Object} the object with dnt and dnb properties
 */
function decorateHash(a, url) {
  const { hash } = url;
  if (!hash || hash === '#') return {};

  const findHash = (name) => {
    const found = hash.includes(name);
    if (found) a.href = a.href.replace(name, '');
    return found;
  };

  const blank = findHash('#_blank');
  if (blank) a.target = '_blank';

  const dnt = findHash('#_dnt');
  const dnb = findHash('#_dnb');
  return { dnt, dnb };
}

/**
 * Localizes the URL, if it is not already localized
 * @param {Object} config the configuration object
 * @param {URL} url the URL object
 * @returns {URL|null} the localized URL or null
 */
export function localizeUrl({ config, url }) {
  const { locales, locale } = config;

  // If we are in the root locale, do nothing
  if (locale.prefix === '') return null;

  const {
    origin,
    pathname,
    search,
    hash,
  } = url;

  // If the link is already localized, do nothing
  if (pathname.startsWith(`${locale.prefix}/`)) return null;

  const localized = Object.keys(locales).some(
    (key) => key !== '' && pathname.startsWith(`${key}/`),
  );
  if (localized) return null;

  return new URL(`${origin}${locale.prefix}${pathname}${search}${hash}`);
}

/**
 * Decorates the link, including localization and auto-blocking
 * @param {Object} config the configuration object
 * @param {Element} a the anchor element
 * @returns {Element|null} the decorated anchor element or null
 */
function decorateLink(config, a) {
  try {
    const url = new URL(a.href);
    const hostMatch = config.hostnames.some((host) => url.hostname.endsWith(host));
    if (hostMatch) a.href = a.href.replace(url.origin, '');

    const { dnt, dnb } = decorateHash(a, url);
    if (!dnt) {
      const localized = localizeUrl({ config, url });
      if (localized) a.href = localized.href;
    }
    decorateButtons(a);
    if (!dnb) {
      const { href } = a;
      const found = config.widgets.some((pattern) => {
        const key = Object.keys(pattern)[0];
        if (!href.includes(pattern[key])) return false;
        a.classList.add(key, 'auto-block');
        return true;
      });
      if (found) return a;
    }
  } catch (ex) {
    config.log('Could not decorate link');
    config.log(ex);
  }
  return null;
}

/**
 * Decorates the links in a given element
 * @param {Element} el the element to decorate the links for
 * @returns {Array<Element>} the decorated anchor elements
 */
function decorateLinks(el) {
  const config = getConfig();
  const anchors = [...el.querySelectorAll('a')];
  return anchors.reduce((acc, a) => {
    const decorated = decorateLink(config, a);
    if (decorated) acc.push(decorated);
    return acc;
  }, []);
}

/**
 * Decorates the sections in a given element
 * Moved from aem.js after heavily modifying the function
 * @param {Element} parent the parent element to decorate the sections for
 * @param {boolean} isDoc whether the element is a document or not
 * @returns {Array<Element>} the decorated section elements
 */
export function decorateSections(parent, isDoc) {
  const selector = isDoc ? 'main > div' : ':scope > div';
  return [...parent.querySelectorAll(selector)].map((section) => {
    const groups = groupChildren(section);
    section.append(...groups);

    section.classList.add('section');
    //  section.dataset.status = 'decorated'; // loadArea deletes this

    section.widgets = decorateLinks(section); // replaces the auto-embed function here
    section.blocks = [...section.querySelectorAll('.block-content > div[class]')];

    // Handle section metadata if present, originally from section-metadata.js
    const sectionMeta = section.querySelector('.section-metadata');
    if (sectionMeta) {
      handleSectionMetadata(sectionMeta);
    }

    return section;
  });
}
// CHARITY - end of ak.js stuff

/**
 * load fonts.css and set a session storage flag
 */
async function loadFonts() {
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks() {
  try {
    // TODO: add auto block, if needed
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

/**
 * Adds accessible aria-label to linked icons that don't have a text content.
 * @param {Element} main The main element
 */
function a11yLinks(main) {
  const links = main.querySelectorAll('a');
  links.forEach((link) => {
    let label = link.textContent;
    if (!label && link.querySelector('span.icon')) {
      const icon = link.querySelector('span.icon');
      label = icon ? icon.classList[1]?.split('-')[1] : label;
    }
    link.setAttribute('aria-label', label);
  });
}

/* CHARITY - author-kit script stuff */

const hostnames = ['localhost', 'helms-charity.hlx.page'];

const locales = {
  '': { lang: 'en' },
  // '/de': { lang: 'de' },
  // '/es': { lang: 'es' },
  // '/fr': { lang: 'fr' },
  // '/hi': { lang: 'hi' },
  // '/ja': { lang: 'ja' },
  // '/zh': { lang: 'zh' },
};

// Widget patterns to look for
const widgets = [
  { fragment: '/fragments/' },
  { youtube: 'https://www.youtube' },
];

// Blocks with self-managed styles
const components = ['fragment'];

// How to decorate an area before loading it
// also applies to section background images
const decorateArea = ({ area = document }) => {
  const eagerLoad = (parent, selector) => {
    const img = parent.querySelector(selector);
    if (!img) return;
    img.removeAttribute('loading');
    img.fetchPriority = 'high';
  };

  eagerLoad(area, 'img');
};

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
// eslint-disable-next-line import/prefer-default-export
export function decorateMain(main) {
  // hopefully forward compatible button decoration
  decorateButtons(main);
  decorateIcons(main);
  decorateLinkedPictures(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateBlocks(main);
  a11yLinks(main);
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  document.documentElement.lang = 'en';
  decorateTemplateAndTheme();
  setConfig({
    hostnames, locales, widgets, components, decorateArea,
  });
  const main = doc.querySelector('main');
  if (main) {
    decorateMain(main);
    document.body.classList.add('appear');
    await loadSection(main.querySelector('.section'), waitForFirstImage);
  }

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= 900 || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

async function lazyHash() {
  const id = window.localStorage.getItem('lazyhash');
  if (!id) return;
  window.localStorage.removeItem('lazyhash');
  window.document.getElementById(id)?.scrollIntoView();
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  const main = doc.querySelector('main');
  await loadSections(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadHeader(doc.querySelector('header'));
  loadFooter(doc.querySelector('footer'));

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();
  lazyHash();
}

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  // eslint-disable-next-line import/no-cycle
  window.setTimeout(() => import('./delayed.js'), 3000);
  // load anything that can be postponed to the latest here
}

async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

loadPage();

/* CHARITY - da specific stuff */
const { searchParams, origin } = new URL(window.location.href);
const branch = searchParams.get('nx') || 'main';

export const NX_ORIGIN = branch === 'local' || origin.includes('localhost') ? 'http://localhost:6456/nx' : 'https://da.live/nx';

(async function loadDa() {
  /* eslint-disable import/no-unresolved */
  if (searchParams.get('dapreview')) {
    import('https://da.live/scripts/dapreview.js')
      .then(({ default: daPreview }) => daPreview(loadPage));
  }
  if (searchParams.get('daexperiment')) {
    import(`${NX_ORIGIN}/public/plugins/exp/exp.js`);
  }
}());
