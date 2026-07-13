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
user has one, else a hash of file+point. The hash form is NOT stable
across edits that shift character positions earlier in the buffer --
acceptable for a React list key and for the short-lived
list-then-click-for-detail flow (`k-agenda-model-body-for-id'
re-resolves this fresh from the current buffer state on every request,
so a stale id from an old snapshot just fails to match rather than
resolving to the wrong heading)."
  (or (org-entry-get (point) "ID")
      (secure-hash 'sha1 (format "%s::%d" (buffer-file-name) (point)))))

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

(defun k-agenda-model-collect-entries ()
  "Walk every heading in `org-agenda-files' and return a list of entry plists.

Every heading is visited, including ones with no TODO keyword (project
anchors, prose headings) -- callers that only care about tasks should
filter on `:todo-state' being non-nil."
  (let ((files (k-agenda-model-agenda-files)))
    (org-map-entries #'k-agenda-model--entry-plist nil files)))

(defun k-agenda-model--entry-body ()
  "Free-text body of the entry at point: everything after the planning
line/property drawer/logbook, stopping before the first child heading
(or the next sibling heading, or end of buffer, if there are none)."
  (save-excursion
    (org-back-to-heading t)
    (org-end-of-meta-data t)
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
      (string-trim text))))

(defun k-agenda-model-body-for-id (id)
  "Return the free-text body of the entry whose id (see
`k-agenda-model--entry-id') matches ID, re-resolved fresh against the
current state of `org-agenda-files', or nil if no entry matches (a
non-existent id, or a hash-based id gone stale after an intervening
edit -- see `k-agenda-model--entry-id')."
  (let ((files (k-agenda-model-agenda-files)))
    (catch 'k-agenda-model-body-found
      (org-map-entries
       (lambda ()
         (when (equal (k-agenda-model--entry-id) id)
           (throw 'k-agenda-model-body-found (k-agenda-model--entry-body))))
       nil files)
      nil)))

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
  (:ok nil :reason \"not-found\")"
  (let ((files (k-agenda-model-agenda-files)))
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

(defun k-agenda-model--with-file-visited (file thunk)
  "Call THUNK with FILE's buffer current, then kill that buffer again if it
wasn't already open before this call. Used for reference files, which are
often opened purely to parse -- with the References dir holding upwards
of 90 files, leaving every one of them as a live buffer after a single
tree build would bloat the buffer list for the rest of the session."
  (let* ((already-open (get-file-buffer file))
         (buffer (find-file-noselect file)))
    (unwind-protect
        (with-current-buffer buffer (funcall thunk))
      (unless already-open (kill-buffer buffer)))))

(defun k-agenda-model--reference-flat-headings (file)
  "Flat list of heading plists (:id :title :level :tags) for FILE, in
document order, via `org-map-entries' scoped to just that one file."
  (org-map-entries
   (lambda ()
     (list :id (k-agenda-model--entry-id)
           :title (substring-no-properties (org-get-heading t t t t))
           :level (org-outline-level)
           :tags (org-get-tags nil t)))
   nil (list file)))

(defun k-agenda-model--nest-headings (flat)
  "Nest FLAT (a list of heading plists with :level, in document order, as
returned by `k-agenda-model--reference-flat-headings') into a tree: each
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

(defun k-agenda-model-reference-tree ()
  "Build the References tree: one root node per file in
`k-agenda-model-reference-files', each with `:children' nested by heading
level (see `k-agenda-model--nest-headings').

A root's `:id' is the file's absolute path -- already unique and stable,
no hash needed. Its `:title' is the file's `#+TITLE:' if present, else
its capitalized basename, matching the same fallback
`k-agenda-model--project-for-entry' uses for project files."
  (mapcar
   (lambda (file)
     (k-agenda-model--with-file-visited
      file
      (lambda ()
        (list :id file
              :title (or (k-agenda-model--buffer-title)
                         (k-agenda-model--file-fallback-project))
              :level 0
              :tags nil
              :children (k-agenda-model--nest-headings
                         (k-agenda-model--reference-flat-headings file))))))
   (k-agenda-model-reference-files)))

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
  (k-agenda-model--with-file-visited
   file
   (lambda ()
     (save-excursion
       (goto-char (point-min))
       (let* ((end (or (save-excursion (outline-next-heading) (point))
                        (point-max)))
              (text (buffer-substring-no-properties (point-min) end)))
         (string-trim
          (replace-regexp-in-string "\\`\\(?:[ \t]*#\\+[a-zA-Z_]+:.*\n?\\)+" "" text)))))))

(defun k-agenda-model-reference-body-for-id (id)
  "Return the free-text body for ID, which may be a reference file's
absolute path (a tree root node -- see `k-agenda-model-reference-preamble')
or a heading id within one of `k-agenda-model-reference-files' (see
`k-agenda-model--entry-body'), re-resolved fresh each call exactly like
`k-agenda-model-body-for-id'. Returns nil if ID doesn't resolve to
anything current."
  (let ((files (k-agenda-model-reference-files)))
    (if (cl-some (lambda (f) (k-agenda-model--file-name-equal-p (expand-file-name id) f)) files)
        (k-agenda-model-reference-preamble id)
      (catch 'k-agenda-model-reference-body-found
        (org-map-entries
         (lambda ()
           (when (equal (k-agenda-model--entry-id) id)
             (throw 'k-agenda-model-reference-body-found (k-agenda-model--entry-body))))
         nil files)
        nil))))

(provide 'k-agenda-model)
;;; k-agenda-model.el ends here
