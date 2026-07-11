;;; k-agenda-workflow.el --- TODO-state transition rules for k-agenda -*- lexical-binding: t; -*-

;; Encodes which TODO-state transitions are meaningful in this GTD
;; workflow (per the user's own transition diagram), independent of
;; org-todo-keywords' bare sequence order -- Org's own keyword sequence
;; doesn't imply a state-machine graph, and several sequence-adjacent
;; pairs (e.g. WAITING -> INACTIVE) aren't actually meaningful moves.
;;
;; Used both to validate a drag-and-drop request server-side (never
;; trust the client for a mutating action) and to build the rejection
;; message shown for a blocked move.

;;; Code:

(defconst k-agenda-workflow--valid-transitions
  '(("INACTIVE" . "TODO")
    ("TODO" . "NEXT")
    ("NEXT" . "WAITING")
    ("WAITING" . "TODO")
    ("WAITING" . "NEXT")
    ("NEXT" . "DONE")
    ("TODO" . "DONE")
    ("MEETING" . "DONE")
    ("TODO" . "CANCELLED")
    ("NEXT" . "CANCELLED")
    ("WAITING" . "CANCELLED")
    ("INACTIVE" . "CANCELLED")
    ("MEETING" . "CANCELLED"))
  "Every (FROM . TO) pair that is a meaningful move in this workflow.
Anything not listed here is blocked when attempted via drag-and-drop --
whether it is a named anti-pattern (see
`k-agenda-workflow--anti-pattern-messages') or simply not part of the
graph at all.")

(defconst k-agenda-workflow--anti-pattern-messages
  (list
   (cons (cons "NEXT" "INACTIVE")
         "Jumps backwards: if a task was urgent enough to be NEXT and you want to shelve it long-term, move it back to TODO first (or split it). Going straight to INACTIVE usually means hiding a failed commitment.")
   (cons (cons "DONE" "WAITING")
         "The zombie task: a task can't be done and blocked at the same time. If new work comes up from a finished task, create a new heading instead of reviving this one.")
   (cons (cons "CANCELLED" "DONE")
         "Contradictory: a task can't be abandoned and finished at the same time.")
   (cons (cons "TODO" "MEETING")
         "MEETING is an event, not a process -- headings don't turn into meetings by changing state. Create a new MEETING heading directly instead.")
   (cons (cons "NEXT" "MEETING")
         "MEETING is an event, not a process -- headings don't turn into meetings by changing state. Create a new MEETING heading directly instead.")
   (cons (cons "WAITING" "MEETING")
         "MEETING is an event, not a process -- headings don't turn into meetings by changing state. Create a new MEETING heading directly instead.")
   (cons (cons "INACTIVE" "MEETING")
         "MEETING is an event, not a process -- headings don't turn into meetings by changing state. Create a new MEETING heading directly instead.")
   (cons (cons "MEETING" "TODO")
         "MEETING is an event, not a process: it only ever resolves to Completed or Cancelled. If a meeting generates action items, add them as separate TODO sub-tasks under the meeting heading.")
   (cons (cons "MEETING" "NEXT")
         "MEETING is an event, not a process: it only ever resolves to Completed or Cancelled. If a meeting generates action items, add them as separate TODO sub-tasks under the meeting heading.")
   (cons (cons "MEETING" "WAITING")
         "MEETING is an event, not a process: it only ever resolves to Completed or Cancelled. If a meeting generates action items, add them as separate TODO sub-tasks under the meeting heading."))
  "Specific explanations for transitions worth naming individually.
Anything invalid but not in this table gets a generic message instead
-- see `k-agenda-workflow-rejection-message'.")

(defun k-agenda-workflow-valid-p (from to)
  "Non-nil if FROM -> TO is a meaningful transition (or a same-state no-op)."
  (or (equal from to)
      (and (member (cons from to) k-agenda-workflow--valid-transitions) t)))

(defun k-agenda-workflow--display-word (state)
  "Human-readable word for STATE, matching the labels used elsewhere in
the UI (DONE -> \"Completed\"; every other state name already reads
fine as-is)."
  (if (equal state "DONE") "Completed" state))

(defun k-agenda-workflow-rejection-message (from to)
  "Explanation for why FROM -> TO is blocked.
Only meaningful when `k-agenda-workflow-valid-p' is nil for the same pair."
  (or (cdr (assoc (cons from to) k-agenda-workflow--anti-pattern-messages))
      (format "%s → %s isn't part of the standard workflow."
              (k-agenda-workflow--display-word from)
              (k-agenda-workflow--display-word to))))

(provide 'k-agenda-workflow)
;;; k-agenda-workflow.el ends here
