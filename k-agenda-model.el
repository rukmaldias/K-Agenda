;;; k-agenda-model.el --- Org data model for k-agenda -*- lexical-binding: t; -*-

;; This file has no network dependency by design: it must be loadable and
;; testable headless (see k-agenda-model-test.el), independent of
;; k-agenda-server.el / k-agenda-ws.el.

;;; Code:

(require 'org)
(require 'cl-lib)

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

(defun k-agenda-model--project-file-p (file)
  "Non-nil if FILE is one of `k-agenda-model-project-files'."
  (member (expand-file-name file) (k-agenda-model-project-files)))

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
        :capture-type (org-entry-get (point) "CAPTURE_TYPE")))

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

(provide 'k-agenda-model)
;;; k-agenda-model.el ends here
