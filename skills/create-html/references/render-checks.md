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

## Labels in SVG figures

`issues` must be an empty array. It lists labels that overlap each other, leave the `viewBox`, or stick out of the smallest box around them. Lines and branches that cross a label are not detected, so look at each figure in a screenshot at desktop width and at 390 px as well.

```javascript
(() => {
  const issues = [];
  document.querySelectorAll('svg').forEach((svg, i) => {
    const vb = svg.viewBox.baseVal;
    const labels = [...svg.querySelectorAll('text')].map((t) => ({ text: t.textContent.trim().slice(0, 24), b: t.getBBox() }));
    const boxes = [...svg.querySelectorAll('rect')].map((r) => r.getBBox());
    labels.forEach(({ text, b }) => {
      if (vb && vb.width && (b.x < vb.x || b.y < vb.y || b.x + b.width > vb.x + vb.width || b.y + b.height > vb.y + vb.height)) {
        issues.push(`figure ${i + 1}: outside the viewBox "${text}"`);
      }
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      const around = boxes.filter((r) => cx > r.x && cx < r.x + r.width && cy > r.y && cy < r.y + r.height);
      if (around.length) {
        const r = around.reduce((m, x) => (x.width * x.height < m.width * m.height ? x : m));
        if (b.x < r.x - 1 || b.x + b.width > r.x + r.width + 1) issues.push(`figure ${i + 1}: sticks out of its box "${text}"`);
      }
    });
    for (let a = 0; a < labels.length; a += 1) {
      for (let c = a + 1; c < labels.length; c += 1) {
        const A = labels[a].b, B = labels[c].b;
        if (A.x < B.x + B.width - 1 && B.x < A.x + A.width - 1 && A.y < B.y + B.height - 1 && B.y < A.y + A.height - 1) {
          issues.push(`figure ${i + 1}: "${labels[a].text}" overlaps "${labels[c].text}"`);
        }
      }
    }
  });
  return issues;
})();
```

`getBBox()` ignores `transform`. If a figure positions groups with `transform`, compare `getBoundingClientRect()` instead.

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
