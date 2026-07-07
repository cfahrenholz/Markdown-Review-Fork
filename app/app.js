const state = {
  document: null,
  selected: null,
  lineStarts: [],
  viewMode: "source",
  visibleApprovedIds: new Set(),
  lastSignature: "",
  isReloading: false,
};

const elements = {
  fileLabel: document.querySelector("#file-label"),
  documentPanel: document.querySelector(".document-panel"),
  feedbackPanel: document.querySelector(".feedback-panel"),
  markdown: document.querySelector("#document"),
  editor: document.querySelector("#editor"),
  editorActions: document.querySelector(".editor-actions"),
  saveEditor: document.querySelector("#save-editor"),
  cancelEditor: document.querySelector("#cancel-editor"),
  selectedQuote: document.querySelector("#selected-quote"),
  selectionCard: document.querySelector("#selection-card"),
  commentInput: document.querySelector("#comment-input"),
  saveButton: document.querySelector("#save-comment"),
  cancelSelection: document.querySelector("#cancel-selection"),
  saveState: document.querySelector("#save-state"),
  comments: document.querySelector("#comments"),
  count: document.querySelector("#comment-count"),
  changeLog: document.querySelector("#change-log"),
  changeCount: document.querySelector("#change-count"),
  reload: document.querySelector("#reload-button"),
  viewButtons: document.querySelectorAll("[data-view-mode]"),
};

const icons = {
  rotateCw: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v9h-9"/></svg>',
  circle: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  steer: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8"/><path d="M8 13h5"/></svg>',
};

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMarkdown(value) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return html;
}

function quotePreview(value, maxLength = 100) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function computeLineStarts(markdown) {
  const starts = [];
  let offset = 0;
  for (const line of markdown.split(/\r?\n/)) {
    starts.push(offset);
    offset += line.length + 1;
  }
  return starts;
}

function markerToken(kind, id) {
  return `⟦rb:${kind}:${id}⟧`;
}

function markerRange(comment, markdown) {
  if (commentStatus(comment) === "approved") return null;

  const preferredQuote = comment.applied?.newQuote || comment.quote || "";
  if (preferredQuote) {
    const start = markdown.indexOf(preferredQuote);
    if (start >= 0) return { start, end: start + preferredQuote.length };
  }

  if (Number.isInteger(comment.startOffset) && Number.isInteger(comment.endOffset)) {
    return {
      start: Math.max(0, Math.min(markdown.length, comment.startOffset)),
      end: Math.max(0, Math.min(markdown.length, comment.endOffset)),
    };
  }

  return null;
}

function markdownWithEditorMarkers(markdown) {
  const inserts = [];
  for (const comment of state.document?.feedback?.comments || []) {
    const range = markerRange(comment, markdown);
    if (!range || range.end < range.start) continue;
    inserts.push({ index: range.end, token: markerToken("end", comment.id) });
    inserts.push({ index: range.start, token: markerToken("start", comment.id) });
  }

  let result = markdown;
  for (const insert of inserts.sort((a, b) => b.index - a.index)) {
    result = `${result.slice(0, insert.index)}${insert.token}${result.slice(insert.index)}`;
  }
  return result;
}

function renderEditor(markdown) {
  const marked = markdownWithEditorMarkers(markdown);
  const html = escapeHtml(marked).replace(/⟦rb:(start|end):([A-Za-z0-9_-]+)⟧/g, (token, kind, id) =>
    `<span class="edit-marker" contenteditable="false" data-marker-kind="${kind}" data-marker-id="${id}">${escapeHtml(token)}</span>`
  );
  elements.editor.innerHTML = html;
}

