;;; k-agenda-ws.el --- Live-sync websocket layer for k-agenda -*- lexical-binding: t; -*-

;; Pushes a fresh `k-agenda-protocol' snapshot to every connected browser
;; tab whenever a scoped Org file changes. Two hooks feed the same
;; debounced broadcast: `org-after-todo-state-change-hook' fires on
;; `C-c C-t' cycling, before the buffer is saved, so state changes are
;; visible in the browser immediately; `after-save-hook' catches
;; everything else (retitling, rescheduling, new headings).

;;; Code:

(require 'websocket)
(require 'cl-lib)
(require 'json)
(require 'k-agenda-model)
(require 'k-agenda-protocol)

(defvar k-agenda-debounce-seconds)     ; defined in k-agenda.el, loaded before this file runs

(defvar k-agenda-ws--server nil
  "The `websocket-server' connection object, or nil if not running.")

(defvar k-agenda-ws--clients nil
  "List of currently-open client websockets.")

(defvar k-agenda-ws--debounce-timer nil
  "Pending debounce timer for the next broadcast, or nil.")

(defun k-agenda-ws--on-open (ws)
  "Track WS and push it an immediate snapshot, without waiting for an edit."
  (push ws k-agenda-ws--clients)
  (websocket-send-text ws (k-agenda-protocol-encode-snapshot)))

(defun k-agenda-ws--on-close (ws)
  "Stop tracking WS."
  (setq k-agenda-ws--clients (delq ws k-agenda-ws--clients)))

(defun k-agenda-ws--on-message (ws frame)
  "Handle an incoming client request.

`task-body-request': sent when the browser opens a task's detail modal
-- a full entry body isn't worth broadcasting for every task on every
snapshot, so it's fetched on demand instead.

`reference-body-request': the same on-demand fetch, for a References tree
node instead of a task -- see `k-agenda-protocol-encode-reference-body'.

`change-state-request': sent when a K Board drag-and-drop is confirmed
-- the only mutating request type. Re-validated server-side regardless
of what the client already checked (see
`k-agenda-protocol-handle-change-state-request'); on success this saves
the buffer, which fires `after-save-hook' and so triggers the normal
debounced broadcast to every client shortly after.

Both responses go straight back to the requesting socket only, never
broadcast to others."
  (condition-case err
      (let* ((payload (json-read-from-string (websocket-frame-payload frame)))
             (type (cdr (assoc 'type payload))))
        (cond
         ((equal type "task-body-request")
          (let ((id (cdr (assoc 'id payload))))
            (when id
              (websocket-send-text ws (k-agenda-protocol-encode-task-body id)))))
         ((equal type "reference-body-request")
          (let ((id (cdr (assoc 'id payload))))
            (when id
              (websocket-send-text ws (k-agenda-protocol-encode-reference-body id)))))
         ((equal type "change-state-request")
          (let ((request-id (cdr (assoc 'requestId payload)))
                (id (cdr (assoc 'id payload)))
                (from-state (cdr (assoc 'fromState payload)))
                (to-state (cdr (assoc 'toState payload))))
            (when (and id from-state to-state)
              (websocket-send-text
               ws (k-agenda-protocol-handle-change-state-request
                   request-id id from-state to-state)))))))
    (error (message "k-agenda: malformed client message ignored: %s" err))))

(defun k-agenda-ws--broadcast ()
  "Send a fresh snapshot to every live client. Prunes closed sockets first."
  (setq k-agenda-ws--debounce-timer nil)
  (setq k-agenda-ws--clients (cl-remove-if-not #'websocket-openp k-agenda-ws--clients))
  (when k-agenda-ws--clients
    (let ((payload (k-agenda-protocol-encode-snapshot)))
      (dolist (ws k-agenda-ws--clients)
        (websocket-send-text ws payload)))))

(defun k-agenda-ws-schedule-broadcast ()
  "Debounce and (re)schedule a broadcast; coalesces bursts of edits."
  (when k-agenda-ws--debounce-timer
    (cancel-timer k-agenda-ws--debounce-timer))
  (setq k-agenda-ws--debounce-timer
        (run-with-timer k-agenda-debounce-seconds nil #'k-agenda-ws--broadcast)))

(defun k-agenda-ws--current-buffer-in-scope-p ()
  "Non-nil when the current buffer visits one of `org-agenda-files' or one
of `k-agenda-model-reference-files'.

Both sync hooks are global (`org-after-todo-state-change-hook',
`after-save-hook'), so this guard is required -- the user edits other,
non-agenda Org files too, and those edits must not trigger a broadcast.
Reference files are included so editing a reference doc in Emacs
live-updates the browser's References tree, the same as a project file."
  (let ((file (buffer-file-name)))
    (and file
         (let ((expanded (expand-file-name file)))
           (or (cl-some (lambda (f) (k-agenda-model--file-name-equal-p expanded f))
                        (k-agenda-model-agenda-files))
               (cl-some (lambda (f) (k-agenda-model--file-name-equal-p expanded f))
                        (k-agenda-model-reference-files)))))))

(defun k-agenda-ws--on-todo-state-change (&rest _)
  (when (k-agenda-ws--current-buffer-in-scope-p)
    (k-agenda-ws-schedule-broadcast)))

(defun k-agenda-ws--on-after-save ()
  (when (k-agenda-ws--current-buffer-in-scope-p)
    (k-agenda-ws-schedule-broadcast)))

(defun k-agenda-ws-start (port)
  "Start the websocket server on PORT and install the sync hooks."
  (setq k-agenda-ws--clients nil)
  (setq k-agenda-ws--server
        (websocket-server port
                           :on-open #'k-agenda-ws--on-open
                           :on-close #'k-agenda-ws--on-close
                           :on-message #'k-agenda-ws--on-message))
  (add-hook 'org-after-todo-state-change-hook #'k-agenda-ws--on-todo-state-change)
  (add-hook 'after-save-hook #'k-agenda-ws--on-after-save))

(defun k-agenda-ws-stop ()
  "Remove the sync hooks, cancel any pending broadcast, and close the server."
  (remove-hook 'org-after-todo-state-change-hook #'k-agenda-ws--on-todo-state-change)
  (remove-hook 'after-save-hook #'k-agenda-ws--on-after-save)
  (when k-agenda-ws--debounce-timer
    (cancel-timer k-agenda-ws--debounce-timer)
    (setq k-agenda-ws--debounce-timer nil))
  (when k-agenda-ws--server
    (websocket-server-close k-agenda-ws--server)
    (setq k-agenda-ws--server nil))
  (setq k-agenda-ws--clients nil))

(defun k-agenda-ws-refresh ()
  "Force an immediate (non-debounced) broadcast to all clients."
  (k-agenda-ws--broadcast))

(provide 'k-agenda-ws)
;;; k-agenda-ws.el ends here
