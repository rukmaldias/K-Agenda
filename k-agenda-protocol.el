;;; k-agenda-protocol.el --- JSON wire protocol for k-agenda -*- lexical-binding: t; -*-

;; Transforms k-agenda-model.el's plist entries into the JSON snapshot
;; payload documented in the project plan.
;;
;; Uses the pure-Lisp `json.el' (`json-encode'), not the native
;; `json-serialize' -- this machine's Emacs build has no libjansson
;; linked (`system-configuration-features' omits "JSON"), so
;; `json-serialize' falls back to Emacs's newer built-in pure-Lisp JSON
;; implementation, which was found to corrupt multibyte characters (e.g.
;; an em dash in a real heading came out as invalid UTF-8 bytes,
;; reproduced with both file-read and literal Lisp strings). `json-encode'
;; round-trips the same strings correctly. Array-valued fields still need
;; to be real vectors, not lists -- see `k-agenda-protocol--vec' -- and
;; `nil' is `json.el''s null marker (`json-null''s default), so a plain
;; `(plist-get entry :foo)' already serializes as `null' when absent; no
;; extra wrapping needed.

;;; Code:

(require 'k-agenda-model)
(require 'k-agenda-workflow)
(require 'cl-lib)
(require 'json)

(defun k-agenda-protocol--vec (list)
  "Convert LIST to a vector, so `json-encode' emits a JSON array.
An empty LIST becomes `[]', never `{}' or `null'."
  (apply #'vector list))

(defun k-agenda-protocol--strip-fast-access (keyword)
  "Strip a trailing fast-selection cursor like \"(t)\" from KEYWORD."
  (replace-regexp-in-string "(.*)\\'" "" keyword))

(defun k-agenda-protocol--todo-keyword-specs ()
  "Return an ordered list of (NAME . DONE-P) parsed from `org-todo-keywords'.

Keywords after the \"|\" separator in a sequence are done-states; this
mirrors Org's own convention without requiring an Org buffer to be open
to populate the buffer-local `org-todo-keywords-1'/`org-done-keywords'."
  (let (specs)
    (dolist (sequence org-todo-keywords)
      (let ((keywords (mapcar #'k-agenda-protocol--strip-fast-access (cdr sequence)))
            (done nil))
        (dolist (kw keywords)
          (if (equal kw "|")
              (setq done t)
            (push (cons kw done) specs)))))
    (nreverse specs)))

(defun k-agenda-protocol--face-hex (keyword)
  "Best-effort hex color string for KEYWORD from `org-todo-keyword-faces'.

Only plain color-string values are resolved (the form the user's config
uses); a face-plist value would need its `:foreground' extracted, and a
face-symbol value would need `face-foreground' -- neither is needed for
this project's real config, so both fall back to nil rather than
guessing."
  (let ((spec (cdr (assoc keyword org-todo-keyword-faces))))
    (cond
     ((stringp spec) spec)
     ((and (listp spec) (plist-member spec :foreground)) (plist-get spec :foreground))
     (t nil))))

(defun k-agenda-protocol--label (keyword)
  "Display label for KEYWORD: title-cased, except DONE -> \"Completed\"."
  (if (equal keyword "DONE")
      "Completed"
    (concat (upcase (substring keyword 0 1)) (downcase (substring keyword 1)))))

(defconst k-agenda-protocol--known-types '("Todo" "Meeting" "Diary" "Idea" "Task")
  "The only Type values K-Agenda ever displays -- the exact set the user's
org-capture-templates stamp into a heading's `:CAPTURE_TYPE:' property.
Matched case-insensitively so a stray typo in casing still resolves, but
never guessed from `:todo-state', tags, or any other field: no
`:CAPTURE_TYPE:' property (or an unrecognized value) means no Type
(blank in the UI).")

(defun k-agenda-protocol--type-for (entry)
  "Resolve ENTRY's Type from its `:capture-type' property, matched
case-insensitively against `k-agenda-protocol--known-types'. Returns the
canonically-cased name, or nil if the property is absent or its value
isn't one of the 5 known types."
  (let ((value (plist-get entry :capture-type)))
    (when value
      (cl-find-if (lambda (known) (string-equal (downcase known) (downcase value)))
                  k-agenda-protocol--known-types))))

(defun k-agenda-protocol--todo-keywords-payload ()
  "Build the `todoKeywords' array: one entry per keyword, in sequence order."
  (let ((specs (k-agenda-protocol--todo-keyword-specs))
        (index 0)
        result)
    (dolist (spec specs)
      (let ((name (car spec)))
        (push (list (cons 'name name)
                    (cons 'label (k-agenda-protocol--label name))
                    (cons 'faceHex (k-agenda-protocol--face-hex name))
                    (cons 'sequenceIndex index)
                    (cons 'done (if (cdr spec) t :json-false)))
              result))
      (setq index (1+ index)))
    (k-agenda-protocol--vec (nreverse result))))

(defun k-agenda-protocol--stats-payload (entries specs)
  "Build the `stats' object: total project count + per-keyword counts.
SPECS is the result of `k-agenda-protocol--todo-keyword-specs', used so
every keyword has a zero-filled entry even if no heading currently has
that state."
  (let ((counts (k-agenda-model-state-counts entries)))
    (list (cons 'totalProjects (k-agenda-model-total-projects entries))
          (cons 'counts (mapcar (lambda (spec)
                                   (cons (intern (car spec))
                                         (or (cdr (assoc (car spec) counts)) 0)))
                                 specs)))))

(defun k-agenda-protocol--projects-payload (entries)
  "Build the `projects' array from every project's stats in ENTRIES.
Sent in full (not capped) so both the Dashboard's top-N widget and the
dedicated Projects screen can be built from the same payload -- the
Dashboard just slices client-side."
  (k-agenda-protocol--vec
   (mapcar (lambda (p)
             (list (cons 'name (plist-get p :name))
                   (cons 'file (plist-get p :file))
                   (cons 'total (plist-get p :total))
                   (cons 'done (plist-get p :done))
                   (cons 'cancelled (plist-get p :cancelled))
                   (cons 'percent (plist-get p :percent))))
           (k-agenda-model-projects-sorted entries))))

(defun k-agenda-protocol--task-payload (entry)
  "Build one `tasks[]' element from ENTRY (a k-agenda-model plist)."
  (list (cons 'id (plist-get entry :id))
        (cons 'title (plist-get entry :title))
        (cons 'todoState (plist-get entry :todo-state))
        (cons 'type (k-agenda-protocol--type-for entry))
        (cons 'priority (plist-get entry :priority))
        (cons 'tags (k-agenda-protocol--vec (plist-get entry :tags)))
        (cons 'project (plist-get entry :project))
        (cons 'file (plist-get entry :file))
        (cons 'level (plist-get entry :level))
        (cons 'olp (k-agenda-protocol--vec (plist-get entry :olp)))
        (cons 'scheduled (plist-get entry :scheduled))
        (cons 'deadline (plist-get entry :deadline))
        (cons 'closed (plist-get entry :closed))
        (cons 'effort (plist-get entry :effort))))

(defun k-agenda-protocol--tasks-payload (entries)
  "Build the `tasks' array: entries with a TODO state OR a recognized
`:CAPTURE_TYPE:'. Plain project-anchor/prose headings (neither) are
excluded -- they exist only to define project buckets. A typed entry
with no TODO state (e.g. a Diary or Idea capture) is included with a
null `todoState' so it's still visible as a typed, state-less item."
  (k-agenda-protocol--vec
   (mapcar #'k-agenda-protocol--task-payload
           (cl-remove-if-not
            (lambda (e) (or (plist-get e :todo-state) (k-agenda-protocol--type-for e)))
            entries))))

(defun k-agenda-protocol--reference-node-payload (node)
  "Recursively convert NODE (a `k-agenda-model-reference-tree' plist, either
a file-root or a nested heading) to its JSON alist form."
  (list (cons 'id (plist-get node :id))
        (cons 'title (plist-get node :title))
        (cons 'level (plist-get node :level))
        (cons 'tags (k-agenda-protocol--vec (plist-get node :tags)))
        (cons 'children (k-agenda-protocol--vec
                          (mapcar #'k-agenda-protocol--reference-node-payload
                                  (plist-get node :children))))))

(defun k-agenda-protocol--reference-tree-payload ()
  "Build the `referenceTree' array.

Deliberately NOT part of the main snapshot (contrast `projects'/`tasks'
above): building it opens and parses every file under
`k-agenda-references-dir' (see `k-agenda-model-reference-tree'), which
with 90+ reference docs was expensive enough to noticeably stall the app
on every snapshot -- initial connect, and every debounced broadcast
after ANY scoped edit, not just a reference-file one. Fetched on demand
instead, via `k-agenda-protocol-encode-reference-tree'."
  (k-agenda-protocol--vec
   (mapcar #'k-agenda-protocol--reference-node-payload (k-agenda-model-reference-tree))))

(defun k-agenda-protocol-build-snapshot ()
  "Collect the current Org state and build the full snapshot data object."
  (let* ((entries (k-agenda-model-collect-entries))
         (specs (k-agenda-protocol--todo-keyword-specs)))
    (list (cons 'generatedAt (format-time-string "%Y-%m-%dT%H:%M:%S%:z"))
          (cons 'todoKeywords (k-agenda-protocol--todo-keywords-payload))
          (cons 'stats (k-agenda-protocol--stats-payload entries specs))
          (cons 'projects (k-agenda-protocol--projects-payload entries))
          (cons 'tasks (k-agenda-protocol--tasks-payload entries)))))

(defun k-agenda-protocol-encode-snapshot ()
  "Return the current snapshot as a JSON string, wrapped in the envelope."
  (let ((json-false :json-false)
        (json-null nil))
    (json-encode (list (cons 'type "snapshot")
                        (cons 'data (k-agenda-protocol-build-snapshot))))))

(defun k-agenda-protocol-encode-task-body (id)
  "Look up ID's body (see `k-agenda-model-body-for-id') and return the
`task-body' response as a JSON string. `body' is null if ID doesn't
resolve to any current entry (stale id, or a real request for a
heading that no longer exists)."
  (let ((json-false :json-false)
        (json-null nil))
    (json-encode (list (cons 'type "task-body")
                        (cons 'id id)
                        (cons 'body (k-agenda-model-body-for-id id))))))

(defun k-agenda-protocol-encode-reference-tree ()
  "Return the References tree as a `reference-tree' response, JSON-encoded.
Sent on request (when the browser opens the References page) and pushed
again, unprompted, to every client after a reference file is edited --
see `k-agenda-ws--on-message' and `k-agenda-ws--schedule-reference-broadcast'."
  (let ((json-false :json-false)
        (json-null nil))
    (json-encode (list (cons 'type "reference-tree")
                        (cons 'tree (k-agenda-protocol--reference-tree-payload))))))

(defun k-agenda-protocol-encode-reference-body (id file)
  "Look up ID's body within FILE (see `k-agenda-model-reference-body-for-id')
and return the `reference-body' response as a JSON string. `body' is
null if FILE isn't a known reference file, or ID doesn't resolve
within it."
  (let ((json-false :json-false)
        (json-null nil))
    (json-encode (list (cons 'type "reference-body")
                        (cons 'id id)
                        (cons 'body (k-agenda-model-reference-body-for-id id file))))))

(defun k-agenda-protocol--change-state-response (request-id ok &optional reason message)
  "Build the `change-state-response' JSON string. REASON/MESSAGE are only
included when non-nil (an OK response has neither)."
  (let ((json-false :json-false)
        (json-null nil))
    (json-encode
     (append (list (cons 'type "change-state-response")
                   (cons 'requestId request-id)
                   (cons 'ok (if ok t :json-false)))
             (when reason (list (cons 'reason reason)))
             (when message (list (cons 'message message)))))))

(defun k-agenda-protocol-handle-change-state-request (request-id id from-state to-state)
  "Validate and, if valid, perform a drag-and-drop TODO-state change.
Re-validates FROM-STATE -> TO-STATE against `k-agenda-workflow-valid-p'
server-side regardless of what the client already checked -- a
mutating action never trusts client-side validation alone. Returns the
`change-state-response' JSON string."
  (cond
   ((equal from-state to-state)
    (k-agenda-protocol--change-state-response request-id t))
   ((not (k-agenda-workflow-valid-p from-state to-state))
    (k-agenda-protocol--change-state-response
     request-id nil "invalid-transition"
     (k-agenda-workflow-rejection-message from-state to-state)))
   (t
    (let ((result (k-agenda-model-change-state id from-state to-state)))
      (if (plist-get result :ok)
          (k-agenda-protocol--change-state-response request-id t)
        (let ((reason (plist-get result :reason)))
          (k-agenda-protocol--change-state-response
           request-id nil reason
           (cond
            ((equal reason "stale")
             (format "This task's state has changed since it was loaded (now: %s). Refresh and try again."
                     (or (plist-get result :current-state) "unknown")))
            ((equal reason "not-found")
             "This task couldn't be found anymore -- it may have been deleted or moved.")
            (t "Couldn't change the task's state.")))))))))

(provide 'k-agenda-protocol)
;;; k-agenda-protocol.el ends here
