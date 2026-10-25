/**
 * Starts every Reveal (motion.tsx) as it scrolls into view — the same viewport test motion's whileInView used: once,
 * with the bottom 12% of the screen left out — from the first paint instead of after hydration, and for elements that
 * client navigation adds later. Inlined at the end of the site layout; without IntersectionObserver everything shows.
 */
export const REVEAL_SCRIPT = `(function(){var d=document,s=function(e){e.setAttribute('data-shown','')};try{var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){io.unobserve(e.target);s(e.target)}})},{rootMargin:'0px 0px -12% 0px'});var w=function(r){if(r.matches&&r.matches('[data-reveal]:not([data-shown])'))io.observe(r);if(r.querySelectorAll)r.querySelectorAll('[data-reveal]:not([data-shown])').forEach(function(e){io.observe(e)})};w(d);new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(function(n){if(n.nodeType===1)w(n)})})}).observe(d.body,{childList:true,subtree:true})}catch(_){d.querySelectorAll('[data-reveal]').forEach(s)}})();`;
