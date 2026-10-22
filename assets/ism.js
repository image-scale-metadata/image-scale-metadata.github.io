/* Image Scale Metadata — the site's one script.
 *
 * Everything it adds is a reading aid: section numbers set apart, the RFC 2119
 * keywords marked, a link on every heading, and the contents beside the page.
 * The specification reads the same without it.
 */
(function () {
  var page = document.querySelector(".page");
  if (!page) return;

  // "4.2 How the scale was obtained" → the number in a span of its own.
  var heads = page.querySelectorAll("h2, h3");
  for (var i = 0; i < heads.length; i++) {
    var h = heads[i];
    var first = h.firstChild;
    if (first && first.nodeType === 3) {
      var m = first.nodeValue.match(/^\s*(\d+(?:\.\d+)*)\.?\s+/);
      if (m) {
        first.nodeValue = first.nodeValue.slice(m[0].length);
        var no = document.createElement("span");
        no.className = "secno";
        no.textContent = m[1];
        h.insertBefore(no, first);
      }
    }
    if (h.id) {
      var a = document.createElement("a");
      a.className = "anchor";
      a.href = "#" + h.id;
      a.setAttribute("aria-label", "Link to this section");
      a.textContent = "#";
      h.appendChild(a);
    }
  }

  // MUST, MUST NOT, SHOULD, SHOULD NOT, MAY — in running text, never in code.
  var KW = /\b(MUST NOT|SHOULD NOT|MUST|SHOULD|MAY)\b/g;
  var walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT, {
    acceptNode: function (n) {
      if (!KW.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
      KW.lastIndex = 0;
      for (var p = n.parentNode; p && p !== page; p = p.parentNode) {
        if (/^(CODE|PRE|A|H1|H2|H3|SVG)$/i.test(p.nodeName)) return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  var texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  texts.forEach(function (n) {
    var frag = document.createDocumentFragment();
    var s = n.nodeValue, last = 0, m;
    KW.lastIndex = 0;
    while ((m = KW.exec(s))) {
      frag.appendChild(document.createTextNode(s.slice(last, m.index)));
      var k = document.createElement("span");
      k.className = "kw";
      k.textContent = m[1];
      frag.appendChild(k);
      last = m.index + m[1].length;
    }
    frag.appendChild(document.createTextNode(s.slice(last)));
    n.parentNode.replaceChild(frag, n);
  });

  // The contents, from the numbered sections, with the one being read marked.
  var toc = document.querySelector(".toc");
  var sections = page.querySelectorAll("h2[id]");
  if (!toc || sections.length < 3) return;

  var title = document.createElement("p");
  title.className = "toc__title";
  title.textContent = "Contents";
  var list = document.createElement("ol");
  var links = [];
  for (var j = 0; j < sections.length; j++) {
    var sec = sections[j];
    var li = document.createElement("li");
    var link = document.createElement("a");
    link.href = "#" + sec.id;
    var num = sec.querySelector(".secno");
    if (num) {
      var ns = document.createElement("span");
      ns.className = "secno";
      ns.textContent = num.textContent;
      link.appendChild(ns);
    }
    var label = "";
    for (var c = sec.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) label += c.nodeValue;
      else if (!c.classList.contains("secno") && !c.classList.contains("anchor")) label += c.textContent;
    }
    var lt = document.createElement("span");
    lt.textContent = label.trim();
    link.appendChild(lt);
    li.appendChild(link);
    list.appendChild(li);
    links.push(link);
  }
  toc.appendChild(title);
  toc.appendChild(list);

  var ticking = false;
  function mark() {
    ticking = false;
    var current = -1;
    for (var k = 0; k < sections.length; k++) {
      if (sections[k].getBoundingClientRect().top < 140) current = k;
    }
    for (var l = 0; l < links.length; l++) {
      if (l === current) links[l].setAttribute("aria-current", "true");
      else links[l].removeAttribute("aria-current");
    }
  }
  window.addEventListener("scroll", function () {
    if (!ticking) { ticking = true; requestAnimationFrame(mark); }
  }, { passive: true });
  mark();
})();
