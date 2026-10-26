import {
  validateClipboardHtmlItem,
  measureClipboardHtmlString,
  encodeClipboardHtmlString,
} from './clipboard-html.js';
import { decodeClipboardText } from './clipboard-text.js';

export const CLIPBOARD_HTML_MARKUP_LIMIT = 16384;
export const CLIPBOARD_HTML_NODE_LIMIT = 32768;
export const CLIPBOARD_HTML_DEPTH_LIMIT = 128;
const htmlNamespace = 'http://www.w3.org/1999/xhtml';
const invalid = () => new Error('Clipboard HTML cannot be normalized');
const allowed = new Set(
  'a abbr b bdi bdo blockquote br caption code col colgroup dd del div dl dt em font h1 h2 h3 h4 h5 h6 hr i ins kbd li mark ol p pre q s samp small span strike strong sub sup table tbody td tfoot th thead tr u ul var'.split(
    ' ',
  ),
);
const dropped = new Set(
  'applet audio base button canvas embed iframe img input link math meta noscript object option script select source style svg template textarea track video'.split(
    ' ',
  ),
);
const voidTags = new Set(['br', 'hr', 'col']);
const properties = new Set(
  'background-color border border-top border-right border-bottom border-left border-color border-width border-style border-collapse border-spacing color direction font-family font-size font-style font-variant font-weight letter-spacing line-height list-style-type margin margin-top margin-right margin-bottom margin-left padding padding-top padding-right padding-bottom padding-left text-align text-decoration text-decoration-color text-decoration-line text-decoration-style text-indent text-transform vertical-align white-space width height max-width min-width word-spacing'.split(
    ' ',
  ),
);
const decode = (bytes) =>
  new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);

function integerAttribute(
  element,
  name,
  minimum = -1000000,
  maximum = 1000000,
) {
  const text = element.getAttribute(name);
  if (text === null || !/^-?[0-9]{1,7}$/.test(text)) return;
  const value = Number(text);
  if (value >= minimum && value <= maximum) return value;
}