function activeAnnotations() {
  const comments = state.document?.feedback?.comments || [];
  const openComments = comments
    .filter((comment) => commentStatus(comment) === "commented")
    .map((comment) => ({ ...comment, markerKind: "comment", markerId: comment.id }));
  const resolvedChanges = comments
    .filter((comment) => comment.status === "edited" && comment.applied?.newQuote)
    .map(appliedAnnotation)
    .filter(Boolean);
  const visibleApprovedChanges = comments
    .filter((comment) => commentStatus(comment) === "approved" && state.visibleApprovedIds.has(comment.id) && comment.applied?.newQuote)
    .map(appliedAnnotation)
    .filter(Boolean);
  const annotations = [...openComments, ...resolvedChanges, ...visibleApprovedChanges];
  return state.selected ? [...annotations, { ...state.selected, isPending: true, markerKind: "pending", markerId: "pending" }] : annotations;
}

function appliedAnnotation(comment) {
  const quote = comment.applied?.newQuote || "";
  if (!quote) return null;

  const start = state.document.markdown.indexOf(quote);
  if (start >= 0) {
    return {
      ...comment,
      quote,
      startOffset: start,
      endOffset: start + quote.length,
      markerKind: "resolution",
      markerId: comment.id,
    };
  }

  return {
    ...comment,
    quote,
    startLine: comment.applied.newStartLine || comment.startLine,
    endLine: comment.applied.newEndLine || comment.endLine,
    startOffset: null,
    endOffset: null,
    markerKind: "resolution",
    markerId: comment.id,
  };
}

