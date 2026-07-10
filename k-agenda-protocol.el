;;; k-agenda-protocol.el --- JSON wire protocol for k-agenda -*- lexical-binding: t; -*-

;; Transforms k-agenda-model.el's plist entries into the JSON snapshot
;; payload documented in the project plan. Uses Emacs's native
;; `json-serialize' (Emacs 27+), which requires array-valued fields to be
;; vectors, not lists -- a plain list is otherwise mistaken for an
;; alist/plist and either errors or serializes as an object. See
;; `k-agenda-protocol--vec'.

;;; Code:

(require 'k-agenda-model)
(require 'cl-lib)

(defun k-agenda-protocol--vec (list)
  "Convert LIST to a vector, so `json-serialize' emits a JSON array.
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

(defconst k-agenda-protocol--fallback-type-by-state
  '(("TODO" . "Todo")
    ("NEXT" . "Task")
    ("WAITING" . "Waiting")
    ("INACTIVE" . "Inactive")
    ("MEETING" . "Meeting")
    ("DONE" . "Completed")
    ("CANCELLED" . "Cancelled"))
  "Best-guess Type label from `todoState', used for headings captured
before `:CAPTURE_TYPE:' properties existed. NEXT maps to \"Task\" (not
\"Next\") to match the org-capture-templates template of the same name.")

(defun k-agenda-protocol--type-for (entry)
  "Resolve ENTRY's display Type: its `:CAPTURE_TYPE:' property if present,
else a best-guess from `:todo-state', else nil."
  (or (plist-get entry :capture-type)
      (cdr (assoc (plist-get entry :todo-state) k-agenda-protocol--fallback-type-by-state))))

(defun k-agenda-protocol--todo-keywords-payload ()
  "Build the `todoKeywords' array: one entry per keyword, in sequence order."
  (let ((specs (k-agenda-protocol--todo-keyword-specs))
        (index 0)
        result)
    (dolist (spec specs)
      (let ((name (car spec)))
        (push (list (cons 'name name)
                    (cons 'label (k-agenda-protocol--label name))
                    (cons 'faceHex (or (k-agenda-protocol--face-hex name) :null))
                    (cons 'sequenceIndex index)
                    (cons 'done (if (cdr spec) t :false)))
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
        (cons 'todoState (or (plist-get entry :todo-state) :null))
        (cons 'type (or (k-agenda-protocol--type-for entry) :null))
        (cons 'priority (or (plist-get entry :priority) :null))
        (cons 'tags (k-agenda-protocol--vec (plist-get entry :tags)))
        (cons 'project (or (plist-get entry :project) :null))
        (cons 'file (plist-get entry :file))
        (cons 'level (plist-get entry :level))
        (cons 'olp (k-agenda-protocol--vec (plist-get entry :olp)))
        (cons 'scheduled (or (plist-get entry :scheduled) :null))
        (cons 'deadline (or (plist-get entry :deadline) :null))
        (cons 'closed (or (plist-get entry :closed) :null))))

(defun k-agenda-protocol--tasks-payload (entries)
  "Build the `tasks' array: entries with a TODO state OR a `:CAPTURE_TYPE:'
property. Plain project-anchor/prose headings (neither) are excluded --
they exist only to define project buckets. A `:CAPTURE_TYPE:' entry with
no TODO state (e.g. a Diary or Idea capture) is included with a null
`todoState' so it's still visible as a typed, state-less item."
  (k-agenda-protocol--vec
   (mapcar #'k-agenda-protocol--task-payload
           (cl-remove-if-not
            (lambda (e) (or (plist-get e :todo-state) (plist-get e :capture-type)))
            entries))))

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
  (json-serialize (list (cons 'type "snapshot")
                         (cons 'data (k-agenda-protocol-build-snapshot)))))

(provide 'k-agenda-protocol)
;;; k-agenda-protocol.el ends here
