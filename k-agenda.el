;;; k-agenda.el --- Web dashboard for org-agenda -*- lexical-binding: t; -*-

;; Author: Rukmal Dias
;; Version: 0.1.0
;; Package-Requires: ((emacs "27.1") (websocket "1.13") (simple-httpd "1.5.1"))
;; Keywords: org, outlines, hypermedia

;;; Commentary:

;; K-Agenda serves a web UI (React app shipped in ./out) that visualizes
;; `org-agenda-files', with live updates pushed from Emacs to the browser
;; over a websocket whenever a task's TODO state changes or an agenda
;; file is saved. Read-only in this version: the web UI never writes
;; back to your Org files.
;;
;; Usage:
;;   M-x k-agenda-open

;;; Code:

(require 'k-agenda-server)
(require 'k-agenda-ws)

(defgroup k-agenda nil
  "Web dashboard for org-agenda."
  :group 'org
  :prefix "k-agenda-")

(defcustom k-agenda-http-port 35920
  "Port the static frontend is served on.
Deliberately outside org-roam-ui's 35901/35902 range so both packages
can run at the same time."
  :type 'integer
  :group 'k-agenda)

(defcustom k-agenda-ws-port 35921
  "Port the live-sync websocket listens on.
Must differ from `k-agenda-http-port': HTTP and websocket are two
independent listeners and cannot share a port."
  :type 'integer
  :group 'k-agenda)

(defcustom k-agenda-open-on-start t
  "When non-nil, `k-agenda-mode' opens the dashboard in a browser on enable."
  :type 'boolean
  :group 'k-agenda)

(defcustom k-agenda-browser-function #'browse-url
  "Function used to open the dashboard URL. Called with one argument, the URL."
  :type 'function
  :group 'k-agenda)

(defcustom k-agenda-debounce-seconds 0.5
  "Seconds to wait after an Org edit before broadcasting a new snapshot.
Coalesces bursts of rapid edits (e.g. a state change immediately
followed by a save) into a single websocket send."
  :type 'float
  :group 'k-agenda)

(defun k-agenda--url ()
  "Return the URL the dashboard is served at."
  (format "http://localhost:%d" k-agenda-http-port))

;;;###autoload
(define-minor-mode k-agenda-mode
  "Global minor mode running the k-agenda web dashboard's backend.

Starts the static file server and the live-sync websocket server, and
installs the hooks that keep the browser in sync with `org-agenda-files'.
Read-only: nothing here ever writes back to your Org files."
  :global t
  :group 'k-agenda
  (if k-agenda-mode
      (progn
        (k-agenda-server-start k-agenda-http-port)
        (k-agenda-ws-start k-agenda-ws-port)
        (when k-agenda-open-on-start
          (funcall k-agenda-browser-function (k-agenda--url))))
    (k-agenda-ws-stop)
    (k-agenda-server-stop)))

;;;###autoload
(defun k-agenda-open ()
  "Ensure `k-agenda-mode' is enabled, then open the dashboard in a browser."
  (interactive)
  (unless k-agenda-mode
    (k-agenda-mode 1))
  (funcall k-agenda-browser-function (k-agenda--url)))

;;;###autoload
(defun k-agenda-refresh ()
  "Force an immediate broadcast of the current Org state to all clients.
Useful for debugging without waiting on the save/state-change hooks."
  (interactive)
  (if k-agenda-mode
      (k-agenda-ws-refresh)
    (user-error "k-agenda-mode is not enabled")))

(provide 'k-agenda)
;;; k-agenda.el ends here