function findRanges(lineText, lineNumber, segmentStart) {
  const ranges = [];
  const segmentEnd = segmentStart + lineText.length;

  for (const annotation of activeAnnotations()) {
    if (Number.isInteger(annotation.startOffset) && Number.isInteger(annotation.endOffset)) {
      const start = Math.max(annotation.startOffset, segmentStart);
      const end = Math.min(annotation.endOffset, segmentEnd);
      if (end > start) {
        ranges.push({ start: start - segmentStart, end: end - segmentStart, pending: annotation.isPending, kind: annotation.markerKind || "comment", id: annotation.markerId });
      }
      continue;
    }

    if (!annotation.startLine || !annotation.endLine) continue;
    if (lineNumber < annotation.startLine || lineNumber > annotation.endLine) continue;

    const quoteLines = String(annotation.quote || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    let needle = "";

    if (annotation.startLine === annotation.endLine) {
      needle = String(annotation.quote || "").trim();
    } else if (lineNumber === annotation.startLine) {
      needle = quoteLines[0] || "";
    } else if (lineNumber === annotation.endLine) {
      needle = quoteLines[quoteLines.length - 1] || "";
    }

    if (!needle && lineNumber > annotation.startLine && lineNumber < annotation.endLine) {
      ranges.push({ start: 0, end: lineText.length, pending: annotation.isPending, kind: annotation.markerKind || "comment", id: annotation.markerId });
      continue;
    }

    let start = lineText.indexOf(needle);
    if (start < 0 && needle.length > 30) {
      start = lineText.indexOf(needle.slice(0, 30));
    }
    if (start < 0 && annotation.markerKind === "resolution") {
      continue;
    }
    if (start < 0) {
      ranges.push({ start: 0, end: lineText.length, pending: annotation.isPending, kind: annotation.markerKind || "comment", id: annotation.markerId });
      continue;
    }

    const end = Math.min(lineText.length, start + needle.length);
    ranges.push({ start, end, pending: annotation.isPending, kind: annotation.markerKind || "comment", id: annotation.markerId });
  }

  return ranges.filter((range) => range.end > range.start);
}

function highlightedInline(lineText, lineNumber) {
  const lineStart = state.lineStarts[lineNumber - 1] || 0;
  const ranges = findRanges(lineText, lineNumber, lineStart);
  return highlightedInlineAtOffset(lineText, ranges);
}

function highlightedInlineAtOffset(lineText, ranges, options = {}) {
  const format = options.format !== false;
  const renderText = (text) => format ? inlineMarkdown(text) : escapeHtml(text);
  if (!ranges.length) return renderText(lineText);

  const points = new Set([0, lineText.length]);
  for (const range of ranges) {
    points.add(range.start);
    points.add(range.end);
  }

  const sorted = [...points].sort((a, b) => a - b);
  return sorted.slice(0, -1).map((start, index) => {
    const end = sorted[index + 1];
    const text = lineText.slice(start, end);
    const covering = ranges.filter((range) => range.start <= start && range.end >= end);
    const html = renderText(text);
    if (!covering.length) return html;
    const pending = covering.some((range) => range.pending);
    const resolution = covering.some((range) => range.kind === "resolution");
    const depth = Math.min(3, covering.length);
    const classes = ["review-highlight"];
    if (pending) classes.push("is-pending");
    if (resolution) classes.push("is-resolution");
    const ids = [...new Set(covering.map((range) => range.id).filter(Boolean))].join(" ");
    return `<mark class="${classes.join(" ")}" data-depth="${depth}" data-comment-ids="${escapeHtml(ids)}">${html}</mark>`;
  }).join("");
}

function renderSourceLine(line, index) {
  const number = index + 1;
  const lineStart = state.lineStarts[index] || 0;
  const ranges = findRanges(line, number, lineStart);
  return `<div class="md-line" data-line="${number}" data-content-start="${lineStart}" data-content-end="${lineStart + line.length}"><code class="md-content" data-content-start="${lineStart}">${highlightedInlineAtOffset(line, ranges, { format: false }) || " "}</code></div>`;
}

function renderRenderedLine(line, index) {
  const number = index + 1;
  const lineStart = state.lineStarts[index] || 0;
  const lineData = (contentStart, contentEnd = lineStart + line.length) =>
    `data-line="${number}" data-content-start="${contentStart}" data-content-end="${contentEnd}"`;
  if (!line.trim()) return `<div class="md-line md-blank" ${lineData(lineStart)}></div>`;

  const heading = line.match(/^(#{1,3})\s+(.+)$/);
  if (heading) {
    const level = heading[1].length;
    const contentStart = lineStart + heading[1].length + 1;
    const ranges = findRanges(heading[2], number, contentStart);
    return `<div class="md-line" ${lineData(contentStart)}><h${level}><span class="md-content" data-content-start="${contentStart}">${highlightedInlineAtOffset(heading[2], ranges)}</span></h${level}></div>`;
  }

  if (line.startsWith("> ")) {
    const contentStart = lineStart + 2;
    const text = line.slice(2);
    const ranges = findRanges(text, number, contentStart);
    return `<div class="md-line" ${lineData(contentStart)}><blockquote><span class="md-content" data-content-start="${contentStart}">${highlightedInlineAtOffset(text, ranges)}</span></blockquote></div>`;
  }

  const bullet = line.match(/^(\s*)[-*]\s+(.+)$/);
  if (bullet) {
    const contentStart = lineStart + line.indexOf(bullet[2]);
    const ranges = findRanges(bullet[2], number, contentStart);
    return `<div class="md-line" ${lineData(contentStart)}><p>• <span class="md-content" data-content-start="${contentStart}">${highlightedInlineAtOffset(bullet[2], ranges)}</span></p></div>`;
  }

  const ordered = line.match(/^(\s*)\d+\.\s+(.+)$/);
  if (ordered) {
    const contentStart = lineStart + line.indexOf(ordered[2]);
    const ranges = findRanges(ordered[2], number, contentStart);
    return `<div class="md-line" ${lineData(contentStart)}><p><span class="md-content" data-content-start="${contentStart}">${highlightedInlineAtOffset(ordered[2], ranges)}</span></p></div>`;
  }

  const ranges = findRanges(line, number, lineStart);
  return `<div class="md-line" ${lineData(lineStart)}><p><span class="md-content" data-content-start="${lineStart}">${highlightedInlineAtOffset(line, ranges)}</span></p></div>`;
}

function renderMarkdown(markdown) {
  state.lineStarts = computeLineStarts(markdown);
  const renderer = state.viewMode === "source" ? renderSourceLine : renderRenderedLine;
  const editMode = state.viewMode === "edit";
  elements.markdown.hidden = editMode;
  elements.editor.hidden = !editMode;
  elements.editorActions.hidden = !editMode;
  if (editMode) {
    renderEditor(markdown);
    return;
  }
  elements.markdown.classList.toggle("is-source", state.viewMode === "source");
  elements.markdown.classList.toggle("is-rendered", state.viewMode === "rendered");
  elements.markdown.innerHTML = markdown.split(/\r?\n/).map(renderer).join("");
}

async function api(path, options = {}) {
  if (!window.__TAURI__) {
    throw new Error("Markdown Review muss als Tauri-App gestartet werden.");
  }

  return apiTauri(path, options);
}

async function apiTauri(path, options = {}) {
  const invoke = window.__TAURI__.core.invoke;
  const body = options.body ? JSON.parse(options.body) : undefined;

  try {
    if (path === "/api/document") return await invoke("get_document");
    if (path === "/api/comments" && options.method === "POST") return await invoke("save_comment", { input: body });
    if (path === "/api/save-editor") return await invoke("save_editor", { markdownWithMarkers: body.markdownWithMarkers });
    const commentMatch = path.match(/^\/api\/comments\/(.+)$/);
    if (commentMatch && options.method === "PATCH") {
      return await invoke("patch_comment", { id: decodeURIComponent(commentMatch[1]), patch: body });
    }
    throw new Error(`Unhandled Tauri route: ${path}`);
  } catch (error) {
    throw new Error(typeof error === "string" ? error : error?.message || "Request failed");
  }
}

async function loadDocument() {
  state.isReloading = true;
  state.document = await api("/api/document");
  state.lastSignature = documentSignature(state.document);
  elements.fileLabel.textContent = state.document.file;
  renderMarkdown(state.document.markdown);
  renderChangeLog();
  renderComments();
  state.isReloading = false;
}

function documentSignature(documentData) {
  return `${documentData.documentMtimeMs || 0}:${documentData.feedbackMtimeMs || 0}`;
}

async function hotReloadTick() {
  if (!state.document || state.isReloading || state.viewMode === "edit") return;

  try {
    const next = await api("/api/document");
    const nextSignature = documentSignature(next);
    if (nextSignature === state.lastSignature) return;

    state.document = next;
    state.lastSignature = nextSignature;
    renderMarkdown(state.document.markdown);
    renderChangeLog();
    renderComments();
    elements.saveState.textContent = "Extern aktualisiert.";
  } catch (error) {
    elements.saveState.textContent = error.message;
  }
}

async function saveEditorAndSwitch(nextMode = "source") {
  elements.saveState.textContent = "Speichere Markdown...";
  const result = await api("/api/save-editor", {
    method: "POST",
    body: JSON.stringify({ markdownWithMarkers: elements.editor.innerText }),
  });
  state.document.markdown = result.markdown;
  state.document.feedback = result.feedback;
  state.document.documentMtimeMs = result.documentMtimeMs;
  state.document.feedbackMtimeMs = result.feedbackMtimeMs;
  state.lastSignature = documentSignature(result);
  state.viewMode = nextMode;
  elements.viewButtons.forEach((item) => item.classList.toggle("is-active", item.dataset.viewMode === nextMode));
  renderMarkdown(state.document.markdown);
  renderComments();
  elements.saveState.textContent = "Markdown gespeichert.";
}

function cancelEditor() {
  state.viewMode = "source";
  elements.viewButtons.forEach((item) => item.classList.toggle("is-active", item.dataset.viewMode === "source"));
  renderMarkdown(state.document.markdown);
  elements.saveState.textContent = "Bearbeitung verworfen.";
}

function lineFromNode(node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  const line = element?.closest?.("[data-line]");
  return line ? Number(line.dataset.line) : null;
}

function lineElementFromNode(node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  return element?.closest?.("[data-line]") || null;
}

function contentElementFromNode(node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  return element?.closest?.(".md-content") || lineElementFromNode(node);
}

function selectedRange() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !elements.markdown.contains(selection.anchorNode)) return null;

  const range = selection.getRangeAt(0).cloneRange();
  const startLine = lineElementFromNode(range.startContainer);
  const endLine = lineElementFromNode(range.endContainer);
  const startContent = contentElementFromNode(range.startContainer);
  const endContent = contentElementFromNode(range.endContainer);
  if (!startLine || !endLine || !startContent || !endContent) return null;

  return { selection, range, startLine, endLine, startContent, endContent };
}

function textOffsetWithinElement(element, container, offset) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.setEnd(container, offset);
  return range.toString().length;
}

