;;; k-agenda-model.el --- Org data model for k-agenda -*- lexical-binding: t; -*-

;; This file has no network dependency by design: it must be loadable and
;; testable headless (see k-agenda-model-test.el), independent of
;; k-agenda-server.el / k-agenda-ws.el.

;;; Code:

(require 'org)
(require 'cl-lib)

(defvar k-agenda-references-dir "~/Documents/Org/organizer/references/"
  "Real defcustom lives in k-agenda.el (loaded after this file in the full
package, per the require chain in k-agenda.el/k-agenda-ws.el); this forward
declaration keeps k-agenda-model.el loadable and testable headless, with
the same default, per this file's own header comment.")

(defun k-agenda-model-agenda-files ()
  "Return `org-agenda-files' as absolute, expanded paths."
  (mapcar #'expand-file-name (org-agenda-files t)))

(defun k-agenda-model--raw-agenda-files ()
  "The literal `org-agenda-files' value, before Org expands any directory
entries into their individual files. Needed to tell which files came
from a directory entry -- `(org-agenda-files t)' flattens that away."
  (if (functionp org-agenda-files) (funcall org-agenda-files) org-agenda-files))

(defun k-agenda-model-project-files ()
  "Absolute paths of every file inside a directory entry of
`org-agenda-files' (non-recursive, matching `org-agenda-file-regexp' --
the same rule Org itself uses to expand a directory entry).

These, and only these, are \"project\" files: one project per file. A
plain file entry in `org-agenda-files' (inbox.org, work.org, ...) never
counts, even though its headings are still scanned for tasks -- see
`k-agenda-model--project-for-entry'."
  (let (result)
    (dolist (entry (k-agenda-model--raw-agenda-files))
      (let ((expanded (expand-file-name entry)))
        (when (file-directory-p expanded)
          (dolist (f (directory-files expanded t org-agenda-file-regexp))
            (push f result)))))
    (nreverse result)))

(defun k-agenda-model--file-name-equal-p (a b)
  "Compare file paths A and B for equality, case-insensitively when the
underlying file system is (e.g. Windows, default macOS). Without this,
a path that resolves with different drive-letter/segment casing
depending on how it was opened (`c:/Users/...' from the minibuffer vs
`C:/Users/...' as written in `org-agenda-files') would silently fail to
match, even though the file system itself treats them as identical."
  (if (file-name-case-insensitive-p a)
      (eq t (compare-strings a nil nil b nil nil t))
    (string-equal a b)))

(defun k-agenda-model--project-file-p (file)
  "Non-nil if FILE is one of `k-agenda-model-project-files'."
  (let ((expanded (expand-file-name file)))
    (cl-some (lambda (f) (k-agenda-model--file-name-equal-p expanded f))
             (k-agenda-model-project-files))))

(defun k-agenda-model--iso8601 (time)
  "Format TIME (an Emacs time value or nil) as an ISO 8601 string, or nil."
  (when time
    (format-time-string "%Y-%m-%dT%H:%M:%S%:z" time)))

(defun k-agenda-model--buffer-title ()
  "This buffer's `#+TITLE:' value, or nil if it has none.

Defensively strips a trailing Org tag group (`  :foo:bar:') if present --
`#+TITLE:' is a plain keyword line, not a heading, so tags there are
never meaningful Org syntax, only ever a stray copy-paste (e.g. from
`org-set-tags-command' firing on the wrong line, or a heading's
tag-alignment whitespace pattern typed straight into the title)."
  (let ((title (cadr (assoc "TITLE" (org-collect-keywords '("TITLE"))))))
    (when title
      (replace-regexp-in-string "[ \t]+:[[:alnum:]_@#%:]+:[ \t]*\\'" "" title))))

(defun k-agenda-model--project-for-entry ()
  "Return the project name for the entry at point, or nil if the current
file isn't a project file (see `k-agenda-model-project-files').

Non-project files (inbox.org, work.org, learning.org, ...) never
contribute a project -- their headings are just untethered tasks, not
project anchors, however deeply nested. A project file's `#+TITLE:' wins
if present (so a file can have a human-friendly project name distinct
from its heading text); otherwise the level-1 ancestor heading (or the
entry's own title, if it is already level 1); a project file with only
sub-level headings and no title falls back to its capitalized basename."
  (when (k-agenda-model--project-file-p (buffer-file-name))
    (or (k-agenda-model--buffer-title)
        (let ((olp (org-get-outline-path)))
          (if olp
              (car olp)
            (if (= (org-outline-level) 1)
                (org-get-heading t t t t)
              (k-agenda-model--file-fallback-project)))))))

(defun k-agenda-model--file-fallback-project ()
  "Capitalized basename (sans extension) of the current buffer's file."
  (let ((base (file-name-base (buffer-file-name))))
    (concat (upcase (substring base 0 1)) (substring base 1))))

(defun k-agenda-model--entry-id ()
  "Stable-ish id for the entry at point: its real `:ID:' property if the
user has one, else a hash of file+outline-path+heading-text. Keyed on
outline position rather than raw character offset so it survives an
unrelated edit anywhere else in the file -- a point-based hash broke as
soon as anything earlier in the buffer shifted, which made
`k-agenda-model-change-state' fail with a spurious \"couldn't be found\"
error on any heading without a real `:ID:', the moment anything else in
the file changed between snapshot and drop.

The file component is case-folded on a case-insensitive file system (see
`k-agenda-model--file-name-equal-p') -- `buffer-file-name' disagrees on
drive-letter case between a buffer opened via `find-file-noselect' (which
downcases it on w32) and one read straight off disk with `buffer-file-name'
let-bound to whatever case `org-agenda-files' happened to be written in
(see `k-agenda-model--with-file-parsed'). Without folding, a snapshot
minted before the file's buffer existed would hash every heading in that
file to an id `k-agenda-model-change-state' -- which always resolves its
files through a real visited buffer -- could never match, surfacing as a
permanent \"couldn't be found\" on that file's cards.

Still NOT stable across a change to this heading's own title or its
position in the outline -- acceptable for a React list key and for the
short-lived list-then-click-for-detail flow (`k-agenda-model-body-for-id'
re-resolves this fresh from the current buffer state on every request,
so a stale id from an old snapshot just fails to match rather than
resolving to the wrong heading)."
  (or (org-entry-get (point) "ID")
      (let ((file (buffer-file-name)))
        (secure-hash 'sha1 (format "%s::%s::%s"
                                    (if (file-name-case-insensitive-p file) (downcase file) file)
                                    (mapconcat #'identity (org-get-outline-path) "\x1f")
                                    (substring-no-properties (org-get-heading t t t t)))))))

(defun k-agenda-model--entry-plist ()
  "Build the data plist for the Org entry at point.

Must be called with point on a heading, in a buffer visiting one of the
files returned by `k-agenda-model--agenda-files'."
  (list :id (k-agenda-model--entry-id)
        :title (substring-no-properties (org-get-heading t t t t))
        :todo-state (org-get-todo-state)
        :priority (org-entry-get (point) "PRIORITY")
        :tags (org-get-tags nil t)
        :scheduled (k-agenda-model--iso8601 (org-get-scheduled-time (point)))
        :deadline (k-agenda-model--iso8601 (org-get-deadline-time (point)))
        :closed (let ((closed (org-entry-get (point) "CLOSED")))
                  (when closed
                    (k-agenda-model--iso8601
                     (org-time-string-to-time closed))))
        :project (k-agenda-model--project-for-entry)
        :file (file-name-nondirectory (buffer-file-name))
        :level (org-outline-level)
        :olp (org-get-outline-path)
        :capture-type (org-entry-get (point) "CAPTURE_TYPE")
        :effort (org-entry-get (point) "Effort")))

(defun k-agenda-model--with-agenda-file-parsed (file thunk)
  "Call THUNK with FILE's Org text current and widened, returning its value.

Agenda files, unlike reference files, are the user's live working files,
so this picks a source per file rather than always reading disk:

- FILE already has a buffer: use it. It may hold unsaved edits, and the
  web view must reflect them -- `org-after-todo-state-change-hook' can
  fire a broadcast while a change is still unsaved.
- FILE has no buffer: it cannot have unsaved edits, so disk IS the
  current state, and `k-agenda-model--with-file-parsed' reads it without
  `find-file-noselect'. That path was ~70% of the first snapshot's cost,
  and left every agenda file open in the user's buffer list as a side
  effect of merely loading the web UI.

Ids stay consistent across both branches (see
`k-agenda-model--entry-id', which hashes file+point): a file with no
buffer parses byte-identical content whichever way it's read.

READ-ONLY callers only. Anything that writes must go through a genuinely
visited buffer -- see `k-agenda-model-change-state', where `save-buffer'
in a temp buffer with `buffer-file-name' bound would write the parse
scratch straight over the user's file."
  (let ((buffer (get-file-buffer file)))
    (if buffer
        (with-current-buffer buffer
          ;; `widen' matches what `org-map-entries' does for a file scope;
          ;; without it a narrowed buffer would hide most of its entries.
          ;; `save-excursion' keeps the user's point where they left it --
          ;; this is their live buffer, not ours to move.
          (save-excursion
            (save-restriction
              (widen)
              (funcall thunk))))
      (k-agenda-model--with-file-parsed file thunk))))

(defun k-agenda-model-collect-entries ()
  "Walk every heading in `org-agenda-files' and return a list of entry plists.

Every heading is visited, including ones with no TODO keyword (project
anchors, prose headings) -- callers that only care about tasks should
filter on `:todo-state' being non-nil."
  (cl-loop for file in (k-agenda-model-agenda-files)
           append (k-agenda-model--with-agenda-file-parsed
                   file
                   (lambda () (org-map-entries #'k-agenda-model--entry-plist)))))

(defun k-agenda-model--entry-body ()
  "Free-text body of the entry at point: everything after the planning
line/property drawer/logbook, stopping before the first child heading
(or the next sibling heading, or end of buffer, if there are none)."
  (save-excursion
    (org-back-to-heading t)
    (org-end-of-meta-data t)
    ;; An entry with no body of its own leaves point ON the next heading
    ;; here. Falling through would then measure from that heading to the
    ;; one AFTER it (`outline-next-heading' always moves at least one
    ;; heading forward), handing back the whole first child -- heading
    ;; line and all -- as this entry's body.
    (if (org-at-heading-p)
        ""
      (let* ((start (point))
             (end (save-excursion (or (outline-next-heading) (point-max))))
             (text (buffer-substring-no-properties start end)))
        ;; `org-end-of-meta-data' expects the planning line (DEADLINE/
        ;; SCHEDULED/CLOSED) immediately after the heading, before any
        ;; drawer -- some real files here have the property drawer first
        ;; and the planning line after it, which it doesn't skip. Strip
        ;; any leftover leading planning line(s) regardless of order.
        (setq text (replace-regexp-in-string
                    "\\`\\(?:[ \t]*\\(?:DEADLINE\\|SCHEDULED\\|CLOSED\\):.*\n?\\)+" "" text))
        (string-trim text)))))

(defun k-agenda-model-body-for-id (id)
  "Return the free-text body of the entry whose id (see
`k-agenda-model--entry-id') matches ID, re-resolved fresh against the
current state of `org-agenda-files', or nil if no entry matches (a
non-existent id, or a hash-based id gone stale after an intervening
edit -- see `k-agenda-model--entry-id').

Reads each file the same way `k-agenda-model-collect-entries' does (see
`k-agenda-model--with-agenda-file-parsed') -- it must, since the ids it
resolves are the ones that snapshot minted: a file read live there and
from disk here could hash the same heading to two different ids, and
every lookup for an unsaved edit would miss."
  (catch 'k-agenda-model-body-found
    (dolist (file (k-agenda-model-agenda-files))
      (k-agenda-model--with-agenda-file-parsed
       file
       (lambda ()
         (org-map-entries
          (lambda ()
            (when (equal (k-agenda-model--entry-id) id)
              (throw 'k-agenda-model-body-found (k-agenda-model--entry-body))))))))
    nil))

(defun k-agenda-model-change-state (id from-state new-state)
  "Change the TODO state of the entry matching ID from FROM-STATE to
NEW-STATE via `org-todo' (so logging/timestamps/faces behave exactly as
`C-c C-t' would), then save the buffer immediately.

FROM-STATE is a staleness guard: ID is re-resolved fresh against the
current buffer, but if its CURRENT todo-state doesn't match FROM-STATE,
the write is refused rather than trusting a possibly-stale id from an
older snapshot -- someone may have changed it in Emacs already, or (far
rarer) a hash-based id may now resolve to a different heading after an
intervening edit shifted character positions (see
`k-agenda-model--entry-id').

Returns a plist:
  (:ok t)
  (:ok nil :reason \"stale\" :current-state STRING-OR-NIL)
  (:ok nil :reason \"not-found\")

`org-map-entries' visits every agenda file with `find-file-noselect',
which normally runs `hack-local-variables' -- and an unsafe file-local
value (e.g. an `org-columns-default-format' not yet marked safe) makes
Emacs QUERY interactively. There is no user at that prompt inside the
websocket handler, so the request hangs until the client times out.
Binding `enable-local-variables' to `:safe' applies known-safe locals
and silently skips unsafe ones instead of prompting -- the server never
blocks, and none of these locals affect a TODO-state write anyway."
  (let ((files (k-agenda-model-agenda-files))
        (enable-local-variables :safe))
    (or (catch 'k-agenda-model-change-state-done
          (org-map-entries
           (lambda ()
             (when (equal (k-agenda-model--entry-id) id)
               (let ((current (org-get-todo-state)))
                 (if (not (equal current from-state))
                     (throw 'k-agenda-model-change-state-done
                            (list :ok nil :reason "stale" :current-state current))
                   (org-todo new-state)
                   (save-buffer)
                   (throw 'k-agenda-model-change-state-done (list :ok t))))))
           nil files)
          nil)
        (list :ok nil :reason "not-found"))))

(defun k-agenda-model--project-buckets (entries)
  "Group ENTRIES by `:project', returning an alist of (name . entries).
Entries with a nil `:project' (anything outside a project file) are
skipped entirely -- they don't belong to any project, rather than
collecting into a bogus \"nil-named\" bucket."
  (let ((table (make-hash-table :test #'equal))
        (order nil))
    (dolist (entry entries)
      (let ((project (plist-get entry :project)))
        (when project
          (unless (gethash project table)
            (push project order))
          (push entry (gethash project table)))))
    (mapcar (lambda (name) (cons name (nreverse (gethash name table))))
            (nreverse order))))

(defun k-agenda-model-project-stats (entries)
  "Compute per-project task stats from ENTRIES.

Returns a list of plists: (:name :file :total :done :cancelled :percent).
Only entries with a non-nil `:todo-state' count toward totals -- a
project-anchor heading itself (no TODO keyword) does not count as a task
of its own project. CANCELLED tasks are excluded from both the numerator
and the denominator of `:percent': a cancelled task is removed scope, not
unfinished work."
  (let ((buckets (k-agenda-model--project-buckets entries)))
    (mapcar
     (lambda (bucket)
       (let* ((name (car bucket))
              (tasks (cl-remove-if-not (lambda (e) (plist-get e :todo-state))
                                       (cdr bucket)))
              (done (cl-count-if (lambda (e) (equal (plist-get e :todo-state) "DONE")) tasks))
              (cancelled (cl-count-if (lambda (e) (equal (plist-get e :todo-state) "CANCELLED")) tasks))
              (total (length tasks))
              (denom (- total cancelled))
              (percent (if (> denom 0) (round (* 100.0 (/ (float done) denom))) 0))
              (file (or (plist-get (car (cdr bucket)) :file)
                        (plist-get (car (last (cdr bucket))) :file))))
         (list :name name :file file :total total :done done
               :cancelled cancelled :percent percent)))
     buckets)))

(defun k-agenda-model-projects-sorted (entries)
  "Return every project's stats from ENTRIES, sorted by total task count descending."
  (let ((stats (k-agenda-model-project-stats entries)))
    (cl-sort (copy-sequence stats) #'> :key (lambda (s) (plist-get s :total)))))

(defun k-agenda-model-top-projects (entries &optional n)
  "Return the top N (default 5) project stats from ENTRIES, by total task count."
  (let ((sorted (k-agenda-model-projects-sorted entries)))
    (cl-subseq sorted 0 (min (or n 5) (length sorted)))))

(defun k-agenda-model-total-projects (entries)
  "Return the number of distinct project buckets in ENTRIES."
  (length (k-agenda-model--project-buckets entries)))

(defun k-agenda-model-state-counts (entries)
  "Return an alist of (TODO-KEYWORD . count) across ENTRIES with a TODO state."
  (let ((table (make-hash-table :test #'equal)))
    (dolist (entry entries)
      (let ((state (plist-get entry :todo-state)))
        (when state
          (puthash state (1+ (gethash state table 0)) table))))
    (let (result)
      (maphash (lambda (k v) (push (cons k v) result)) table)
      result)))

(defun k-agenda-model-reference-files ()
  "Absolute paths of every `.org' file directly inside
`k-agenda-references-dir' (non-recursive, matching `org-agenda-file-regexp'
-- the same rule Org itself uses to expand a directory entry).

Entirely independent of `org-agenda-files': these files are never passed
to `k-agenda-model-collect-entries', so a reference doc's headings can
never leak into `tasks'/`projects'/`stats'.

If `k-agenda-references-dir' doesn't resolve to a real directory (e.g.
`~' expanding somewhere unexpected on Windows, where `HOME' isn't
always set the way it is on Mac/Linux), this warns naming the resolved
path instead of silently returning an empty tree -- an empty References
tab and a misconfigured directory look identical otherwise."
  (let ((dir (expand-file-name k-agenda-references-dir)))
    (if (file-directory-p dir)
        (directory-files dir t org-agenda-file-regexp)
      (display-warning
       'k-agenda
       (format "k-agenda-references-dir resolved to %S, which is not a directory -- References tab will be empty. Check the value of k-agenda-references-dir (currently %S)."
               dir k-agenda-references-dir))
      nil)))

(defun k-agenda-model--with-file-parsed (file thunk)
  "Call THUNK with FILE's text in a current temp buffer in `org-mode', and
return its value. FILE is never visited: it's read with
`insert-file-contents' into a throwaway buffer, and `org-mode' is
activated with `delay-mode-hooks'.

This deliberately bypasses `find-file-noselect', which was ~97% of the
References tree-build cost -- with 52 files it dominated a >20s stall on
first opening the tab. `find-file-noselect' runs the whole interactive
visit-a-file path once per file: every `find-file-hook' (`vc-refresh-state'
spawning a git subprocess, `undo-tree' loading a history file off disk,
recentf, projectile...), every `org-mode-hook', plus font-lock. None of it
means anything for a buffer we parse and immediately discard. Reading the
same 52 files costs 0.03s; visiting them cost 4.5s+ (far more in a GUI
session, where font-lock also fontifies all 52).

`buffer-file-name' is bound because the parse helpers below legitimately
depend on it: `k-agenda-model--entry-id' hashes it, and
`k-agenda-model--file-fallback-project' derives a title from it. Binding
it rather than setting it keeps the buffer unvisited, so no lock file,
save prompt, or `buffer-list' entry outlives the call.

Callers must parse the current buffer (`org-map-entries' with a nil
SCOPE) -- passing a file SCOPE would send Org back through
`org-get-agenda-file-buffer' and re-open the very file we just read."
  (with-temp-buffer
    (insert-file-contents file)
    (let ((buffer-file-name file)
          (org-inhibit-startup t))
      (delay-mode-hooks (org-mode))
      (funcall thunk))))

(defun k-agenda-model--nest-headings (flat)
  "Nest FLAT (a list of heading plists with :level, in document order, as
collected by `k-agenda-model--reference-parse') into a tree: each
node gains a `:children' list of nested nodes. Handles arbitrary level
jumps (e.g. a level-1 heading directly followed by a level-3 one) the
same way Org's own outline commands do -- a heading attaches under the
nearest preceding heading whose level is strictly less than its own, or
becomes a top-level root if none exists."
  (let (roots stack)
    (dolist (h flat)
      (let ((node (append h (list :children nil))))
        (while (and stack (>= (plist-get (car stack) :level) (plist-get node :level)))
          (setq stack (cdr stack)))
        (if stack
            (let ((parent (car stack)))
              (plist-put parent :children (append (plist-get parent :children) (list node))))
          (push node roots))
        (push node stack)))
    (nreverse roots)))

(defvar k-agenda-model--reference-cache (make-hash-table :test #'equal)
  "Parsed reference files, keyed by absolute path.

Each value is a plist (:stamp :node :text): `:stamp' is the file's
(MTIME . SIZE) as of the parse, `:node' its tree root (see
`k-agenda-model-reference-tree'), `:text' its raw Org source (the corpus
`k-agenda-model-reference-search' scans).

An entry is reused until FILE's mtime or size changes on disk, so the
common rebuild -- an `after-save-hook' broadcast touching one file (see
`k-agenda-ws--on-scoped-edit') -- re-parses only that file instead of all
of them. No explicit invalidation call is needed anywhere: the stamp
check IS the invalidation, which keeps this correct even when a file
changes behind Emacs' back (a `git pull', an edit in another editor).")

(defun k-agenda-model-reference-cache-clear ()
  "Drop every cached reference parse, forcing a full re-parse next call.
Nothing in normal operation needs this -- entries expire off their own
file stamp (see `k-agenda-model--reference-cache'). It exists for tests,
and as a manual escape hatch."
  (interactive)
  (clrhash k-agenda-model--reference-cache))

(defun k-agenda-model--reference-file-stamp (file)
  "FILE's (MTIME . SIZE), or nil if it can't be stat'd.
Size is carried alongside mtime as cheap insurance: it costs nothing (the
same `file-attributes' call supplies both) and catches an edit that lands
inside the mtime resolution of a coarse filesystem."
  (let ((attrs (file-attributes file)))
    (when attrs
      (cons (file-attribute-modification-time attrs)
            (file-attribute-size attrs)))))

(defun k-agenda-model--reference-stamp-equal-p (a b)
  "Non-nil when stamps A and B (see `k-agenda-model--reference-file-stamp')
denote the same mtime and size. Compares the time part with
`time-equal-p' rather than `equal' -- Emacs has several interchangeable
timestamp representations, and `equal' would report a spurious change
when the same instant comes back in a different form."
  (and a b
       (time-equal-p (car a) (car b))
       (= (cdr a) (cdr b))))

(defun k-agenda-model--reference-parse (file)
  "Parse FILE into a `k-agenda-model--reference-cache' value.

Returns (:node :text :sections). `:sections' is the per-heading search
index -- (:id :title :body) for every heading -- and is deliberately kept
out of `:node': `:node' is what gets encoded and sent to the browser as
the tree, and folding a heading's body into it would turn a ~50KB tree
payload into the whole 0.66MB corpus on every tree request. Both come out
of a single `org-map-entries' pass, since walking the file twice to
collect the same headings would be pure waste."
  (k-agenda-model--with-file-parsed
   file
   (lambda ()
     (let* ((flat (org-map-entries
                   (lambda ()
                     (list :id (k-agenda-model--entry-id)
                           :title (substring-no-properties (org-get-heading t t t t))
                           :level (org-outline-level)
                           :tags (org-get-tags nil t)
                           :body (k-agenda-model--entry-body)))))
            (sections (mapcar (lambda (h)
                                (list :id (plist-get h :id)
                                      :title (plist-get h :title)
                                      :body (plist-get h :body)))
                              flat))
            ;; Strip :body before nesting -- `--nest-headings' builds the
            ;; client-facing node, which must stay body-free.
            (nodes (mapcar (lambda (h)
                             (list :id (plist-get h :id)
                                   :title (plist-get h :title)
                                   :level (plist-get h :level)
                                   :tags (plist-get h :tags)))
                           flat)))
       (list :node (list :id file
                         :title (or (k-agenda-model--buffer-title)
                                    (k-agenda-model--file-fallback-project))
                         :level 0
                         :tags nil
                         :children (k-agenda-model--nest-headings nodes))
             :text (buffer-substring-no-properties (point-min) (point-max))
             :sections sections)))))

(defun k-agenda-model--reference-entry (file)
  "Cached (:stamp :node :text) for FILE, re-parsing only if it changed."
  (let* ((stamp (k-agenda-model--reference-file-stamp file))
         (cached (gethash file k-agenda-model--reference-cache)))
    (if (and cached
             (k-agenda-model--reference-stamp-equal-p stamp (plist-get cached :stamp)))
        cached
      (let ((entry (append (list :stamp stamp) (k-agenda-model--reference-parse file))))
        (puthash file entry k-agenda-model--reference-cache)
        entry))))

(defun k-agenda-model--reference-cache-prune (files)
  "Forget cached entries whose file is no longer in FILES.
Without this a deleted or renamed reference doc would sit in the cache
for the rest of the session -- harmless for the tree (which only reads
entries for files it just listed) but not for
`k-agenda-model-reference-search', which would go on returning hits from
a file that no longer exists."
  (let ((live (make-hash-table :test #'equal)))
    (dolist (f files) (puthash f t live))
    (maphash (lambda (file _entry)
               (unless (gethash file live)
                 (remhash file k-agenda-model--reference-cache)))
             k-agenda-model--reference-cache)))

(defun k-agenda-model--reference-entries ()
  "Cache entries for every current reference file, in `directory-files' order.
Parses whatever changed since the last call and prunes whatever vanished;
this is the single point where the cache is brought up to date with disk."
  (let ((files (k-agenda-model-reference-files)))
    (k-agenda-model--reference-cache-prune files)
    (mapcar #'k-agenda-model--reference-entry files)))

(defun k-agenda-model-reference-tree ()
  "Build the References tree: one root node per file in
`k-agenda-model-reference-files', each with `:children' nested by heading
level (see `k-agenda-model--nest-headings').

A root's `:id' is the file's absolute path -- already unique and stable,
no hash needed. Its `:title' is the file's `#+TITLE:' if present, else
its capitalized basename, matching the same fallback
`k-agenda-model--project-for-entry' uses for project files.

Served from `k-agenda-model--reference-cache', so this is near-free
unless a file actually changed."
  (mapcar (lambda (entry) (plist-get entry :node))
          (k-agenda-model--reference-entries)))

(defun k-agenda-model--prune-to-matches (nodes matched)
  "Copy NODES, keeping only nodes in MATCHED (a hash of matching ids) and
the ancestors that lead to them.

Ancestors are kept even when they don't match themselves -- a match on
`** Tensors' nested under a non-matching `* Block 1' must still render in
its real outline position, not float to the file root. Ancestors kept
purely as scaffolding are NOT flagged `:match', so the client can style
the actual hits distinctly from the path to them."
  (delq nil
        (mapcar
         (lambda (node)
           (let* ((kids (k-agenda-model--prune-to-matches
                          (plist-get node :children) matched))
                  (hit (gethash (plist-get node :id) matched)))
             (when (or hit kids)
               (list :id (plist-get node :id)
                     :title (plist-get node :title)
                     :level (plist-get node :level)
                     :tags (plist-get node :tags)
                     :match (and hit t)
                     :children kids))))
         nodes)))

(defun k-agenda-model-reference-search (query)
  "Search every reference file for QUERY; return matching tree roots.

QUERY is matched case-insensitively as a literal substring (not a regexp
-- users type prose, and a stray `*' or `(' from a real query string
would otherwise error or silently match the wrong thing). A blank QUERY
returns the full tree, which is what makes clearing the box restore the
unfiltered list.

Results are ranked in two tiers, per the References UI's contract: files
whose name or `#+TITLE:' matches come first, then files matching only on
content. Within a tier, `directory-files' order (alphabetical) is
preserved, so the list stays stable as the user types.

A root's `:children' is pruned to just the headings that matched and the
ancestors leading to them (see `k-agenda-model--prune-to-matches'), so
the client can render results expanded and land the user on the relevant
section. A file matching only by name reports no matching sections and so
comes back with no children -- there's nothing to expand to.

Scanning the whole 0.66MB corpus takes ~5ms, so there is deliberately no
inverted index, no BM25, and no FTS: at this size a linear scan over the
already-in-memory cache is faster than the machinery to avoid it."
  (let ((trimmed (string-trim (or query ""))))
    (if (string-empty-p trimmed)
        (k-agenda-model-reference-tree)
      (let ((needle (regexp-quote trimmed))
            (case-fold-search t)
            by-name by-content)
        (dolist (entry (k-agenda-model--reference-entries))
          (let* ((node (plist-get entry :node))
                 (file (plist-get node :id))
                 ;; Scanning the file's whole text first is a pre-filter for
                 ;; the per-section work below, not just a preamble check.
                 ;; Every section's title and body is a contiguous substring
                 ;; of this text (`k-agenda-model--entry-body' only strips
                 ;; from the front and trims), so text-hit nil PROVES no
                 ;; section can match -- letting the ~85% of files that don't
                 ;; match skip section scanning and tree pruning entirely.
                 ;; Doing this in one pass over `:text' rather than 1016
                 ;; passes over the sections took search from 39ms to ~7ms.
                 (text-hit (string-match-p needle (plist-get entry :text)))
                 ;; The basename is checked separately because it is NOT part
                 ;; of the text -- a file called `cartoon.org' matches
                 ;; "cartoon" even if the word never appears inside it.
                 (name-hit (or (string-match-p needle (or (plist-get node :title) ""))
                               (string-match-p needle (file-name-nondirectory file)))))
            (when (or name-hit text-hit)
              (let ((matched (make-hash-table :test #'equal)))
                (when text-hit
                  (dolist (section (plist-get entry :sections))
                    (when (or (string-match-p needle (or (plist-get section :title) ""))
                              (string-match-p needle (or (plist-get section :body) "")))
                      (puthash (plist-get section :id) t matched))))
                (let* ((kids (unless (zerop (hash-table-count matched))
                               (k-agenda-model--prune-to-matches
                                (plist-get node :children) matched)))
                       (root (list :id file
                                   :title (plist-get node :title)
                                   :level 0
                                   :tags nil
                                   :match (and name-hit t)
                                   :children kids)))
                  ;; A hit that belongs to no section (a doc's preamble, or
                  ;; its `#+TITLE:') still lists the file, just with nothing
                  ;; to expand to -- `kids' is nil there.
                  (if name-hit
                      (push root by-name)
                    (push root by-content)))))))
        (append (nreverse by-name) (nreverse by-content))))))

(defun k-agenda-model-reference-preamble (file)
  "Return FILE's free text before its first heading (or the whole file if
it has none), with any leading run of `#+KEYWORD:' in-buffer-settings
lines (TITLE, AUTHOR, STARTUP, ...) stripped, trimmed. This is a
reference tree's file-root node's body when clicked directly -- the
file's intro/notes-to-self text, analogous to `k-agenda-model--entry-body'
for a heading.

There's no equivalent of `org-end-of-meta-data' for a file-level preamble,
so a comment block below the keyword lines (as in the real study-plan
files) is left as-is; anything left over just renders as plain text
client-side (see web/src/lib/orgText.tsx)."
  (k-agenda-model--with-file-parsed
   file
   (lambda ()
     (save-excursion
       (goto-char (point-min))
       (let* ((end (or (save-excursion (outline-next-heading) (point))
                        (point-max)))
              (text (buffer-substring-no-properties (point-min) end)))
         (string-trim
          (replace-regexp-in-string "\\`\\(?:[ \t]*#\\+[a-zA-Z_]+:.*\n?\\)+" "" text)))))))

(defun k-agenda-model-reference-body-for-id (id file)
  "Return the free-text body for ID, which lives somewhere in FILE (one of
`k-agenda-model-reference-files').

FILE lets the caller skip scanning every reference file just to find
which one ID belongs to -- with 90+ of them, `org-map-entries' opening
and walking every single one on every heading click (the caller already
knows the file, from the tree it just rendered) was the app's next
biggest stall after the tree-build itself (see
`k-agenda-model-reference-tree').

ID may be FILE itself (a tree root node -- see
`k-agenda-model-reference-preamble') or a heading id within it (see
`k-agenda-model--entry-body'), re-resolved fresh each call exactly like
`k-agenda-model-body-for-id'. Returns nil if FILE isn't a known
reference file, or ID doesn't resolve within it."
  (let ((resolved (cl-find-if
                    (lambda (f) (k-agenda-model--file-name-equal-p (expand-file-name file) f))
                    (k-agenda-model-reference-files))))
    (when resolved
      (if (k-agenda-model--file-name-equal-p (expand-file-name id) resolved)
          (k-agenda-model-reference-preamble resolved)
        (k-agenda-model--with-file-parsed
         resolved
         (lambda ()
           (catch 'k-agenda-model-reference-body-found
             (org-map-entries
              (lambda ()
                (when (equal (k-agenda-model--entry-id) id)
                  (throw 'k-agenda-model-reference-body-found (k-agenda-model--entry-body)))))
             nil)))))))

(provide 'k-agenda-model)
;;; k-agenda-model.el ends here