/** Only called on the inert template tree; never inserts untrusted nodes live. */
export function normalizeClipboardHtmlItem(item, maximum = 16777216) {
  return normalize(item, maximum, false);
}
function normalize(item, maximum, isolated) {
  validateClipboardHtmlItem(item, maximum);
  isolated ||= !item.context && !item.selection;
  let tokens = 0;
  for (const byte of item.body)
    if (byte === 60 && ++tokens > CLIPBOARD_HTML_MARKUP_LIMIT) throw invalid();
  const start = item.selection ? item.selectionOffset : item.fragmentOffset;
  const size = item.selection ? item.selectionBytes : item.fragmentBytes;
  const before = decode(item.body.subarray(0, start)),
    selected = decode(item.body.subarray(start, start + size)),
    after = decode(item.body.subarray(start + size));
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
  if (
    before.includes(nonce) ||
    selected.includes(nonce) ||
    after.includes(nonce)
  )
    throw invalid();
  const first = 'bridge-start-' + nonce,
    last = 'bridge-end-' + nonce;
  const template = document.createElement('template');
  let fragment;
  try {
    template.innerHTML =
      before +
      '<!--' +
      first +
      '-->' +
      selected +
      '<!--' +
      last +
      '-->' +
      after;
    const owner = template.content.ownerDocument;
    if (owner === document || owner.defaultView !== null) throw invalid();
    const walker = owner.createTreeWalker(
      template.content,
      NodeFilter.SHOW_ALL,
    );
    let node,
      startNode,
      endNode,
      count = 0;
    const lists = [],
      unsafe = [];
    while ((node = walker.nextNode())) {
      if (++count > CLIPBOARD_HTML_NODE_LIMIT) throw invalid();
      let depth = 0;
      for (
        let parent = node.parentNode;
        parent && parent !== template.content;
        parent = parent.parentNode
      )
        if (++depth > CLIPBOARD_HTML_DEPTH_LIMIT) throw invalid();
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.attributes.length > 64) throw invalid();
        if (node.namespaceURI !== htmlNamespace || dropped.has(node.localName))
          unsafe.push(node);
        if (node.namespaceURI === htmlNamespace && node.localName === 'ol')
          lists.push(node);
      }
      if (node.nodeType === Node.COMMENT_NODE) {
        if (node.data === first) {
          if (startNode) throw invalid();
          startNode = node;
        }
        if (node.data === last) {
          if (endNode) throw invalid();
          endNode = node;
        }
      }
    }
    if (
      !startNode ||
      !endNode ||
      !(
        startNode.compareDocumentPosition(endNode) &
        Node.DOCUMENT_POSITION_FOLLOWING
      )
    )
      throw invalid();
    const range = owner.createRange();
    range.setStartAfter(startNode);
    range.setEndBefore(endNode);
    if (range.collapsed && size !== 0) throw invalid();
    // Preserve ordered numbering when the selected item follows unselected siblings.
    for (const list of lists) {
      const children = Array.from(list.children).filter(
        (child) => child.localName === 'li',
      );
      let number =
        integerAttribute(list, 'start') ??
        (list.hasAttribute('reversed') ? children.length : 1);
      for (const child of children) {
        number = integerAttribute(child, 'value') ?? number;
        if (range.intersectsNode(child)) {
          list.setAttribute('start', String(number));
          break;
        }
        number += list.hasAttribute('reversed') ? -1 : 1;
      }
    }
    const ancestors = [];
    for (
      let parent = isolated
        ? range.commonAncestorContainer
        : startNode.parentNode;
      parent !== template.content;
      parent = parent.parentNode
    ) {
      if (
        !parent ||
        parent.nodeType !== Node.ELEMENT_NODE ||
        parent.namespaceURI !== htmlNamespace ||
        dropped.has(parent.localName)
      )
        throw invalid();
      ancestors.push(parent);
    }
    let sanitized = false;
    // Do not clone active/nested-template contents, including trees not exposed
    // by the ordinary TreeWalker. Selected markers inside them already refused.
    for (const node of unsafe) {
      if (range.intersectsNode(node)) sanitized = true;
      node.remove();
    }
    if (isolated) {
      // This tree contains only selected source bytes and empty safe ancestors.
      // Foster parenting/repair must not move any surviving content outside the
      // marker range and silently change the selected item.
      const checked = owner.createTreeWalker(
        template.content,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      );
      while ((node = checked.nextNode()))
        if (!range.intersectsNode(node)) throw invalid();
      fragment = range.cloneContents();
    }
    let used = 0;
    const budget = Math.min(maximum, 16777216 - 32) - (item.text?.length ?? 0),
      parts = [];
    const append = (text) => {
      if (parts.length >= CLIPBOARD_HTML_NODE_LIMIT * 16) throw invalid();
      used += measureClipboardHtmlString(text, budget - used);
      parts.push(text);
    };
    const escaped = (text) => {
      let bytes = measureClipboardHtmlString(text, budget - used);
      for (const c of text)
        bytes += c === '&' ? 4 : c === '<' || c === '>' ? 3 : c === '"' ? 5 : 0;
      if (bytes > budget - used) throw invalid();
      append(
        text.replace(
          /[&<>"]/g,
          (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
        ),
      );
    };
    const attribute = (name, value) => {
      append(' ' + name + '="');
      escaped(value);
      append('"');
    };
    const open = (element) => {
      const name = element.localName;
      if (!allowed.has(name)) {
        sanitized = true;
        return false;
      }
      append('<' + name);
      for (const attr of element.attributes) {
        const key = attr.name,
          value = attr.value;
        if (value.length > 4096) throw invalid();
        if (key === 'style') {
          const style = element.style,
            values = [];
          if (!style.length && value.trim()) sanitized = true;
          if (style.length > 64) throw invalid();
          for (let n = 0; n < style.length; ++n) {
            const property = style.item(n),
              css = style.getPropertyValue(property);
            if (
              !properties.has(property) ||
              css.length > 256 ||
              /[\\@;<>]|(?:url|image|image-set|expression|element|paint|var|env|attr)\s*\(/i.test(
                css,
              )
            ) {
              sanitized = true;
              continue;
            }
            values.push(
              property +
                ': ' +
                css +
                (style.getPropertyPriority(property) === 'important'
                  ? ' !important'
                  : '') +
                ';',
            );
          }
          if (values.length) attribute('style', values.join(' '));
          continue;
        }
        if (key === 'dir' && /^(ltr|rtl|auto)$/.test(value)) {
          attribute(key, value);
          continue;
        }
        if (key === 'lang' && /^[a-zA-Z0-9-]{1,35}$/.test(value)) {
          attribute(key, value);
          continue;
        }
        if (key === 'align' && /^(left|right|center|justify)$/.test(value)) {
          attribute(key, value);
          continue;
        }
        if (key === 'valign' && /^(top|middle|bottom|baseline)$/.test(value)) {
          attribute(key, value);
          continue;
        }
        if (
          ['colspan', 'rowspan', 'span', 'start', 'value'].includes(key) &&
          ((['td', 'th'].includes(name) &&
            ['colspan', 'rowspan'].includes(key)) ||
            (['col', 'colgroup'].includes(name) && key === 'span') ||
            (name === 'ol' && key === 'start') ||
            (name === 'li' && key === 'value'))
        ) {
          const integer = integerAttribute(
            element,
            key,
            key === 'start' || key === 'value' ? -1000000 : 1,
            key === 'start' || key === 'value' ? 1000000 : 1000,
          );
          if (integer !== undefined) {
            attribute(key, String(integer));
            continue;
          }
        }
        if (name === 'ol' && key === 'reversed') {
          attribute(key, '');
          continue;
        }
        if (
          ['width', 'height'].includes(key) &&
          /^(?:[0-9]{1,5}|[0-9]{1,3}%)$/.test(value)
        ) {
          attribute(key, value);
          continue;
        }
        if (
          name === 'font' &&
          ['color', 'face', 'size'].includes(key) &&
          /^[a-zA-Z0-9 #,+.\-]{1,128}$/.test(value)
        ) {
          attribute(key, value);
          continue;
        }
        if (
          name === 'a' &&
          key === 'href' &&
          value.length <= 2048 &&
          !/[\x00-\x20\x7f]/.test(value)
        ) {
          try {
            const url = new URL(value);
            if (
              ['http:', 'https:', 'mailto:'].includes(url.protocol) &&
              !url.username &&
              !url.password
            ) {
              attribute(key, url.href);
              continue;
            }
          } catch {
            /* Unsupported link; fixed sanitization outcome only. */
          }
        }
        sanitized = true;
      }
      append('>');
      return !voidTags.has(name);
    };
    if (size === 0)
      return {
        html: '',
        ...(item.text === undefined
          ? {}
          : { text: decodeClipboardText(item.text, maximum) }),
        sanitized: false,
      };
    const wrappers = [];
    for (const parent of ancestors.reverse())
      if (open(parent)) wrappers.push(parent.localName);
    if (!isolated) {
      const fragmentOffset = used;
      append(selected);
      const fragmentBytes = used - fragmentOffset;
      for (const name of wrappers.reverse()) append('</' + name + '>');
      const body = encodeClipboardHtmlString(parts.join(''), budget);
      try {
        const result = normalize(
          {
            body,
            fragmentOffset,
            fragmentBytes,
            selectionOffset: 0,
            selectionBytes: 0,
            context: true,
            selection: false,
            ...(item.text === undefined ? {} : { text: item.text }),
          },
          maximum,
          true,
        );
        return { ...result, sanitized: sanitized || result.sanitized };
      } finally {
        body.fill(0);
      }
    }
    const stack = [];
    for (let child = fragment.lastChild; child; child = child.previousSibling)
      stack.push({ node: child, close: false });
    while (stack.length) {
      const entry = stack.pop(),
        node = entry.node;
      if (entry.close) {
        append('</' + node.localName + '>');
        continue;
      }
      if (node.nodeType === Node.TEXT_NODE) {
        escaped(node.data);
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        sanitized = true;
        continue;
      }
      if (node.namespaceURI !== htmlNamespace || dropped.has(node.localName)) {
        sanitized = true;
        continue;
      }
      const close = open(node);
      if (close) stack.push({ node, close: true });
      for (let child = node.lastChild; child; child = child.previousSibling)
        stack.push({ node: child, close: false });
    }
    for (const name of wrappers.reverse()) append('</' + name + '>');
    return {
      html: parts.join(''),
      ...(item.text === undefined
        ? {}
        : { text: decodeClipboardText(item.text, maximum) }),
      sanitized,
    };
  } finally {
    template.content.replaceChildren();
    fragment?.replaceChildren();
  }
}