function selectionOffsets(rangeInfo) {
  const startBaseOffset = Number(rangeInfo.startContent.dataset.contentStart || rangeInfo.startLine.dataset.contentStart);
  const endBaseOffset = Number(rangeInfo.endContent.dataset.contentStart || rangeInfo.endLine.dataset.contentStart);
  const startOffset = startBaseOffset + textOffsetWithinElement(rangeInfo.startContent, rangeInfo.range.startContainer, rangeInfo.range.startOffset);
  const endOffset = endBaseOffset + textOffsetWithinElement(rangeInfo.endContent, rangeInfo.range.endContainer, rangeInfo.range.endOffset);
  const rawQuote = rangeInfo.selection.toString();
  const leadingTrim = rawQuote.length - rawQuote.replace(/^\s+/, "").length;
  const trailingTrim = rawQuote.length - rawQuote.replace(/\s+$/, "").length;

  return {
    quote: rawQuote.trim(),
    startOffset: startOffset + leadingTrim,
    endOffset: Math.max(startOffset + leadingTrim, endOffset - trailingTrim),
  };
}

function contextForOffsets(startOffset, endOffset, contextLength = 160) {
  const markdown = state.document.markdown;
  return {
    prefix: markdown.slice(Math.max(0, startOffset - contextLength), startOffset),
    suffix: markdown.slice(endOffset, Math.min(markdown.length, endOffset + contextLength)),
    contextLength,
  };
}

