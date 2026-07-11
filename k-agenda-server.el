;;; k-agenda-server.el --- Static HTTP server for k-agenda -*- lexical-binding: t; -*-

;; A minimal, self-contained static file server -- deliberately NOT
;; built on `simple-httpd', even though that would otherwise be the
;; obvious choice (and is what this file used originally).
;;
;; `simple-httpd' keeps its server process in a single global variable
;; (`httpd--server') and `httpd-start' unconditionally stops whatever
;; server is already running before starting its own -- there is only
;; ever one `simple-httpd' server per Emacs process, full stop (see its
;; own docstring). org-roam-ui also runs on `simple-httpd'. So if both
;; packages are active in the same Emacs, whichever calls `httpd-start'
;; most recently silently kills the other's server out from under it --
;; and the victim has no way to notice, so its own mode stays "on" while
;; actually serving nothing. Implementing our own server here, with our
;; own process variable, means k-agenda and org-roam-ui (or anything
;; else built on `simple-httpd') can run at the same time without
;; fighting over a shared global.

;;; Code:

(require 'url-util)

(defvar k-agenda-server--package-dir
  (file-name-directory (or load-file-name buffer-file-name))
  "Directory this package is installed in.")

(defvar k-agenda-app-build-dir
  (expand-file-name "out" k-agenda-server--package-dir)
  "Directory containing the built frontend static assets.
Populated by `npm run build' in the package's web/ subdirectory, which
targets this location (`web/vite.config.ts' sets `build.outDir' to
`../out').")

(defvar k-agenda-server--process nil
  "This server's network process, or nil if not running.")

(defconst k-agenda-server--mime-types
  '(("html" . "text/html; charset=utf-8")
    ("js" . "text/javascript; charset=utf-8")
    ("mjs" . "text/javascript; charset=utf-8")
    ("css" . "text/css; charset=utf-8")
    ("json" . "application/json; charset=utf-8")
    ("svg" . "image/svg+xml")
    ("png" . "image/png")
    ("jpg" . "image/jpeg")
    ("ico" . "image/x-icon")
    ("woff" . "font/woff")
    ("woff2" . "font/woff2"))
  "Extension -> Content-Type, covering what a Vite build actually ships.")

(defun k-agenda-server--mime-type (file)
  (or (cdr (assoc (downcase (or (file-name-extension file) "")) k-agenda-server--mime-types))
      "application/octet-stream"))

(defun k-agenda-server--resolve-path (url-path)
  "Resolve URL-PATH to a readable file under `k-agenda-app-build-dir',
or nil if it doesn't exist or would escape that directory (blocks a
\"..\" traversal attempt). A path with no extension (i.e. a client-side
route like /calendar) falls back to index.html -- the app is a single-
page app using HashRouter, so the server itself never needs to know
its routes; only the literal `/#/...' fragment (never sent to the
server at all) and static asset paths matter here."
  (let* ((clean (car (split-string (url-unhex-string url-path) "[?#]")))
         (relative (string-remove-prefix "/" clean))
         (relative (if (or (string-empty-p relative) (string-suffix-p "/" relative))
                       (concat relative "index.html")
                     relative))
         (root (file-name-as-directory (expand-file-name k-agenda-app-build-dir)))
         (resolved (expand-file-name relative root)))
    (cond
     ((not (string-prefix-p root resolved)) nil)
     ((file-regular-p resolved) resolved)
     ;; Only fall back to the SPA shell for extension-less paths (client
     ;; routes like /calendar). A path with an extension that doesn't
     ;; exist (e.g. a stale /assets/*.js reference) is a real 404, not
     ;; a route -- silently serving index.html there would mask it.
     ((not (file-name-extension relative))
      (let ((index (expand-file-name "index.html" root)))
        (when (file-regular-p index) index)))
     (t nil))))

(defun k-agenda-server--send-response (proc status content-type body)
  (process-send-string
   proc
   (concat (format "HTTP/1.1 %s\r\n" status)
           (format "Content-Type: %s\r\n" content-type)
           (format "Content-Length: %d\r\n" (string-bytes body))
           "Connection: close\r\n\r\n"))
  (process-send-string proc body)
  (ignore-errors (delete-process proc)))

(defun k-agenda-server--filter (proc chunk)
  "Handle one HTTP request. Assumes the request line arrives in a single
CHUNK, which holds in practice for a plain GET with no body -- browsers
always send request line + headers as one TCP write, and this is a
loopback-only, single-user, handful-of-static-files server, not a
general-purpose one."
  (condition-case err
      (if (string-match "\\`GET \\([^ ]+\\) HTTP/[0-9.]+" chunk)
          (let* ((url-path (match-string 1 chunk))
                 (file (k-agenda-server--resolve-path url-path)))
            (if file
                (let ((body (with-temp-buffer
                              (set-buffer-multibyte nil)
                              (insert-file-contents-literally file)
                              (buffer-string))))
                  (k-agenda-server--send-response
                   proc "200 OK" (k-agenda-server--mime-type file) body))
              (k-agenda-server--send-response
               proc "404 Not Found" "text/plain; charset=utf-8" "Not found")))
        (k-agenda-server--send-response
         proc "400 Bad Request" "text/plain; charset=utf-8" "Bad request"))
    (error
     (message "k-agenda: request error: %s" err)
     (ignore-errors (delete-process proc)))))

(defun k-agenda-server-start (port)
  "Start (or restart) the static file server on PORT, loopback-only."
  (k-agenda-server-stop)
  (setq k-agenda-server--process
        (make-network-process
         :name "k-agenda-httpd"
         :service port
         :server t
         :host 'local
         :family 'ipv4
         :filter #'k-agenda-server--filter
         :coding 'binary
         :noquery t)))

(defun k-agenda-server-stop ()
  "Stop the static file server if it is running."
  (when (process-live-p k-agenda-server--process)
    (delete-process k-agenda-server--process))
  (setq k-agenda-server--process nil))

(defun k-agenda-server-running-p ()
  (process-live-p k-agenda-server--process))

(provide 'k-agenda-server)
;;; k-agenda-server.el ends here
