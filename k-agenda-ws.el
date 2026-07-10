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
  "Non-nil when the current buffer visits one of `org-agenda-files'.

Both sync hooks are global (`org-after-todo-state-change-hook',
`after-save-hook'), so this guard is required -- the user edits other,
non-agenda Org files too, and those edits must not trigger a broadcast."
  (let ((file (buffer-file-name)))
    (and file (member (expand-file-name file) (k-agenda-model-agenda-files)))))

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
                           :on-close #'k-agenda-ws--on-close))
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