function captureSelection() {
  const rangeInfo = selectedRange();
  if (!rangeInfo) {
    if (state.selected) cancelSelection();
    return;
  }

  const offsets = selectionOffsets(rangeInfo);
  const quote = offsets.quote;
  if (!quote) {
    if (state.selected) cancelSelection();
    return;
  }

  const anchor = lineFromNode(rangeInfo.range.startContainer);
  const focus = lineFromNode(rangeInfo.range.endContainer);
  const lines = [anchor, focus].filter(Number.isInteger).sort((a, b) => a - b);

  state.selected = {
    quote,
    startLine: lines[0] || null,
    endLine: lines[1] || lines[0] || null,
    startOffset: offsets.startOffset,
    endOffset: offsets.endOffset,
    ...contextForOffsets(offsets.startOffset, offsets.endOffset),
  };

  elements.selectionCard.classList.remove("is-empty");
  elements.selectedQuote.textContent = quotePreview(quote);
  elements.selectedQuote.title = quote;
  elements.commentInput.value = "";
  renderMarkdown(state.document.markdown);
  elements.commentInput.focus();
}

async function saveComment() {
  if (!state.selected) return;
  const comment = elements.commentInput.value.trim();
  if (!comment) {
    elements.saveState.textContent = "Bitte erst einen Kommentar schreiben.";
    return;
  }

  elements.saveButton.disabled = true;
  elements.saveState.textContent = "Speichere...";
  try {
    const result = await api("/api/comments", {
      method: "POST",
      body: JSON.stringify({ ...state.selected, comment }),
    });
    state.document.feedback = result.feedback;
    state.selected = null;
    elements.selectionCard.classList.add("is-empty");
    elements.selectedQuote.textContent = "";
    elements.selectedQuote.removeAttribute("title");
    elements.commentInput.value = "";
    elements.saveState.textContent = "Gespeichert.";
    renderMarkdown(state.document.markdown);
    renderChangeLog();
    renderComments();
  } catch (error) {
    elements.saveState.textContent = error.message;
  } finally {
    elements.saveButton.disabled = false;
  }
}

function cancelSelection() {
  state.selected = null;
  elements.selectionCard.classList.add("is-empty");
  elements.selectedQuote.textContent = "";
  elements.selectedQuote.removeAttribute("title");
  elements.commentInput.value = "";
  elements.saveState.textContent = "";
  window.getSelection()?.removeAllRanges();
  renderMarkdown(state.document.markdown);
}

