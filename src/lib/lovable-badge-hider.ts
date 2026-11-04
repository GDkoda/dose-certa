/**
 * Experimental helper for the "teste" branch.
 *
 * Tries to dismiss the Lovable preview/publishing badge when it is inserted
 * into the same document. This cannot reach into a cross-origin iframe or a
 * closed ShadowRoot, and it does not replace the official hosting setting.
 */
const BADGE_TEXT = /edit\\s+with\\s+lovable/i;
const BADGE_SELECTORS = [
  "#lovable-badge",
  "#lovable-badge-container",
  ".lovable-badge",
  "[data-lovable-badge]",
  '[id*="lovable-badge" i]',
  '[class*="lovable-badge" i]',
  'iframe[title*="lovable" i]',
  'iframe[aria-label*="lovable" i]',
].join(",");

function normalizedText(element: Element): string {
  return (element.textContent ?? "").replace(/\\s+/g, " ").trim();
}

function hideAndRemove(element: Element) {
  if (element === document.body || element === document.documentElement) return;
  try {
    element.setAttribute("data-dose-certa-lovable-hidden", "true");
    (element as HTMLElement).style.setProperty("display", "none", "important");
    (element as HTMLElement).style.setProperty("visibility", "hidden", "important");
    (element as HTMLElement).style.setProperty("pointer-events", "none", "important");
    element.remove();
  } catch {
    // The platform may own an element that cannot be modified.
  }
}

function findBadgeContainer(element: Element): Element {
  let target = element;
  for (let depth = 0; depth < 5; depth += 1) {
    const parent = target.parentElement;
    if (!parent || parent === document.body || parent === document.documentElement) break;

    const parentText = normalizedText(parent);
    const looksLikeBadge = /lovable/i.test(
      [parent.id, parent.className, parent.getAttribute("data-testid") ?? ""].join(" ")
    );
    if (looksLikeBadge) {
      target = parent;
      continue;
    }

    // Only climb through small wrappers. Stop before a page-level container.
    if (parentText.length > 180 || parent.children.length > 6) break;
    target = parent;
  }
  return target;
}

function scanSubtree(node: Node) {
  if (!(node instanceof Element) && node !== document) return;

  const root = node as ParentNode;
  const elementRoot = node instanceof Element ? node : null;

  if (elementRoot?.matches(BADGE_SELECTORS)) {
    hideAndRemove(elementRoot);
    return;
  }

  root.querySelectorAll?.(BADGE_SELECTORS).forEach(hideAndRemove);

  const candidates: Element[] = [];
  if (elementRoot && elementRoot.matches("a,button,[role='button'],div,span")) {
    candidates.push(elementRoot);
  }
  root.querySelectorAll?.("a,button,[role='button'],div,span").forEach((element) => candidates.push(element));

  for (const candidate of candidates) {
    const text = normalizedText(candidate);
    if (!BADGE_TEXT.test(text) || text.length > 180) continue;
    hideAndRemove(findBadgeContainer(candidate));
  }
}

export function startLovableBadgeHider(): () => void {
  if (typeof document === "undefined" || !document.documentElement) return () => undefined;

  const styleId = "dose-certa-lovable-badge-test";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      #lovable-badge,
      #lovable-badge-container,
      .lovable-badge,
      [data-lovable-badge],
      [id*="lovable-badge" i],
      [class*="lovable-badge" i],
      iframe[title*="lovable" i],
      iframe[aria-label*="lovable" i] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `;
    (document.head ?? document.documentElement).appendChild(style);
  }

  // Observe both late injections and text changes made by the platform script.
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "characterData" && record.target.parentElement) {
        scanSubtree(record.target.parentElement);
      }
      for (const addedNode of record.addedNodes) {
        if (addedNode instanceof Element) scanSubtree(addedNode);
        else if (record.target instanceof Element) scanSubtree(record.target);
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true,
  });

  scanSubtree(document);

  return () => {
    observer.disconnect();
    document.getElementById(styleId)?.remove();
  };
}
