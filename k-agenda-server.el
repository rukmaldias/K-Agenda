;;; k-agenda-server.el --- Static HTTP server for k-agenda -*- lexical-binding: t; -*-

;; Thin wrapper around `simple-httpd', which serves any file under
;; `httpd-root' automatically once started -- no servlet needed for the
;; built frontend's static assets.

;;; Code:

(require 'simple-httpd)

(defvar k-agenda-server--package-dir
  (file-name-directory (or load-file-name buffer-file-name))
  "Directory this package is installed in.")

(defvar k-agenda-app-build-dir
  (expand-file-name "out" k-agenda-server--package-dir)
  "Directory containing the built frontend static assets.
Populated by `npm run build` in the package's web/ subdirectory, which
targets this location (`web/vite.config.ts' sets `build.outDir' to
`../out').")

(defun k-agenda-server-start (port)
  "Start (or restart) the static file server on PORT."
  (setq httpd-port port)
  (setq httpd-root k-agenda-app-build-dir)
  (httpd-start))

(defun k-agenda-server-stop ()
  "Stop the static file server if it is running."
  (when (httpd-running-p)
    (httpd-stop)))

(provide 'k-agenda-server)
;;; k-agenda-server.el ends here