async function setStatus(id, status) {
  const body = { status };

  const result = await api(`/api/comments/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (status === "approved") state.visibleApprovedIds.delete(id);
  state.document.feedback = result.feedback;
  renderMarkdown(state.document.markdown);
  renderChangeLog();
  renderComments();
  elements.saveState.textContent = `Status geaendert: ${body.status}`;
}

async function steerComment(id, note) {
  const text = note.trim();
  if (!text) return;
  const result = await api(`/api/comments/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "commented", followUp: text }),
  });
  state.document.feedback = result.feedback;
  renderMarkdown(state.document.markdown);
  renderChangeLog();
  renderComments();
  elements.saveState.textContent = "Steering gespeichert.";
}

function renderComments() {
  const comments = [...(state.document?.feedback?.comments || [])].sort((a, b) => commentPosition(a) - commentPosition(b));
  const open = comments.filter((comment) => commentStatus(comment) === "commented");
  const edited = comments.filter((comment) => commentStatus(comment) === "edited");
  const approved = comments.filter((comment) => commentStatus(comment) === "approved");
  elements.count.textContent = String(comments.length);
  if (!comments.length) {
    elements.comments.innerHTML = '<p class="save-state">Noch kein Feedback.</p>';
    return;
  }

  elements.comments.innerHTML = [
    renderCommentGroup("Kommentiert", open, true),
    renderCommentGroup("Redigiert", edited, true),
    renderCommentGroup("Abgenommen", approved, false),
  ].join("");
}

function commentPosition(comment) {
  const currentQuote = commentStatus(comment) === "edited" || commentStatus(comment) === "approved"
    ? comment.applied?.newQuote || comment.quote
    : comment.quote;
  if (currentQuote) {
    const found = state.document.markdown.indexOf(currentQuote);
    if (found >= 0) return found;
  }
  if (Number.isInteger(comment.startOffset)) return comment.startOffset;
  if (Number.isInteger(comment.applied?.newStartOffset)) return comment.applied.newStartOffset;
  if (Number.isInteger(comment.startLine)) return comment.startLine * 1_000_000;
  if (Number.isInteger(comment.applied?.newStartLine)) return comment.applied.newStartLine * 1_000_000;
  return Number.MAX_SAFE_INTEGER;
}

function renderCommentGroup(label, comments, expanded) {
  if (!comments.length) return "";
  return `
    <details class="comment-group" ${expanded ? "open" : ""}>
      <summary>${escapeHtml(label)} <span>${comments.length}</span></summary>
      <div class="comment-group-items">
        ${comments.map(renderCommentCard).join("")}
      </div>
    </details>
  `;
}

function renderCommentCard(comment) {
  const status = commentStatus(comment);
  const statusClass = status === "approved" ? "is-resolved" : status === "edited" ? "is-addressed" : "is-open";
  const markerClass = status === "approved" && state.visibleApprovedIds.has(comment.id) ? "is-marker-visible" : "";
  const actionButtons = status === "edited"
    ? `
        <button class="icon-button status-button" type="button" data-status="approved" title="Abnehmen" aria-label="Abnehmen">${icons.check}</button>
        <button class="icon-button status-button" type="button" data-steer-toggle title="Steer" aria-label="Steer">${icons.steer}</button>
      `
    : "";
  return `
    <article class="comment-card ${statusClass} ${markerClass}" data-comment-id="${escapeHtml(comment.id)}">
      <div class="comment-meta">
        <span>${escapeHtml(statusLabel(status))} · Zeile ${comment.startLine || "?"}${comment.endLine && comment.endLine !== comment.startLine ? `-${comment.endLine}` : ""}</span>
        <span>${new Date(comment.createdAt).toLocaleString("de-DE")}</span>
      </div>
      <blockquote class="comment-quote" title="${escapeHtml(comment.quote)}"><span>Kommentarstelle:</span> ${escapeHtml(quotePreview(comment.quote))}</blockquote>
      <div class="issue-thread">${renderIssueThread(comment)}</div>
      ${actionButtons ? `<div class="comment-actions">
        ${actionButtons}
      </div>` : ""}
      ${status === "edited" ? `
        <form class="steer-form" hidden>
          <textarea rows="4" placeholder="Was soll beim nächsten Redigieren anders werden?"></textarea>
          <div class="steer-actions">
            <button type="submit">Steer speichern</button>
            <button type="button" data-steer-cancel>Abbrechen</button>
          </div>
        </form>
      ` : ""}
    </article>
  `;
}

