# Render checks

The static checker cannot tell which of two CSS rules wins or whether a shape overlaps another. Run these in the browser when a page uses something the template does not have: a calendar, a new grid, a table or code inside the hero, or after someone reports a display problem. Serve the file over a local HTTP server (`python3 -m http.server`), run the snippets in the page, and then look at one screenshot yourself.

## Contrast across the whole page

`lowContrast` must be 0. Text on a gradient is skipped because white is correct there.

```javascript
(() => {
  const lum = (c) => { const m = (c.match(/[\d.]+/g) || [0, 0, 0]).map(Number); return 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]; };
  const alpha = (c) => { const m = c.match(/[\d.]+/g) || []; return m.length > 3 ? Number(m[3]) : 1; };
  const effectiveBg = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage.includes('gradient')) return null;
      if (alpha(cs.backgroundColor) > 0.05) return lum(cs.backgroundColor);
    }
    return 255;
  };
  const bad = [];
  document.querySelectorAll('.wrap *, .hero *').forEach((el) => {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return;
    const bg = effectiveBg(el);
    if (bg === null) return;
    if (Math.abs(lum(getComputedStyle(el).color) - bg) < 60) bad.push({ tag: el.tagName, cls: el.className, text: el.textContent.trim().slice(0, 40) });
  });
  return { lowContrast: bad.length, bad };
})();
```

## Nested gradient bands

`nested` must be an empty array.

```javascript
const g = [...document.querySelectorAll('*')].filter((e) => getComputedStyle(e).backgroundImage.includes('gradient'));
const nested = g.filter((e) => g.some((o) => o !== e && o.contains(e)));
nested.map((e) => `${e.tagName.toLowerCase()}.${e.className}`);
```

## Horizontal overflow at phone width

The root must not scroll sideways, and the content should read with vertical scrolling alone. Measure inside a 390 × 844 iframe of the same page:

```javascript
const f = document.createElement('iframe');
f.style.cssText = 'position:fixed;left:0;top:0;width:390px;height:844px;z-index:99999;border:0';
f.src = location.href;
document.body.appendChild(f);
await new Promise((r) => (f.onload = r));
const de = f.contentDocument.documentElement;
({ width: de.clientWidth, scrollWidth: de.scrollWidth, ok: de.scrollWidth <= de.clientWidth + 1 });
```

If it overflows, find the element whose `getBoundingClientRect().right` exceeds the viewport and fix the cause: `nowrap`, fixed widths, too many fixed grid columns, or a missing `min-width: 0` on a flex or grid child. Do not hide the overflow with `overflow-x: hidden` on `html` or `body`.

## Calendar

- Leading blank cells match the first weekday of the month, and dates run from 1 to the last day.
- Chips stay inside their day cell:

```javascript
[...document.querySelectorAll('.cal-grid .chip')].filter((c) => {
  const p = c.parentElement.getBoundingClientRect(), r = c.getBoundingClientRect();
  return r.right > p.right + 1 || r.bottom > p.bottom + 1;
}).map((c) => c.textContent.slice(0, 16)); // must be []
```

- The number of weekend and holiday cells matches what the generator counted. A holiday color showing up on a weekday means a rule is hitting some other element.
- On a time-axis calendar, compute the expected `top` and `height` of one block from its `--s` and `--e` values and compare them with the measured box.

## Checking transitions in a background tab

Background tabs do not advance CSS transitions, so `getComputedStyle` returns the starting value. Set `style.transition = 'none'` on the element before reading the final value.
