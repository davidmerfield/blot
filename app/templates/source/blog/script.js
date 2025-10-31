// This script is embedded in the footer of every page

// Is replaced with the JavaScript required by various features
// you can turn on and off on the services page of your dashboard:
// 
// https://blot.im/settings/services
//
{{{appJS}}}




/*! instant.page v1.2.2 - (C) 2019 Alexandre Dieulot - https://instant.page/license */
let urlToPreload
let mouseoverTimer
let lastTouchTimestamp

const prefetcher = document.createElement('link')
const isSupported = prefetcher.relList && prefetcher.relList.supports && prefetcher.relList.supports('prefetch')
const isDataSaverEnabled = navigator.connection && navigator.connection.saveData
const allowQueryString = 'instantAllowQueryString' in document.body.dataset
const allowExternalLinks = 'instantAllowExternalLinks' in document.body.dataset

if (isSupported && !isDataSaverEnabled) {
  prefetcher.rel = 'prefetch'
  document.head.appendChild(prefetcher)

  const eventListenersOptions = {
    capture: true,
    passive: true,
  }
  document.addEventListener('touchstart', touchstartListener, eventListenersOptions)
  document.addEventListener('mouseover', mouseoverListener, eventListenersOptions)
}

function touchstartListener(event) {
  /* Chrome on Android calls mouseover before touchcancel so `lastTouchTimestamp`
   * must be assigned on touchstart to be measured on mouseover. */
  lastTouchTimestamp = performance.now()

  const linkElement = event.target.closest('a')

  if (!isPreloadable(linkElement)) {
    return
  }

  linkElement.addEventListener('touchcancel', touchendAndTouchcancelListener, {passive: true})
  linkElement.addEventListener('touchend', touchendAndTouchcancelListener, {passive: true})

  urlToPreload = linkElement.href
  preload(linkElement.href)
}

function touchendAndTouchcancelListener() {
  urlToPreload = undefined
  stopPreloading()
}

function mouseoverListener(event) {
  if (performance.now() - lastTouchTimestamp < 1100) {
    return
  }

  const linkElement = event.target.closest('a')

  if (!isPreloadable(linkElement)) {
    return
  }

  linkElement.addEventListener('mouseout', mouseoutListener, {passive: true})

  urlToPreload = linkElement.href

  mouseoverTimer = setTimeout(() => {
    preload(linkElement.href)
    mouseoverTimer = undefined
  }, 65)
}

function mouseoutListener(event) {
  if (event.relatedTarget && event.target.closest('a') == event.relatedTarget.closest('a')) {
    return
  }

  if (mouseoverTimer) {
    clearTimeout(mouseoverTimer)
    mouseoverTimer = undefined
  }
  else {
    urlToPreload = undefined
    stopPreloading()
  }
}

function isPreloadable(linkElement) {
  if (!linkElement || !linkElement.href) {
    return
  }

  if (urlToPreload == linkElement.href) {
    return
  }

  const preloadLocation = new URL(linkElement.href)

  if (!allowExternalLinks && preloadLocation.origin != location.origin && !('instant' in linkElement.dataset)) {
    return
  }

  if (!['http:', 'https:'].includes(preloadLocation.protocol)) {
    return
  }

  if (preloadLocation.protocol == 'http:' && location.protocol == 'https:') {
    return
  }

  if (!allowQueryString && preloadLocation.search && !('instant' in linkElement.dataset)) {
    return
  }

  if (preloadLocation.hash && preloadLocation.pathname + preloadLocation.search == location.pathname + location.search) {
    return
  }

  if ('noInstant' in linkElement.dataset) {
    return
  }

  return true
}

function preload(url) {
  prefetcher.href = url
}

function stopPreloading() {
  prefetcher.removeAttribute('href')
}

// Hack to fix broken footnote links on the
// index page of the blog. Remove this once we
// do it on the server
expandFootnoteLinks();

function expandFootnoteLinks (){
  const entries = document.querySelectorAll('.entry.on-index-page');
  entries.forEach(entry =>{
    const url = entry.getAttribute('data-url');
    if (!url) return;
    const footnotes = document
      .querySelectorAll('.entry[data-url="' + url + '"] a.footnote-ref');

    footnotes
      .forEach((footnote)=> {
        const href = footnote.getAttribute('href');
        if (!href || href[0] !== '#') return;
        footnote.setAttribute('href', url + href);
      });
  });
}

(function() {
        scrollTo();
      })();
      
      function scrollTo() {
        const links = document.querySelectorAll('a[href^="#"]');
        links.forEach(each => (each.onclick = scrollAnchors));
      }
      
      function scrollAnchors(e, respond = null) {
        const distanceToTop = el => Math.floor(el.getBoundingClientRect().top);
        e.preventDefault();
        var targetID = (respond) ? respond.getAttribute('href') : this.getAttribute('href');
        const targetAnchor = document.querySelector(targetID);
        if (!targetAnchor) return;
        const originalTop = distanceToTop(targetAnchor);
        window.scrollBy({ top: originalTop, left: 0, behavior: 'smooth' });
        const checkIfDone = setInterval(function() {
          const atBottom = window.innerHeight + window.pageYOffset >= document.body.offsetHeight - 2;
          if (distanceToTop(targetAnchor) === 0 || atBottom) {
            targetAnchor.tabIndex = '-1';
            targetAnchor.focus();
            window.history.pushState('', '', targetID);
            clearInterval(checkIfDone);
          }
        }, 100);
      }


document.documentElement.style.setProperty('--scrollbar-width', (window.innerWidth - document.documentElement.clientWidth) + "px");
      