function renderIssueThread(comment) {
  const counters = { redaction: 0, steer: 0 };
  return issueThread(comment).map((entry) => {
    const type = entry.type === "redaction" ? "is-agent" : "is-human";
    const label = threadLabel(entry, counters);
    const timestamp = entry.createdAt ? ` · ${new Date(entry.createdAt).toLocaleString("de-DE")}` : "";
    return `
      <div class="thread-item ${type}">
        <p class="thread-meta">${escapeHtml(label)}${escapeHtml(timestamp)}</p>
        <p>${escapeHtml(entry.body || "")}</p>
      </div>
    `;
  }).join("");
}

function issueThread(comment) {
  if (Array.isArray(comment.thread) && comment.thread.length) return comment.thread;
  const thread = [];
  if (comment.comment) {
    thread.push({ type: "comment", createdAt: comment.createdAt, body: comment.comment });
  }
  if (comment.resolution) {
    thread.push({ type: "redaction", createdAt: comment.updatedAt, body: comment.resolution });
  }
  for (const followUp of comment.followUps || []) {
    thread.push({ type: "steer", createdAt: followUp.createdAt, body: followUp.comment });
  }
  return thread;
}

function threadLabel(entry, counters) {
  if (entry.type === "redaction") {
    counters.redaction += 1;
    const count = counters.redaction;
    return count > 1 ? `Redaktion ${count}` : "Redaktion";
  }
  if (entry.type === "steer") {
    counters.steer += 1;
    const count = counters.steer;
    return `Steer ${count}`;
  }
  return "Initialer Kommentar";
}

function commentStatus(comment) {
  if (comment.status === "open") return "commented";
  if (comment.status === "addressed") return "edited";
  if (comment.status === "resolved" || comment.status === "accepted") return "approved";
  if (comment.status === "rejected" || comment.status === "discarded") return "commented";
  if (comment.status === "commented" && comment.applied?.newQuote && !comment.followUps?.length) return "edited";
  return comment.status || "commented";
}

function statusLabel(status) {
  return {
    commented: "kommentiert",
    edited: "redigiert",
    approved: "abgenommen",
  }[status] || status;
}

function scrollToComment(id) {
  if (!id || id === "pending") return;
  const card = elements.comments.querySelector(`[data-comment-id="${CSS.escape(id)}"]`);
  if (!card) return;
  scrollWithin(elements.feedbackPanel, card);
  pulse(card);
}

function scrollToMarker(id, preferResolution = false) {
  if (!id) return;
  const marks = [...elements.markdown.querySelectorAll("mark[data-comment-ids]")];
  const matching = marks.filter((mark) => mark.dataset.commentIds.split(/\s+/).includes(id));
  const preferred = matching.find((mark) => preferResolution ? mark.classList.contains("is-resolution") : !mark.classList.contains("is-resolution"));
  const target = preferred || matching[0];
  if (!target) return;
  scrollWithin(elements.documentPanel, target);
  pulse(target);
}

function toggleApprovedMarker(id) {
  if (state.visibleApprovedIds.has(id)) {
    state.visibleApprovedIds.delete(id);
    renderMarkdown(state.document.markdown);
    renderComments();
    return;
  }

  state.visibleApprovedIds.add(id);
  renderMarkdown(state.document.markdown);
  renderComments();
  scrollToMarker(id, true);
}

function scrollWithin(container, target) {
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const targetCenter = targetRect.top - containerRect.top + container.scrollTop + targetRect.height / 2;
  const nextTop = Math.max(0, targetCenter - container.clientHeight / 2);
  container.scrollTo({ top: nextTop, behavior: "smooth" });
}

function pulse(element) {
  element.classList.remove("is-focused");
  void element.offsetWidth;
  element.classList.add("is-focused");
  window.setTimeout(() => element.classList.remove("is-focused"), 1400);
}

function renderChangeLog() {
  if (!elements.changeLog || !elements.changeCount) return;
  const changes = [...(state.document?.feedback?.changeLog || [])].reverse();
  elements.changeCount.textContent = String(changes.length);
  if (!changes.length) {
    elements.changeLog.innerHTML = '<p class="save-state">Noch keine dokumentierten Änderungen.</p>';
    return;
  }

  elements.changeLog.innerHTML = changes.map((change) => `
    <article class="change-card">
      <div class="comment-meta">
        <span>${escapeHtml(change.createdBy || "agent")}</span>
        <span>${change.createdAt ? new Date(change.createdAt).toLocaleString("de-DE") : ""}</span>
      </div>
      <p class="comment-text">${escapeHtml(change.summary || "")}</p>
      ${Array.isArray(change.commentIds) && change.commentIds.length ? `<p class="change-links">Kommentare: ${escapeHtml(change.commentIds.join(", "))}</p>` : ""}
    </article>
  `).join("");
}

elements.markdown.addEventListener("mouseup", captureSelection);
elements.markdown.addEventListener("keyup", captureSelection);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.selected) {
    event.preventDefault();
    cancelSelection();
  }
});
elements.saveButton.addEventListener("click", saveComment);
elements.cancelSelection.innerHTML = icons.x;
elements.cancelSelection.addEventListener("click", cancelSelection);
elements.reload.innerHTML = icons.rotateCw;
elements.reload.addEventListener("click", loadDocument);
elements.viewButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const nextMode = button.dataset.viewMode;
    if (state.viewMode === "edit" && nextMode !== "edit") {
      await saveEditorAndSwitch(nextMode);
      return;
    }
    state.viewMode = nextMode;
    elements.viewButtons.forEach((item) => item.classList.toggle("is-active", item.dataset.viewMode === nextMode));
    renderMarkdown(state.document.markdown);
  });
});
elements.saveEditor.addEventListener("click", () => saveEditorAndSwitch("source"));
elements.cancelEditor.addEventListener("click", cancelEditor);
elements.markdown.addEventListener("click", (event) => {
  const mark = event.target.closest("mark[data-comment-ids]");
  if (!mark) return;
  const id = mark.dataset.commentIds.split(/\s+/).find(Boolean);
  scrollToComment(id);
});
elements.comments.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-status]");
  const card = event.target.closest("[data-comment-id]");
  if (!card) return;
  if (button) {
    setStatus(card.dataset.commentId, button.dataset.status);
    return;
  }
  const steerToggle = event.target.closest("[data-steer-toggle]");
  if (steerToggle) {
    const form = card.querySelector(".steer-form");
    form.hidden = !form.hidden;
    if (!form.hidden) form.querySelector("textarea").focus();
    return;
  }
  const steerCancel = event.target.closest("[data-steer-cancel]");
  if (steerCancel) {
    card.querySelector(".steer-form").hidden = true;
    return;
  }
  if (event.target.closest("textarea, form")) return;
  const comment = state.document.feedback.comments.find((item) => item.id === card.dataset.commentId);
  if (commentStatus(comment) === "approved") {
    toggleApprovedMarker(card.dataset.commentId);
    return;
  }
  scrollToMarker(card.dataset.commentId, card.classList.contains("is-resolved"));
});

elements.comments.addEventListener("submit", (event) => {
  const form = event.target.closest(".steer-form");
  if (!form) return;
  event.preventDefault();
  const card = form.closest("[data-comment-id]");
  steerComment(card.dataset.commentId, form.querySelector("textarea").value);
});

loadDocument().catch((error) => {
  elements.fileLabel.textContent = error.message;
});

window.setInterval(hotReloadTick, 1500);
